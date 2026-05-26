// src/hooks/useFlasher.ts
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  DEFAULT_ADVANCED_OPTIONS,
  FIRMWARE_URL,
  SUPPORTED_USB_FILTERS,
  type AdvancedBaudRate,
} from '../constants'
import { flashFirmware, type FlashProgress } from '../lib/esptool'
import {
  downloadFirmware,
  downloadFirmwareBundle,
  type FirmwareDownloadProgress,
} from '../lib/firmware'
import { verifyFirmwareSha256 } from '../lib/integrity'
import { fetchLatestRelease, fetchReleaseByTag, type Release } from '../lib/releases'
import { isSimEnabled, simFlash, simSelectPort } from '../lib/sim'
import { classifyError, sendTelemetry } from '../lib/telemetry'

/**
 * Power-user escape hatches surfaced in the Advanced (recovery) panel. These
 * are session-local — there is no persistence by design. The flasher's
 * "no version picker" policy stands; this is for support flows only.
 */
export interface AdvancedOptions {
  /** Full chip erase before flash. Default false. */
  fullErase: boolean
  /** esptool stub baud rate. Default `FLASH_BAUD` (921_600). */
  baudRate: AdvancedBaudRate
  /** Optional version tag override (e.g. `v0.9.1`). Default null = use latest. */
  versionOverride: string | null
}

const DISCONNECT_DURING_FLASH_MESSAGE =
  'USB connection lost mid-flash — re-plug the dash and click Retry.'

/** True when the port's USB IDs match one of the allowed bridges. */
function isSupportedPort(port: SerialPort): boolean {
  const info = port.getInfo()
  return SUPPORTED_USB_FILTERS.some(
    (filter) =>
      filter.usbVendorId === info.usbVendorId && filter.usbProductId === info.usbProductId,
  )
}

async function findSingleSupportedPort(): Promise<SerialPort | null> {
  const ports = await navigator.serial.getPorts()
  const supported = ports.filter(isSupportedPort)
  return supported.length === 1 ? (supported[0] ?? null) : null
}

export type FlasherState = 'idle' | 'ready' | 'flashing' | 'success' | 'failed'

export interface FlasherStatus {
  state: FlasherState
  port: SerialPort | null
  errorMessage: string | null
  chipInfo: string | null
  downloadProgress: FirmwareDownloadProgress | null
  /** Present only when the release includes a SPIFFS asset. */
  spiffsDownloadProgress: FirmwareDownloadProgress | null
  flashProgress: FlashProgress | null
  log: string
  release: Release | null
  advanced: AdvancedOptions
}

const INITIAL_STATUS: FlasherStatus = {
  state: 'idle',
  port: null,
  errorMessage: null,
  chipInfo: null,
  downloadProgress: null,
  spiffsDownloadProgress: null,
  flashProgress: null,
  log: '',
  release: null,
  advanced: DEFAULT_ADVANCED_OPTIONS,
}

export interface FlasherActions {
  selectPort: () => Promise<void>
  flash: () => Promise<void>
  reset: () => void
  reselectPort: () => Promise<void>
  cancel: () => void
  setAdvanced: (opts: AdvancedOptions) => void
}

export function useFlasher(): FlasherStatus & FlasherActions {
  const [status, setStatus] = useState<FlasherStatus>(INITIAL_STATUS)
  const portRef = useRef<SerialPort | null>(null)
  const logBufferRef = useRef<string>('')
  const flashDisconnectHandlerRef = useRef<((event: Event) => void) | null>(null)
  const downloadAbortRef = useRef<AbortController | null>(null)
  // Mirror of `status.release` for use inside `flash()` without re-creating
  // the callback (and therefore re-binding the disconnect handler) every
  // time the release fetch settles.
  const releaseRef = useRef<Release | null>(null)
  // Mirror of `status.advanced` for the same reason — `flash()` reads the
  // latest power-user options at call time without being recreated on every
  // toggle.
  const advancedRef = useRef<AdvancedOptions>(DEFAULT_ADVANCED_OPTIONS)

  const detachFlashDisconnectHandler = useCallback(() => {
    const handler = flashDisconnectHandlerRef.current
    if (handler) {
      navigator.serial.removeEventListener('disconnect', handler)
      flashDisconnectHandlerRef.current = null
    }
  }, [])

  const appendLog = useCallback((line: string) => {
    logBufferRef.current += line
    setStatus((prev) => ({ ...prev, log: logBufferRef.current }))
  }, [])

  const selectPort = useCallback(async () => {
    if (isSimEnabled()) {
      const port = simSelectPort()
      portRef.current = port
      setStatus((prev) => ({ ...prev, port, state: 'ready', errorMessage: null }))
      return
    }
    try {
      const port = await navigator.serial.requestPort({ filters: SUPPORTED_USB_FILTERS })
      portRef.current = port
      setStatus((prev) => ({ ...prev, port, state: 'ready', errorMessage: null }))
    } catch (err) {
      // User cancelled the picker — stay in current state, no error UI.
      if (err instanceof DOMException && err.name === 'NotFoundError') return
      const message = err instanceof Error ? err.message : 'Failed to open port'
      setStatus((prev) => ({ ...prev, errorMessage: message }))
    }
  }, [])

  const reset = useCallback(() => {
    detachFlashDisconnectHandler()
    portRef.current = null
    logBufferRef.current = ''
    // Preserve the resolved release across reset — it was fetched once on
    // mount and re-fetching on every "Flash again" would just hit the rate
    // limit for no UX benefit. Also preserve advanced options so power-users
    // don't have to re-toggle them between attempts in the same session.
    setStatus((prev) => ({
      ...INITIAL_STATUS,
      release: prev.release,
      advanced: prev.advanced,
    }))
  }, [detachFlashDisconnectHandler])

  const setAdvanced = useCallback((opts: AdvancedOptions) => {
    advancedRef.current = opts
    setStatus((prev) => ({ ...prev, advanced: opts }))
  }, [])

  const reselectPort = useCallback(async () => {
    reset()
    await selectPort()
  }, [reset, selectPort])

  const flash = useCallback(async () => {
    const port = portRef.current
    if (!port) {
      setStatus((prev) => ({ ...prev, errorMessage: 'No port selected', state: 'failed' }))
      return
    }

    logBufferRef.current = ''
    setStatus((prev) => ({
      ...prev,
      state: 'flashing',
      errorMessage: null,
      chipInfo: null,
      downloadProgress: { loaded: 0, total: null },
      spiffsDownloadProgress: null,
      flashProgress: null,
      log: '',
    }))

    // Sim mode: bypass Web Serial entirely. No download, no SHA, no esptool —
    // production paths in firmware.ts / esptool.ts stay free of conditionals.
    if (isSimEnabled()) {
      try {
        await simFlash({
          onLog: appendLog,
          onProgress: (progress) => {
            setStatus((prev) => ({ ...prev, flashProgress: progress }))
          },
          onChipInfo: (chip) => {
            setStatus((prev) => ({ ...prev, chipInfo: chip }))
          },
        })
        setStatus((prev) => ({ ...prev, state: 'success' }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        appendLog(`\nError: ${message}\n`)
        setStatus((prev) => ({ ...prev, state: 'failed', errorMessage: message }))
      }
      return
    }

    const startedAt = performance.now()
    let detectedChip: string | null = null

    const abortController = new AbortController()
    downloadAbortRef.current = abortController

    detachFlashDisconnectHandler()
    let disconnectFiredDuringFlash = false
    const disconnectHandler = (event: Event): void => {
      const target = (event as Event & { target: SerialPort | null }).target
      if (target !== port) return
      disconnectFiredDuringFlash = true
      appendLog(`\n${DISCONNECT_DURING_FLASH_MESSAGE}\n`)
      setStatus((prev) => ({
        ...prev,
        state: 'failed',
        errorMessage: DISCONNECT_DURING_FLASH_MESSAGE,
      }))
      detachFlashDisconnectHandler()
      void sendTelemetry({
        outcome: 'failed',
        chipFamily: detectedChip,
        firmwareVersion: releaseRef.current?.version ?? null,
        durationMs: Math.round(performance.now() - startedAt),
        errorClass: 'disconnect',
      })
    }
    flashDisconnectHandlerRef.current = disconnectHandler
    navigator.serial.addEventListener('disconnect', disconnectHandler)

    try {
      const advanced = advancedRef.current
      const overrideTag = advanced.versionOverride?.trim() ?? ''
      let release: Release | null = releaseRef.current
      if (overrideTag.length > 0) {
        appendLog(`Fetching release "${overrideTag}" (version override)...\n`)
        release = await fetchReleaseByTag(overrideTag)
      }
      const firmwareUrl = release?.firmwareAsset?.url ?? null
      const bundleRelease: Release | null = release !== null && firmwareUrl !== null ? release : null
      if (!release) {
        console.warn('Release metadata unavailable — falling back to FIRMWARE_URL.')
        appendLog('Release metadata unavailable — falling back to static URL.\n')
      } else if (!firmwareUrl) {
        console.warn(
          'Latest release has no firmware asset matching the merged image pattern — falling back to FIRMWARE_URL.',
        )
        appendLog('Latest release missing firmware asset — falling back to static URL.\n')
      }

      let firmwareBytes: Uint8Array
      let firmwareManifestUrl: string
      let spiffsBytes: Uint8Array | null = null
      let spiffsManifestUrl: string | null = null

      if (bundleRelease) {
        if (bundleRelease.spiffsAsset) {
          appendLog(`Downloading firmware v${bundleRelease.version} + SPIFFS...\n`)
        } else {
          appendLog(`Downloading firmware v${bundleRelease.version}...\n`)
        }
        const bundle = await downloadFirmwareBundle(
          bundleRelease,
          (p) => {
            setStatus((prev) => ({
              ...prev,
              downloadProgress: p.firmware ?? prev.downloadProgress,
              spiffsDownloadProgress: p.spiffs,
            }))
          },
          abortController.signal,
        )
        firmwareBytes = bundle.firmware.bytes
        firmwareManifestUrl = bundle.firmwareManifestUrl
        spiffsBytes = bundle.spiffs?.bytes ?? null
        spiffsManifestUrl = bundle.spiffsManifestUrl
        appendLog(`Downloaded firmware ${firmwareBytes.byteLength} bytes.\n`)
        if (spiffsBytes) {
          appendLog(`Downloaded SPIFFS ${spiffsBytes.byteLength} bytes.\n`)
        }
      } else {
        appendLog('Downloading firmware...\n')
        const downloadUrl = FIRMWARE_URL
        const { bytes } = await downloadFirmware(
          downloadUrl,
          (dl) => {
            setStatus((prev) => ({ ...prev, downloadProgress: dl }))
          },
          abortController.signal,
        )
        firmwareBytes = bytes
        firmwareManifestUrl = `${downloadUrl}.sha256`
        appendLog(`Downloaded ${firmwareBytes.byteLength} bytes.\n`)
      }

      // Mandatory SHA-256 verification (#4). A missing or malformed `.sha256`
      // sibling is a hard fail — there is no opt-out flag. Same gate for the
      // FIRMWARE_URL fallback path and for the SPIFFS partition.
      appendLog('Verifying firmware SHA-256...\n')
      const fwDigest = await verifyFirmwareSha256(firmwareBytes, firmwareManifestUrl)
      appendLog(`Firmware SHA-256 OK (${fwDigest}).\n`)
      if (spiffsBytes && spiffsManifestUrl) {
        appendLog('Verifying SPIFFS SHA-256...\n')
        const spiffsDigest = await verifyFirmwareSha256(spiffsBytes, spiffsManifestUrl)
        appendLog(`SPIFFS SHA-256 OK (${spiffsDigest}).\n`)
      }

      // Once writeFlash is about to start, cancellation is no longer offered —
      // drop the controller so the UI hides the Cancel button.
      downloadAbortRef.current = null

      if (advanced.fullErase) {
        appendLog('Advanced: full chip erase requested.\n')
      }
      if (advanced.baudRate !== DEFAULT_ADVANCED_OPTIONS.baudRate) {
        appendLog(`Advanced: stub baud rate overridden to ${String(advanced.baudRate)}.\n`)
      }

      await flashFirmware({
        port,
        firmware: firmwareBytes,
        ...(spiffsBytes ? { spiffs: spiffsBytes } : {}),
        onLog: appendLog,
        onProgress: (progress) => {
          setStatus((prev) => ({ ...prev, flashProgress: progress }))
        },
        onChipInfo: (chip) => {
          detectedChip = chip
          setStatus((prev) => ({ ...prev, chipInfo: chip }))
        },
        baudRate: advanced.baudRate,
        fullErase: advanced.fullErase,
      })

      detachFlashDisconnectHandler()
      downloadAbortRef.current = null
      setStatus((prev) => ({ ...prev, state: 'success' }))
      void sendTelemetry({
        outcome: 'success',
        chipFamily: detectedChip,
        firmwareVersion: releaseRef.current?.version ?? null,
        durationMs: Math.round(performance.now() - startedAt),
        errorClass: null,
      })
    } catch (err) {
      detachFlashDisconnectHandler()
      downloadAbortRef.current = null
      // Disconnect already produced the canonical failure state — don't
      // overwrite it with the cascading "port closed" error from esptool.
      if (disconnectFiredDuringFlash) return
      // User opted out via Cancel — return to idle instead of showing failure.
      if (err instanceof DOMException && err.name === 'AbortError') {
        portRef.current = null
        logBufferRef.current = ''
        setStatus((prev) => ({
          ...INITIAL_STATUS,
          release: prev.release,
          advanced: prev.advanced,
        }))
        void sendTelemetry({
          outcome: 'cancelled',
          chipFamily: detectedChip,
          firmwareVersion: releaseRef.current?.version ?? null,
          durationMs: Math.round(performance.now() - startedAt),
          errorClass: 'cancelled',
        })
        return
      }
      const message = err instanceof Error ? err.message : 'Unknown error'
      appendLog(`\nError: ${message}\n`)
      setStatus((prev) => ({ ...prev, state: 'failed', errorMessage: message }))
      void sendTelemetry({
        outcome: 'failed',
        chipFamily: detectedChip,
        firmwareVersion: releaseRef.current?.version ?? null,
        durationMs: Math.round(performance.now() - startedAt),
        errorClass: classifyError(message),
      })
    }
  }, [appendLog, detachFlashDisconnectHandler])

  const cancel = useCallback(() => {
    const controller = downloadAbortRef.current
    if (!controller) return
    controller.abort()
    downloadAbortRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      const handler = flashDisconnectHandlerRef.current
      if (handler) {
        navigator.serial.removeEventListener('disconnect', handler)
        flashDisconnectHandlerRef.current = null
      }
    }
  }, [])

  // Fire-and-forget release metadata fetch on mount. The flash flow doesn't
  // block on this — a failed lookup falls back to FIRMWARE_URL — but having
  // the version + notes ready in `idle` state is the whole point of #14.
  useEffect(() => {
    let cancelled = false
    void fetchLatestRelease()
      .then((release) => {
        if (cancelled) return
        releaseRef.current = release
        setStatus((prev) => ({ ...prev, release }))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('Failed to fetch latest release metadata:', message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-select a previously-authorised port on mount, and keep the
  // idle ↔ ready transition in sync when the user (un)plugs the dash.
  // StrictMode safe: the cleanup removes the same handler instances added.
  useEffect(() => {
    let cancelled = false

    // Sim mode: auto-promote idle → ready with a fake port so contributors
    // land on the "Flash latest" button on first paint. Deferred via Promise
    // microtask to satisfy `react-hooks/set-state-in-effect`.
    if (isSimEnabled()) {
      void Promise.resolve().then(() => {
        if (cancelled) return
        const port = simSelectPort()
        portRef.current = port
        setStatus((prev) => {
          if (prev.state !== 'idle') return prev
          return { ...prev, port, state: 'ready', errorMessage: null }
        })
      })
      return () => {
        cancelled = true
      }
    }

    const promoteIfSingleMatch = async (): Promise<void> => {
      const port = await findSingleSupportedPort()
      if (cancelled || !port) return
      // Don't disrupt anything past idle — auto-select only ever transitions
      // idle → ready. Other states own the port lifecycle themselves.
      setStatus((prev) => {
        if (prev.state !== 'idle') return prev
        portRef.current = port
        return { ...prev, port, state: 'ready', errorMessage: null }
      })
    }

    const handleConnect = (): void => {
      void promoteIfSingleMatch()
    }

    const handleDisconnect = (event: Event): void => {
      const target = (event as Event & { target: SerialPort | null }).target
      if (!target) return
      // The flash-time disconnect handler owns the flashing-state case.
      setStatus((prev) => {
        if (prev.state !== 'ready' || prev.port !== target) return prev
        portRef.current = null
        return { ...prev, port: null, state: 'idle' }
      })
    }

    navigator.serial.addEventListener('connect', handleConnect)
    navigator.serial.addEventListener('disconnect', handleDisconnect)
    void promoteIfSingleMatch()

    return () => {
      cancelled = true
      navigator.serial.removeEventListener('connect', handleConnect)
      navigator.serial.removeEventListener('disconnect', handleDisconnect)
    }
  }, [])

  return {
    ...status,
    selectPort,
    flash,
    reset,
    reselectPort,
    cancel,
    setAdvanced,
  }
}
