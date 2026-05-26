// src/hooks/useDisconnectGuard.ts
import { useCallback, useEffect, useRef } from 'react'

export interface UseDisconnectGuardResult {
  /** Attach a one-shot disconnect listener for `port`. */
  attach: (port: SerialPort, onDisconnect: () => void) => void
  /** Detach the active listener, if any. */
  detach: () => void
}

/**
 * Owns the one-shot disconnect listener attached when entering `flashing`.
 * Fires `onDisconnect` if the active port vanishes mid-flash. Cleanup on
 * unmount.
 */
export function useDisconnectGuard(): UseDisconnectGuardResult {
  const handlerRef = useRef<((event: Event) => void) | null>(null)

  const detach = useCallback(() => {
    const handler = handlerRef.current
    if (handler) {
      navigator.serial.removeEventListener('disconnect', handler)
      handlerRef.current = null
    }
  }, [])

  const attach = useCallback(
    (port: SerialPort, onDisconnect: () => void) => {
      // Replace any previous handler — only one active guard at a time.
      detach()
      const handler = (event: Event): void => {
        const target = (event as Event & { target: SerialPort | null }).target
        if (target !== port) return
        onDisconnect()
      }
      handlerRef.current = handler
      navigator.serial.addEventListener('disconnect', handler)
    },
    [detach],
  )

  useEffect(() => {
    return () => {
      const handler = handlerRef.current
      if (handler) {
        navigator.serial.removeEventListener('disconnect', handler)
        handlerRef.current = null
      }
    }
  }, [])

  return { attach, detach }
}
