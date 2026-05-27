// src/lib/flash-flow.ts
//
// Helpers extracted from `useFlasher.flash()` to keep the orchestrator
// callback under control. Each helper is module-level and side-effect-free
// beyond the callbacks the caller passes — keeps the unit boundary clear
// and lets each piece be tested independently of the React state machine.

import {
  downloadFirmwareBundle,
  FirmwareDownloadError,
  type FirmwareDownloadProgress,
} from './firmware'
import { verifyFirmwareDigest, verifyFirmwareSha256 } from './integrity'
import { fetchReleaseByTag, type Release } from './releases'

/**
 * User-facing message thrown when the GitHub Releases lookup yields nothing
 * usable. Directs the user to the local-file upload section in IdleView
 * (`LocalFirmwareInput`). Exported so tests can assert against the exact
 * string without duplicating it.
 */
export const NO_RELEASE_NO_LOCAL_FIRMWARE_MESSAGE =
  "Could not fetch a firmware release from GitHub and no local firmware is loaded. Use the 'Or flash a local file' option to upload the .bin manually."

export interface AcquireResult {
  firmwareBytes: Uint8Array
  firmwareManifestUrl: string
  /** GitHub-published digest hex (preferred over manifestUrl when present). */
  firmwareExpectedSha256: string | null
  spiffsBytes: Uint8Array | null
  spiffsManifestUrl: string | null
  spiffsExpectedSha256: string | null
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
 * `null` is fine; the acquire step throws with a hint to use the local-file
 * option (`LocalFirmwareInput`) in that case (REF-11 / #137).
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
 * Download the firmware (and optional SPIFFS) bytes for `release`. Throws
 * `FirmwareDownloadError` when the release is missing or lacks a merged
 * firmware asset — the user is then directed to the local-file upload
 * option in `LocalFirmwareInput`. The legacy static `FIRMWARE_URL` fallback
 * was removed in REF-11 (#137); local-firmware (#182, #193) covers the
 * "GitHub unreachable" case with proper SHA-256 verification.
 */
export const acquirePayload = async (
  release: Release | null,
  signal: AbortSignal,
  callbacks: AcquireCallbacks,
): Promise<AcquireResult> => {
  const { onProgress, onLog } = callbacks
  const firmwareAsset = release?.firmwareAsset ?? null

  if (!release || !firmwareAsset) {
    throw new FirmwareDownloadError(NO_RELEASE_NO_LOCAL_FIRMWARE_MESSAGE)
  }

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
    firmwareExpectedSha256: firmwareAsset.expectedSha256,
    spiffsBytes: bundle.spiffs?.bytes ?? null,
    spiffsManifestUrl: bundle.spiffsManifestUrl,
    spiffsExpectedSha256: release.spiffsAsset?.expectedSha256 ?? null,
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
  const fwDigest = result.firmwareExpectedSha256
    ? await verifyFirmwareDigest(result.firmwareBytes, result.firmwareExpectedSha256)
    : await verifyFirmwareSha256(result.firmwareBytes, result.firmwareManifestUrl)
  onLog(`Firmware SHA-256 OK (${fwDigest}).\n`)
  if (result.spiffsBytes) {
    onLog('Verifying SPIFFS SHA-256...\n')
    const spiffsDigest = result.spiffsExpectedSha256
      ? await verifyFirmwareDigest(result.spiffsBytes, result.spiffsExpectedSha256)
      : result.spiffsManifestUrl
        ? await verifyFirmwareSha256(result.spiffsBytes, result.spiffsManifestUrl)
        : null
    if (spiffsDigest) onLog(`SPIFFS SHA-256 OK (${spiffsDigest}).\n`)
  }
}
