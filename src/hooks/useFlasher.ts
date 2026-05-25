// src/hooks/useFlasher.ts
import { useCallback, useEffect, useRef, useState } from 'react'

import { FIRMWARE_URL, SUPPORTED_USB_FILTERS } from '../constants'
import { flashFirmware, type FlashProgress } from '../lib/esptool'
import { downloadFirmware, type FirmwareDownloadProgress } from '../lib/firmware'
import { verifyFirmwareSha256 } from '../lib/integrity'
import { fetchLatestRelease, type Release } from '../lib/releases'
import { classifyError, sendTelemetry } from '../lib/telemetry'

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
  flashProgress: FlashProgress | null
  log: string
  release: Release | null
}

const INITIAL_STATUS: FlasherStatus = {
  state: 'idle',
  port: null,
  errorMessage: null,
  chipInfo: null,
  downloadProgress: null,
  flashProgress: null,
  log: '',
  release: null,
}

export interface FlasherActions {
  selectPort: () => Promise<void>
  flash: () => Promise<void>
  reset: () => void
  reselectPort: () => Promise<void>
  cancel: () => void
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
    // limit for no UX benefit.
    setStatus((prev) => ({ ...INITIAL_STATUS, release: prev.release }))
  }, [detachFlashDisconnectHandler])

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
      flashProgress: null,
      log: '',
    }))

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
      const release = releaseRef.current
      const firmwareUrl = release?.firmwareAsset?.url ?? null
      if (release && firmwareUrl) {
        appendLog(`Downloading firmware v${release.version}...\n`)
      } else {
        if (release && !firmwareUrl) {
          // Release metadata loaded but the merged asset was missing —
          // fall back to FIRMWARE_URL so the user still gets a working flow.
          console.warn(
            'Latest release has no firmware asset matching the merged image pattern — falling back to FIRMWARE_URL.',
          )
          appendLog('Latest release missing firmware asset — falling back to static URL.\n')
        } else if (!release) {
          console.warn('Release metadata unavailable — falling back to FIRMWARE_URL.')
          appendLog('Release metadata unavailable — falling back to static URL.\n')
        }
        appendLog('Downloading firmware...\n')
      }
      const downloadUrl = firmwareUrl ?? FIRMWARE_URL
      const { bytes } = await downloadFirmware(
        downloadUrl,
        (dl) => {
          setStatus((prev) => ({ ...prev, downloadProgress: dl }))
        },
        abortController.signal,
      )
      appendLog(`Downloaded ${bytes.byteLength} bytes.\n`)

      // Mandatory SHA-256 verification (#4). A missing or malformed `.sha256`
      // sibling is a hard fail — there is no opt-out flag. Same gate for the
      // FIRMWARE_URL fallback path: deployments using a self-hosted mirror
      // MUST publish a `${FIRMWARE_URL}.sha256` next to the binary.
      const manifestUrl = `${downloadUrl}.sha256`
      appendLog('Verifying firmware SHA-256...\n')
      const digest = await verifyFirmwareSha256(bytes, manifestUrl)
      appendLog(`Firmware SHA-256 OK (${digest}).\n`)

      // Once writeFlash is about to start, cancellation is no longer offered —
      // drop the controller so the UI hides the Cancel button.
      downloadAbortRef.current = null

      await flashFirmware({
        port,
        firmware: bytes,
        onLog: appendLog,
        onProgress: (progress) => {
          setStatus((prev) => ({ ...prev, flashProgress: progress }))
        },
        onChipInfo: (chip) => {
          detectedChip = chip
          setStatus((prev) => ({ ...prev, chipInfo: chip }))
        },
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
        setStatus((prev) => ({ ...INITIAL_STATUS, release: prev.release }))
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
  }
}
