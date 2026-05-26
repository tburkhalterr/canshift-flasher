// src/lib/integrity.test.ts
// @vitest-environment node
//
// jsdom's `ArrayBuffer` constructor lives in a different realm than Node's
// `crypto.subtle.digest`, which performs a strict `instanceof ArrayBuffer`
// check. The integrity helpers run in real Chromium in production, so we
// run their tests under the `node` environment where SubtleCrypto sees the
// same ArrayBuffer constructor it expects.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FirmwareIntegrityError,
  computeSha256Hex,
  parseSha256Manifest,
  verifyFirmwareSha256,
} from './integrity'

const ZERO_LEN_DIGEST = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const ABC_DIGEST = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const FAKE_MANIFEST_URL = 'https://example.test/firmware.bin.sha256'

describe('parseSha256Manifest', () => {
  it('parses a bare lowercase hex digest', () => {
    expect(parseSha256Manifest(ABC_DIGEST)).toBe(ABC_DIGEST)
  })

  it('lowercases uppercase hex digests', () => {
    expect(parseSha256Manifest(ABC_DIGEST.toUpperCase())).toBe(ABC_DIGEST)
  })

  it('strips a leading UTF-8 BOM', () => {
    const bom = String.fromCharCode(0xfeff)
    expect(parseSha256Manifest(`${bom}${ABC_DIGEST}\n`)).toBe(ABC_DIGEST)
  })

  it('handles CRLF line endings', () => {
    expect(parseSha256Manifest(`${ABC_DIGEST}\r\n`)).toBe(ABC_DIGEST)
  })

  it('tolerates lone CR line endings', () => {
    expect(parseSha256Manifest(`${ABC_DIGEST}\r`)).toBe(ABC_DIGEST)
  })

  it('tolerates leading and trailing whitespace', () => {
    expect(parseSha256Manifest(`   ${ABC_DIGEST}   \n`)).toBe(ABC_DIGEST)
  })

  it('parses the coreutils "<hex>  <filename>" format', () => {
    expect(parseSha256Manifest(`${ABC_DIGEST}  firmware.bin\n`)).toBe(ABC_DIGEST)
  })

  it('skips blank lines before the digest line', () => {
    expect(parseSha256Manifest(`\n\n  \n${ABC_DIGEST}\n`)).toBe(ABC_DIGEST)
  })

  it('returns null for a malformed digest (wrong length)', () => {
    expect(parseSha256Manifest('deadbeef')).toBeNull()
  })

  it('returns null for a malformed digest (non-hex chars)', () => {
    expect(parseSha256Manifest('z'.repeat(64))).toBeNull()
  })

  it('returns null for an empty manifest', () => {
    expect(parseSha256Manifest('')).toBeNull()
  })

  it('returns null for a whitespace-only manifest', () => {
    expect(parseSha256Manifest('   \n\n')).toBeNull()
  })
})

describe('computeSha256Hex', () => {
  it('hashes an empty buffer to the canonical empty-string digest', async () => {
    const empty = new Uint8Array(0)
    await expect(computeSha256Hex(empty)).resolves.toBe(ZERO_LEN_DIGEST)
  })

  it('hashes "abc" to its canonical digest', async () => {
    const abc = new TextEncoder().encode('abc')
    await expect(computeSha256Hex(abc)).resolves.toBe(ABC_DIGEST)
  })

  it('accepts a raw ArrayBuffer', async () => {
    const abc = new TextEncoder().encode('abc')
    // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer-backed views.
    const buf = new ArrayBuffer(abc.byteLength)
    new Uint8Array(buf).set(abc)
    await expect(computeSha256Hex(buf)).resolves.toBe(ABC_DIGEST)
  })
})

describe('verifyFirmwareSha256', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function manifestResponse(body: string, init: { ok?: boolean; status?: number } = {}): Response {
    const encoded = new TextEncoder().encode(body)
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoded)
        controller.close()
      },
    })
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      statusText: init.status === 404 ? 'Not Found' : 'OK',
      body: stream,
      text: () => Promise.resolve(body),
    } as unknown as Response
  }

  it('returns the digest on a matching manifest', async () => {
    fetchMock.mockResolvedValueOnce(manifestResponse(`${ABC_DIGEST}  firmware.bin\n`))
    const abc = new TextEncoder().encode('abc')
    await expect(verifyFirmwareSha256(abc, FAKE_MANIFEST_URL)).resolves.toBe(ABC_DIGEST)
  })

  it('throws FirmwareIntegrityError with kind="mismatch" on digest mismatch', async () => {
    fetchMock.mockResolvedValueOnce(manifestResponse(`${ZERO_LEN_DIGEST}\n`))
    const abc = new TextEncoder().encode('abc')
    await expect(verifyFirmwareSha256(abc, FAKE_MANIFEST_URL)).rejects.toMatchObject({
      name: 'FirmwareIntegrityError',
      kind: 'mismatch',
      expected: ZERO_LEN_DIGEST,
      actual: ABC_DIGEST,
    })
  })

  it('throws FirmwareIntegrityError with kind="missing" when sibling 404s', async () => {
    fetchMock.mockResolvedValueOnce(manifestResponse('', { ok: false, status: 404 }))
    const abc = new TextEncoder().encode('abc')
    const err = await verifyFirmwareSha256(abc, FAKE_MANIFEST_URL).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FirmwareIntegrityError)
    expect((err as FirmwareIntegrityError).kind).toBe('missing')
  })

  it('throws FirmwareIntegrityError with kind="malformed" on a garbage sibling', async () => {
    fetchMock.mockResolvedValueOnce(manifestResponse('not a sha256 manifest\n'))
    const abc = new TextEncoder().encode('abc')
    const err = await verifyFirmwareSha256(abc, FAKE_MANIFEST_URL).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FirmwareIntegrityError)
    expect((err as FirmwareIntegrityError).kind).toBe('malformed')
  })
})
