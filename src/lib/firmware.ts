// src/lib/firmware.ts
import { FIRMWARE_URL } from '../constants'

export interface FirmwareDownloadProgress {
  loaded: number
  total: number | null
}

export interface FirmwareBinary {
  bytes: Uint8Array
  size: number
}

/**
 * Stream-download the firmware binary from FIRMWARE_URL, surfacing byte
 * progress so the UI can render a determinate bar when Content-Length is
 * present (and an indeterminate one otherwise).
 *
 * TODO #1081 v2: HMAC-verify the payload before handing it to esptool.
 * The firmware itself HMAC-verifies any OTA payload at install time, but
 * the USB flash path writes raw bytes to flash and bypasses that gate.
 * For v1 we accept the residual risk (user is on a trusted local USB link).
 */
export async function downloadFirmware(
  onProgress: (p: FirmwareDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<FirmwareBinary> {
  const requestInit: RequestInit = { cache: 'no-store' }
  if (signal) requestInit.signal = signal

  const response = await fetch(FIRMWARE_URL, requestInit)
  if (!response.ok) {
    throw new Error(`Firmware download failed: HTTP ${response.status} ${response.statusText}`)
  }
  if (!response.body) {
    throw new Error('Firmware download failed: empty response body')
  }

  const contentLengthHeader = response.headers.get('content-length')
  const total = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
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
