// src/lib/firmware.ts
import { FIRMWARE_BINARY_MAX_BYTES } from '../constants'

import type { Release } from './releases'

export interface FirmwareDownloadProgress {
  loaded: number
  total: number | null
}

export interface FirmwareBinary {
  bytes: Uint8Array
  size: number
}

/**
 * Thrown when the firmware download itself fails — HTTP non-2xx, missing
 * body, or the size cap is exceeded. SHA-256 mismatches are NOT this class:
 * see `FirmwareIntegrityError` in `./integrity.ts`.
 */
export class FirmwareDownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirmwareDownloadError'
  }
}

/**
 * Stream-download a firmware binary from `url`, surfacing byte progress so
 * the UI can render a determinate bar when Content-Length is present (and
 * an indeterminate one otherwise).
 *
 * Hardening: caller MUST verify the downloaded bytes against a published
 * SHA-256 manifest before handing them to esptool. See `verifyFirmwareSha256`
 * in `./integrity.ts` — the HMAC pre-flash gate tracked in
 * tburkhalterr/CANShift#1081 is a separate, additional hardening item.
 */
export async function downloadFirmware(
  url: string,
  onProgress: (p: FirmwareDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<FirmwareBinary> {
  const requestInit: RequestInit = { cache: 'no-store' }
  if (signal) requestInit.signal = signal

  const response = await fetch(url, requestInit)
  if (!response.ok) {
    throw new FirmwareDownloadError(
      `Firmware download failed: HTTP ${String(response.status)} ${response.statusText}`,
    )
  }
  if (!response.body) {
    throw new FirmwareDownloadError('Firmware download failed: empty response body')
  }

  const contentLengthHeader = response.headers.get('content-length')
  const total = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null

  // Reject before allocating any buffers if the server announces a body
  // larger than the cap. A hostile mirror could lie in Content-Length but
  // the in-loop guard below catches that case too.
  if (total !== null && Number.isFinite(total) && total > FIRMWARE_BINARY_MAX_BYTES) {
    throw new FirmwareDownloadError(
      `Firmware download rejected: announced size ${String(total)} bytes exceeds cap of ${String(FIRMWARE_BINARY_MAX_BYTES)} bytes`,
    )
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      loaded += value.byteLength
      if (loaded > FIRMWARE_BINARY_MAX_BYTES) {
        await reader.cancel().catch(() => {
          /* best-effort: server may have already closed the stream */
        })
        throw new FirmwareDownloadError(
          `Firmware download rejected: streamed ${String(loaded)} bytes exceeds cap of ${String(FIRMWARE_BINARY_MAX_BYTES)} bytes`,
        )
      }
      chunks.push(value)
      onProgress({ loaded, total })
    }
  }

  const bytes = concatChunks(chunks, loaded)
  return { bytes, size: loaded }
}

function concatChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export interface FirmwareBundleProgress {
  firmware: FirmwareDownloadProgress | null
  spiffs: FirmwareDownloadProgress | null
}

export interface FirmwareBundle {
  firmware: FirmwareBinary
  /** Sibling SHA-256 manifest URL for the firmware binary. */
  firmwareManifestUrl: string
  /** SPIFFS image — present only when the release ships one. */
  spiffs: FirmwareBinary | null
  spiffsManifestUrl: string | null
}

/**
 * Download both the merged firmware image and the (optional) SPIFFS partition
 * image sequentially. Reports progress for each asset independently so the UI
 * can render two bars during the download phase. SPIFFS is optional — when
 * `release.spiffsAsset` is null the function skips it without complaint.
 *
 * Both buffers are caller-verified via `verifyFirmwareSha256` against the
 * sibling `.sha256` URLs surfaced on the asset.
 */
export async function downloadFirmwareBundle(
  release: Release,
  onProgress: (p: FirmwareBundleProgress) => void,
  signal?: AbortSignal,
): Promise<FirmwareBundle> {
  if (!release.firmwareAsset) {
    throw new FirmwareDownloadError('Release is missing a firmware asset')
  }
  const fwAsset = release.firmwareAsset
  const spiffsAsset = release.spiffsAsset

  let firmwareProgress: FirmwareDownloadProgress | null = null
  let spiffsProgress: FirmwareDownloadProgress | null = null

  const firmware = await downloadFirmware(
    fwAsset.url,
    (p) => {
      firmwareProgress = p
      onProgress({ firmware: firmwareProgress, spiffs: spiffsProgress })
    },
    signal,
  )

  let spiffs: FirmwareBinary | null = null
  if (spiffsAsset) {
    spiffs = await downloadFirmware(
      spiffsAsset.url,
      (p) => {
        spiffsProgress = p
        onProgress({ firmware: firmwareProgress, spiffs: spiffsProgress })
      },
      signal,
    )
  }

  return {
    firmware,
    firmwareManifestUrl: fwAsset.sha256Url,
    spiffs,
    spiffsManifestUrl: spiffsAsset?.sha256Url ?? null,
  }
}
