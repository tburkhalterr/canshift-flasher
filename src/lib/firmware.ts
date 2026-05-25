// src/lib/firmware.ts
import { FIRMWARE_BINARY_MAX_BYTES, FIRMWARE_URL } from '../constants'

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

  // Reject before allocating any buffers if the server announces a body
  // larger than the cap. A hostile mirror could lie in Content-Length but
  // the in-loop guard below catches that case too.
  if (total !== null && Number.isFinite(total) && total > FIRMWARE_BINARY_MAX_BYTES) {
    throw new Error(
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
        throw new Error(
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
