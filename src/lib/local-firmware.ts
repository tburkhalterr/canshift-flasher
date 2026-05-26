// src/lib/local-firmware.ts
//
// Lets users flash a firmware image they already have on disk, bypassing the
// GitHub release fetch. Verifies the SHA-256 of the file so the flash flow
// still has a checked artifact when it skips the publisher manifest path.

import { computeSha256Hex, parseSha256Manifest } from './integrity'

/** Hard cap on user-uploaded firmware size — guards against pasted text or
 *  hostile zip-bombs. 16 MiB covers an ESP32-S3 + SPIFFS merged image with
 *  headroom; bigger uploads are almost certainly the wrong file. */
const FIRMWARE_MAX_BYTES = 16 * 1024 * 1024

/** Hard cap on a sidecar `.sha256` file — same rationale as the network path. */
const MANIFEST_MAX_BYTES = 64 * 1024

export interface LocalFirmware {
  /** Source filename — purely for display. */
  name: string
  /** Raw bytes ready for `flashFirmware`. */
  bytes: Uint8Array
  /** SHA-256 hex digest of `bytes`, computed at load time. */
  sha256: string
  /** User-provided expected digest (from a `.sha256` file or text input). */
  expectedSha256: string | null
}

export class LocalFirmwareError extends Error {
  readonly kind: 'too-large' | 'empty' | 'manifest-malformed'
  constructor(kind: LocalFirmwareError['kind'], message: string) {
    super(message)
    this.name = 'LocalFirmwareError'
    this.kind = kind
  }
}

/**
 * Reads a binary file into memory and computes its SHA-256. Returns the
 * shape the flasher needs — the caller can later attach an expected digest.
 */
export const readFirmwareFile = async (file: File): Promise<LocalFirmware> => {
  if (file.size === 0) {
    throw new LocalFirmwareError('empty', 'Firmware file is empty.')
  }
  if (file.size > FIRMWARE_MAX_BYTES) {
    throw new LocalFirmwareError(
      'too-large',
      `Firmware file is ${formatBytes(file.size)} — refusing to load anything over ${formatBytes(FIRMWARE_MAX_BYTES)}.`,
    )
  }
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const sha256 = await computeSha256Hex(bytes)
  return {
    name: file.name,
    bytes,
    sha256,
    expectedSha256: null,
  }
}

/**
 * Parses a `.sha256` sidecar uploaded by the user. Reuses the same coreutils
 * grammar as the network path so a manifest published alongside a release
 * works without modification.
 */
export const readSha256File = async (file: File): Promise<string> => {
  if (file.size > MANIFEST_MAX_BYTES) {
    throw new LocalFirmwareError(
      'manifest-malformed',
      `Checksum file is ${formatBytes(file.size)} — that doesn't look like a SHA-256 sidecar.`,
    )
  }
  const text = await file.text()
  const parsed = parseSha256Manifest(text)
  if (parsed === null) {
    throw new LocalFirmwareError(
      'manifest-malformed',
      'Checksum file does not contain a valid SHA-256 digest.',
    )
  }
  return parsed
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${String(bytes)} B`
}
