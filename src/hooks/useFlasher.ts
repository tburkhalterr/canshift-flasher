// src/hooks/useFlasher.ts
import { useCallback, useRef, useState } from 'react'

import { SUPPORTED_USB_FILTERS } from '../constants'
import { flashFirmware, type FlashProgress } from '../lib/esptool'
import { downloadFirmware, type FirmwareDownloadProgress } from '../lib/firmware'

export type FlasherState = 'idle' | 'ready' | 'flashing' | 'success' | 'failed'

export interface FlasherStatus {
  state: FlasherState
  port: SerialPort | null
  errorMessage: string | null
  chipInfo: string | null
  downloadProgress: FirmwareDownloadProgress | null
  flashProgress: FlashProgress | null
  log: string
}

const INITIAL_STATUS: FlasherStatus = {
  state: 'idle',
  port: null,
  errorMessage: null,
  chipInfo: null,
  downloadProgress: null,
  flashProgress: null,
  log: '',
}

export interface FlasherActions {
  selectPort: () => Promise<void>
  flash: () => Promise<void>
  reset: () => void
  reselectPort: () => Promise<void>
}

export function useFlasher(): FlasherStatus & FlasherActions {
  const [status, setStatus] = useState<FlasherStatus>(INITIAL_STATUS)
  const portRef = useRef<SerialPort | null>(null)
  const logBufferRef = useRef<string>('')

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
    portRef.current = null
    logBufferRef.current = ''
    setStatus({ ...INITIAL_STATUS })
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
      flashProgress: null,
      log: '',
    }))

    try {
      appendLog('Downloading firmware...\n')
      const { bytes } = await downloadFirmware((dl) => {
        setStatus((prev) => ({ ...prev, downloadProgress: dl }))
      })
      appendLog(`Downloaded ${bytes.byteLength} bytes.\n`)

      await flashFirmware({
        port,
        firmware: bytes,
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
  }, [appendLog])

  return {
    ...status,
    selectPort,
    flash,
    reset,
    reselectPort,
  }
}
