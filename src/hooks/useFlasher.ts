// src/hooks/useFlasher.ts
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  DEFAULT_ADVANCED_OPTIONS,
  SUPPORTED_USB_FILTERS,
  type AdvancedBaudRate,
} from '../constants'
import { flashFirmware, probeChip, type FlashProgress } from '../lib/esptool'
import { type FirmwareDownloadProgress } from '../lib/firmware'
import { acquirePayload, resolveActiveRelease, verifyPayload } from '../lib/flash-flow'
import { type LocalFirmware } from '../lib/local-firmware'
import { type Release } from '../lib/releases'
import { isSimEnabled, simFlash, simSelectPort } from '../lib/sim'
import { classifyError, sendTelemetry } from '../lib/telemetry'

import { useAutoConnect } from './useAutoConnect'
import { useDisconnectGuard } from './useDisconnectGuard'
import { useLatestRelease } from './useLatestRelease'

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
  'USB connection lost mid-flash — re-plug the ESP32 and click Retry.'

/**
 * Hard cap on the in-memory log buffer. esptool can emit a few hundred KiB
 * of progress lines on a verbose stub; without a cap a stuck retry loop
 * grows the buffer unboundedly and starves React re-renders. 128 KiB is
 * roughly ~2k lines — plenty for diagnosing a single flash session.
 */
export const LOG_BUFFER_CAP_BYTES = 128 * 1024

/** Truncation marker prepended once after the first rotation. */
const LOG_TRUNCATION_MARKER = '[...truncated]\n'

/**
 * Reset the bits of status that should be cleared each time `flash()` starts:
 * progress trackers, error message, chip info, log. Pure helper to keep the
 * orchestrator readable.
 */
const initFlashingStatus = (prev: FlasherStatus): FlasherStatus => ({
  ...prev,
  state: 'flashing',
  errorMessage: null,
  chipInfo: null,
  downloadProgress: { loaded: 0, total: null },
  spiffsDownloadProgress: null,
  flashProgress: null,
  log: '',
  logTruncated: false,
})

/**
 * Sim-mode short-circuit: replace Web Serial / download / SHA / esptool with
 * a scripted fake flash. Keeps production paths free of `if (sim)` branches.
 */
const runSimFlash = async (
  appendLog: (line: string) => void,
  setStatus: React.Dispatch<React.SetStateAction<FlasherStatus>>,
): Promise<void> => {
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
  /** True once the in-memory log buffer hit its cap and was rotated. */
  logTruncated: boolean
  release: Release | null
  advanced: AdvancedOptions
  /** User-supplied firmware that bypasses the GitHub release fetch. */
  localFirmware: LocalFirmware | null
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
  logTruncated: false,
  release: null,
  advanced: DEFAULT_ADVANCED_OPTIONS,
  localFirmware: null,
}

export interface FlasherActions {
  selectPort: () => Promise<void>
  flash: () => Promise<void>
  reset: () => void
  reselectPort: () => Promise<void>
  cancel: () => void
  setAdvanced: (opts: AdvancedOptions) => void
  setLocalFirmware: (firmware: LocalFirmware | null) => void
}

export const useFlasher = (): FlasherStatus & FlasherActions => {
  const { release, releaseRef } = useLatestRelease()
  const [status, setStatus] = useState<FlasherStatus>(INITIAL_STATUS)
  const portRef = useRef<SerialPort | null>(null)
  const logBufferRef = useRef<string>('')
  const logTruncatedRef = useRef<boolean>(false)
  const logFlushScheduledRef = useRef<boolean>(false)
  const logFlushHandleRef = useRef<number | null>(null)
  const downloadAbortRef = useRef<AbortController | null>(null)
  // Mirror of `status.advanced` so `flash()` reads the latest power-user
  // options at call time without being recreated on every toggle.
  const advancedRef = useRef<AdvancedOptions>(DEFAULT_ADVANCED_OPTIONS)
  // Mirror of `status.localFirmware` so `flash()` reads the current upload
  // without depending on the React state at the time the callback was created.
  const localFirmwareRef = useRef<LocalFirmware | null>(null)

  const disconnectGuard = useDisconnectGuard()

  const flushLog = useCallback(() => {
    logFlushScheduledRef.current = false
    logFlushHandleRef.current = null
    setStatus((prev) => ({
      ...prev,
      log: logBufferRef.current,
      logTruncated: logTruncatedRef.current,
    }))
  }, [])

  const appendLog = useCallback(
    (line: string) => {
      // Cap the buffer: when the next append would exceed the cap, drop the
      // oldest half and prepend the truncation marker once. Subsequent
      // rotations keep dropping from the middle without re-adding the marker.
      const projected = logBufferRef.current.length + line.length
      if (projected > LOG_BUFFER_CAP_BYTES) {
        const half = Math.floor(LOG_BUFFER_CAP_BYTES / 2)
        const kept = logBufferRef.current.slice(-half)
        if (!logTruncatedRef.current) {
          logBufferRef.current = LOG_TRUNCATION_MARKER + kept
          logTruncatedRef.current = true
        } else {
          logBufferRef.current = kept
        }
      }
      logBufferRef.current += line

      // Coalesce render updates: one `setStatus` per animation frame at most,
      // so a chatty esptool stream doesn't trigger a re-render per line.
      if (logFlushScheduledRef.current) return
      logFlushScheduledRef.current = true
      if (typeof requestAnimationFrame === 'function') {
        logFlushHandleRef.current = requestAnimationFrame(flushLog)
      } else {
        // jsdom and Node test envs may omit rAF — fall back to a microtask.
        queueMicrotask(flushLog)
      }
    },
    [flushLog],
  )

  // Cancel any pending rAF on unmount so we don't flush into a torn-down hook.
  useEffect(() => {
    return () => {
      if (logFlushHandleRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(logFlushHandleRef.current)
      }
    }
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
      // Fire-and-forget chip probe — never blocks the transition to ready.
      // A null result just leaves `chipInfo` unset; the flash itself still
      // works without it. Silently best-effort.
      void probeChip(port).then((chip) => {
        if (chip === null) return
        // Skip when the user has moved past `ready` (e.g. already flashing).
        setStatus((prev) => (prev.state === 'ready' ? { ...prev, chipInfo: chip } : prev))
      })
    } catch (err) {
      // User cancelled the picker — stay in current state, no error UI.
      if (err instanceof DOMException && err.name === 'NotFoundError') return
      const message = err instanceof Error ? err.message : 'Failed to open port'
      setStatus((prev) => ({ ...prev, errorMessage: message }))
    }
  }, [])

  const reset = useCallback(() => {
    disconnectGuard.detach()
    portRef.current = null
    logBufferRef.current = ''
    logTruncatedRef.current = false
    // Preserve the resolved release across reset — it was fetched once on
    // mount and re-fetching on every "Flash again" would just hit the rate
    // limit for no UX benefit. Also preserve advanced options so power-users
    // don't have to re-toggle them between attempts in the same session.
    setStatus((prev) => ({
      ...INITIAL_STATUS,
      release: prev.release,
      advanced: prev.advanced,
      localFirmware: prev.localFirmware,
    }))
  }, [disconnectGuard])

  const setAdvanced = useCallback((opts: AdvancedOptions) => {
    advancedRef.current = opts
    setStatus((prev) => ({ ...prev, advanced: opts }))
  }, [])

  const setLocalFirmware = useCallback((firmware: LocalFirmware | null) => {
    localFirmwareRef.current = firmware
    setStatus((prev) => ({ ...prev, localFirmware: firmware }))
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
    logTruncatedRef.current = false
    setStatus(initFlashingStatus)

    if (isSimEnabled()) {
      await runSimFlash(appendLog, setStatus)
      return
    }

    const startedAt = performance.now()
    let tDownloadDone: number | null = null
    let tVerifyDone: number | null = null
    let tFlashDone: number | null = null
    let detectedChip: string | null = null

    const phaseMs = (
      from: number,
      to: number | null,
    ): number | null => (to === null ? null : Math.round(to - from))

    const buildPhaseTimings = (): {
      downloadMs: number | null
      verifyMs: number | null
      flashMs: number | null
    } => ({
      downloadMs: phaseMs(startedAt, tDownloadDone),
      verifyMs: tDownloadDone === null ? null : phaseMs(tDownloadDone, tVerifyDone),
      flashMs: tVerifyDone === null ? null : phaseMs(tVerifyDone, tFlashDone),
    })

    const abortController = new AbortController()
    downloadAbortRef.current = abortController

    let disconnectFiredDuringFlash = false
    disconnectGuard.attach(port, () => {
      disconnectFiredDuringFlash = true
      appendLog(`\n${DISCONNECT_DURING_FLASH_MESSAGE}\n`)
      setStatus((prev) => ({
        ...prev,
        state: 'failed',
        errorMessage: DISCONNECT_DURING_FLASH_MESSAGE,
      }))
      disconnectGuard.detach()
      void sendTelemetry({
        outcome: 'failed',
        chipFamily: detectedChip,
        firmwareVersion: releaseRef.current?.version ?? null,
        durationMs: Math.round(performance.now() - startedAt),
        ...buildPhaseTimings(),
        errorClass: 'disconnect',
      })
    })

    try {
      const advanced = advancedRef.current
      const local = localFirmwareRef.current
      let payload: Awaited<ReturnType<typeof acquirePayload>>

      if (local) {
        if (local.expectedSha256 && local.expectedSha256.toLowerCase() !== local.sha256) {
          throw new Error(
            `Local firmware SHA-256 mismatch (expected ${local.expectedSha256}, got ${local.sha256}). Refusing to flash.`,
          )
        }
        appendLog(`Using local firmware "${local.name}" (${String(local.bytes.byteLength)} bytes).\n`)
        appendLog(`SHA-256 ${local.sha256} ${local.expectedSha256 ? '(verified)' : '(unverified)'}.\n`)
        payload = {
          firmwareBytes: local.bytes,
          firmwareManifestUrl: '',
          firmwareExpectedSha256: null,
          spiffsBytes: null,
          spiffsManifestUrl: null,
          spiffsExpectedSha256: null,
        }
        tDownloadDone = performance.now()
        tVerifyDone = tDownloadDone
      } else {
        const overrideTag = advanced.versionOverride?.trim() ?? ''
        const activeRelease: Release | null = await resolveActiveRelease(
          releaseRef.current,
          overrideTag,
          appendLog,
        )
        payload = await acquirePayload(activeRelease, abortController.signal, {
          onLog: appendLog,
          onProgress: (p) => {
            setStatus((prev) => ({
              ...prev,
              downloadProgress: p.firmware ?? prev.downloadProgress,
              spiffsDownloadProgress: p.spiffs,
            }))
          },
        })
        tDownloadDone = performance.now()

        await verifyPayload(payload, appendLog)
        tVerifyDone = performance.now()
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
        firmware: payload.firmwareBytes,
        ...(payload.spiffsBytes ? { spiffs: payload.spiffsBytes } : {}),
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
      tFlashDone = performance.now()

      disconnectGuard.detach()
      downloadAbortRef.current = null
      setStatus((prev) => ({ ...prev, state: 'success' }))
      void sendTelemetry({
        outcome: 'success',
        chipFamily: detectedChip,
        firmwareVersion: releaseRef.current?.version ?? null,
        durationMs: Math.round(performance.now() - startedAt),
        ...buildPhaseTimings(),
        errorClass: null,
      })
    } catch (err) {
      disconnectGuard.detach()
      downloadAbortRef.current = null
      // Disconnect already produced the canonical failure state — don't
      // overwrite it with the cascading "port closed" error from esptool.
      if (disconnectFiredDuringFlash) return
      // User opted out via Cancel — return to idle instead of showing failure.
      if (err instanceof DOMException && err.name === 'AbortError') {
        portRef.current = null
        logBufferRef.current = ''
        logTruncatedRef.current = false
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
          ...buildPhaseTimings(),
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
        ...buildPhaseTimings(),
        errorClass: classifyError(err),
      })
    }
  }, [appendLog, disconnectGuard, releaseRef])

  const cancel = useCallback(() => {
    const controller = downloadAbortRef.current
    if (!controller) return
    controller.abort()
    downloadAbortRef.current = null
  }, [])

  const handlePromoteToReady = useCallback((port: SerialPort) => {
    setStatus((prev) => {
      if (prev.state !== 'idle') return prev
      portRef.current = port
      return { ...prev, port, state: 'ready', errorMessage: null }
    })
  }, [])

  const handleDemoteToIdle = useCallback(() => {
    setStatus((prev) => {
      // The flash-time disconnect guard owns the flashing-state case.
      if (prev.state !== 'ready') return prev
      portRef.current = null
      return { ...prev, port: null, state: 'idle' }
    })
  }, [])

  useAutoConnect({
    state: status.state,
    port: status.port,
    onPromoteToReady: handlePromoteToReady,
    onDemoteToIdle: handleDemoteToIdle,
  })

  return {
    ...status,
    release,
    selectPort,
    flash,
    reset,
    reselectPort,
    cancel,
    setAdvanced,
    setLocalFirmware,
  }
}
