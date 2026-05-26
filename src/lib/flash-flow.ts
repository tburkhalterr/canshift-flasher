// src/lib/flash-flow.ts
//
// Helpers extracted from `useFlasher.flash()` to keep the orchestrator
// callback under control. Each helper is module-level and side-effect-free
// beyond the callbacks the caller passes — keeps the unit boundary clear
// and lets each piece be tested independently of the React state machine.

import { FIRMWARE_URL } from '../constants'

import {
  downloadFirmware,
  downloadFirmwareBundle,
  type FirmwareDownloadProgress,
} from './firmware'
import { verifyFirmwareSha256 } from './integrity'
import { fetchReleaseByTag, type Release } from './releases'

export interface AcquireResult {
  firmwareBytes: Uint8Array
  firmwareManifestUrl: string
  spiffsBytes: Uint8Array | null
  spiffsManifestUrl: string | null
}

export interface AcquireProgress {
  firmware: FirmwareDownloadProgress | null
  spiffs: FirmwareDownloadProgress | null
}

export interface AcquireCallbacks {
  onProgress: (p: AcquireProgress) => void
  onLog: (line: string) => void
}

/**
 * Resolve which release the flash should pull from.
 *
 * If `versionOverride` is non-empty, hit the by-tag endpoint regardless of
 * what was cached on mount. Otherwise return the already-fetched release —
 * `null` is fine; the acquire step falls back to `FIRMWARE_URL`.
 */
export const resolveActiveRelease = async (
  cachedRelease: Release | null,
  versionOverride: string,
  onLog: (line: string) => void,
): Promise<Release | null> => {
  if (versionOverride.length === 0) return cachedRelease
  onLog(`Fetching release "${versionOverride}" (version override)...\n`)
  return fetchReleaseByTag(versionOverride)
}

/**
 * Download the firmware (and optional SPIFFS) bytes for `release`. Falls back
 * to the static `FIRMWARE_URL` when release metadata is unavailable or has no
 * matching merged asset.
 */
export const acquirePayload = async (
  release: Release | null,
  signal: AbortSignal,
  callbacks: AcquireCallbacks,
): Promise<AcquireResult> => {
  const { onProgress, onLog } = callbacks
  const firmwareUrl = release?.firmwareAsset?.url ?? null
  const useBundle = release !== null && firmwareUrl !== null

  if (!release) {
    console.warn('Release metadata unavailable — falling back to FIRMWARE_URL.')
    onLog('Release metadata unavailable — falling back to static URL.\n')
  } else if (!firmwareUrl) {
    console.warn(
      'Latest release has no firmware asset matching the merged image pattern — falling back to FIRMWARE_URL.',
    )
    onLog('Latest release missing firmware asset — falling back to static URL.\n')
  }

  if (useBundle && release.firmwareAsset) {
    if (release.spiffsAsset) {
      onLog(`Downloading firmware v${release.version} + SPIFFS...\n`)
    } else {
      onLog(`Downloading firmware v${release.version}...\n`)
    }
    const bundle = await downloadFirmwareBundle(
      release,
      (p) => {
        onProgress({ firmware: p.firmware ?? null, spiffs: p.spiffs })
      },
      signal,
    )
    onLog(`Downloaded firmware ${bundle.firmware.bytes.byteLength} bytes.\n`)
    if (bundle.spiffs) {
      onLog(`Downloaded SPIFFS ${bundle.spiffs.bytes.byteLength} bytes.\n`)
    }
    return {
      firmwareBytes: bundle.firmware.bytes,
      firmwareManifestUrl: bundle.firmwareManifestUrl,
      spiffsBytes: bundle.spiffs?.bytes ?? null,
      spiffsManifestUrl: bundle.spiffsManifestUrl,
    }
  }

  onLog('Downloading firmware...\n')
  const { bytes } = await downloadFirmware(
    FIRMWARE_URL,
    (dl) => {
      onProgress({ firmware: dl, spiffs: null })
    },
    signal,
  )
  onLog(`Downloaded ${bytes.byteLength} bytes.\n`)
  return {
    firmwareBytes: bytes,
    firmwareManifestUrl: `${FIRMWARE_URL}.sha256`,
    spiffsBytes: null,
    spiffsManifestUrl: null,
  }
}

/**
 * Mandatory SHA-256 verification (#4). A missing or malformed `.sha256`
 * sibling throws — there is no opt-out flag. Same gate applies to the
 * SPIFFS partition when present.
 */
export const verifyPayload = async (
  result: AcquireResult,
  onLog: (line: string) => void,
): Promise<void> => {
  onLog('Verifying firmware SHA-256...\n')
  const fwDigest = await verifyFirmwareSha256(result.firmwareBytes, result.firmwareManifestUrl)
  onLog(`Firmware SHA-256 OK (${fwDigest}).\n`)
  if (result.spiffsBytes && result.spiffsManifestUrl) {
    onLog('Verifying SPIFFS SHA-256...\n')
    const spiffsDigest = await verifyFirmwareSha256(result.spiffsBytes, result.spiffsManifestUrl)
    onLog(`SPIFFS SHA-256 OK (${spiffsDigest}).\n`)
  }
}
