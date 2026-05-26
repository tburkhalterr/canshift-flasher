// src/lib/integrity.ts
//
// Pre-flash SHA-256 verification for downloaded firmware artifacts (#4).
//
// The flasher downloads firmware binaries from public CDNs
// (`objects.githubusercontent.com` for GitHub release assets,
// canshift.tmbk.ch for the back-compat fallback) and hands the raw bytes to
// esptool-js for flashing. Without an out-of-band integrity check, a
// compromised mirror or in-flight tampering would be flashed silently.
//
// Mitigation: every release publishes a sibling `.sha256` text file. Before
// any byte reaches `loader.writeFlash`, the hook fetches that sibling and
// recomputes the digest of the downloaded buffer. A mismatch — or a missing
// sibling — aborts the flash unconditionally. There is no opt-out flag.
//
// Ported from canshift-studio/src/services/firmware-integrity.service.ts;
// the Electron IPC indirection is dropped because the renderer here runs in
// the browser and can `fetch` directly.

/**
 * Thrown when the downloaded firmware buffer fails its SHA-256 check against
 * the manifest, or when the `.sha256` sibling is missing/malformed. The hook
 * propagates this through its normal error path so the UI's failure banner
 * already surfaces it; the dedicated type lets callers branch on it.
 */
export class FirmwareIntegrityError extends Error {
  readonly kind: 'mismatch' | 'missing' | 'malformed'
  readonly expected: string | null
  readonly actual: string | null

  constructor(
    kind: 'mismatch' | 'missing' | 'malformed',
    message: string,
    expected: string | null = null,
    actual: string | null = null,
  ) {
    super(message)
    this.name = 'FirmwareIntegrityError'
    this.kind = kind
    this.expected = expected
    this.actual = actual
  }
}

// SHA-256 hex digests are 64 hex chars. The shasum/openssl/coreutils format
// is "<hex>  <filename>" — accept either bare hex or hex + whitespace +
// optional filename. Anything else is rejected as malformed so we never
// "succeed" against a truncated or corrupted manifest.
const SHA256_HEX_RE = /^([0-9a-f]{64})(?:[ \t]+\S.*)?$/i

/** UTF-8 BOM (U+FEFF) — built from an escape so the source file stays ASCII. */
const BOM_RE = new RegExp('^\\uFEFF')

/** Total budget for the manifest fetch — bounds user-facing latency. */
const MANIFEST_FETCH_TIMEOUT_MS = 8_000

/** Hard ceiling for the manifest body. A coreutils-format `.sha256` is well
 *  under 1 KiB; 64 KiB gives ample headroom while preventing a hostile
 *  mirror from streaming a large body in place of the expected digest. */
const MANIFEST_MAX_BYTES = 64 * 1024

/**
 * Parses the body of a `.sha256` sibling. Returns the lowercased 64-char hex
 * digest, or `null` if no usable line was found.
 *
 * Tolerates: leading whitespace, trailing newlines, BOM, blank lines, and the
 * coreutils `<hex>  <filename>` layout. Rejects any other shape — silent
 * acceptance of a malformed file would defeat the whole check.
 */
export function parseSha256Manifest(raw: string): string | null {
  const cleaned = raw.replace(BOM_RE, '').replace(/\r\n?/g, '\n')
  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const match = SHA256_HEX_RE.exec(trimmed)
    if (match?.[1] === undefined) return null
    return match[1].toLowerCase()
  }
  return null
}

/**
 * Computes the SHA-256 of `buffer` using the browser's Web Crypto API.
 * Accepts either an `ArrayBuffer` or `Uint8Array` so callers don't need to
 * juggle representations — the hook already holds the firmware as a
 * `Uint8Array` after `downloadFirmware`. The Uint8Array is copied into a
 * fresh ArrayBuffer so `subtle.digest` gets an unambiguous BufferSource
 * (the lib.dom types reject SharedArrayBuffer-backed views).
 */
export async function computeSha256Hex(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const copy = new Uint8Array(view.byteLength)
  copy.set(view)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Constant-time string comparison. SHA-256 verification doesn't strictly need
 * timing safety (the expected digest is public), but a constant-time path is
 * cheap and avoids any future surprise if this helper is reused for an HMAC
 * trailer (which IS timing-sensitive).
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function fetchManifestText(manifestUrl: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, MANIFEST_FETCH_TIMEOUT_MS)
  // `api.github.com/.../releases/assets/{id}` returns the asset content (bytes)
  // when asked for `application/octet-stream` and JSON metadata otherwise. The
  // `.sha256` sibling is published as a regular release asset, so the same
  // Accept header rule applies as for the binary download.
  const headers: HeadersInit = manifestUrl.startsWith('https://api.github.com/')
    ? { Accept: 'application/octet-stream' }
    : {}
  try {
    const response = await fetch(manifestUrl, {
      cache: 'no-store',
      signal: controller.signal,
      headers,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)} ${response.statusText}`)
    }
    if (!response.body) {
      // Edge case: some test/server combos hand back an empty body. Read text
      // anyway — an empty body parses as malformed below.
      return await response.text()
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      if (received > MANIFEST_MAX_BYTES) {
        await reader.cancel().catch(() => {
          /* best-effort */
        })
        throw new Error(`Manifest exceeds ${String(MANIFEST_MAX_BYTES)} bytes — refusing to read`)
      }
      chunks.push(value)
    }
    const merged = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(merged)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Verifies that the downloaded firmware buffer matches its published SHA-256
 * manifest. Throws `FirmwareIntegrityError` on every failure mode — caller
 * is expected to surface the message to the user and refuse to flash.
 *
 * `manifestUrl` is the sibling URL (typically `${firmwareUrl}.sha256`). On
 * success, returns the verified hex digest (useful for log lines).
 */
export async function verifyFirmwareSha256(
  buffer: ArrayBuffer | Uint8Array,
  manifestUrl: string,
): Promise<string> {
  let manifestBody: string
  try {
    manifestBody = await fetchManifestText(manifestUrl)
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new FirmwareIntegrityError(
      'missing',
      `Firmware rejected: could not fetch SHA-256 manifest (${manifestUrl}). ${reason}`,
    )
  }

  const expected = parseSha256Manifest(manifestBody)
  if (expected === null) {
    throw new FirmwareIntegrityError(
      'malformed',
      `Firmware rejected: SHA-256 manifest at ${manifestUrl} is malformed or empty`,
    )
  }

  const actual = await computeSha256Hex(buffer)
  if (!timingSafeEqualHex(actual, expected)) {
    throw new FirmwareIntegrityError(
      'mismatch',
      `Firmware rejected: SHA-256 mismatch (expected ${expected}, got ${actual}). ` +
        `The downloaded image does not match the publisher's manifest — refusing to flash.`,
      expected,
      actual,
    )
  }

  return actual
}
