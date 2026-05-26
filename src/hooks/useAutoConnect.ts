// src/hooks/useAutoConnect.ts
import { useEffect, useLayoutEffect, useRef } from 'react'

import { SUPPORTED_USB_FILTERS } from '../constants'
import { isSimEnabled, simSelectPort } from '../lib/sim'

import type { FlasherState } from './useFlasher'

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

export interface UseAutoConnectOptions {
  /** Current state — only `idle` is promoted; only `ready` is demoted. */
  state: FlasherState
  /** Active port reference, used to ignore disconnects of foreign ports. */
  port: SerialPort | null
  /** Called when a single supported port is found while in `idle`. */
  onPromoteToReady: (port: SerialPort) => void
  /** Called when the current `ready` port is unplugged. */
  onDemoteToIdle: () => void
}

/**
 * Auto-select a previously-authorised port on mount, and keep the
 * idle ↔ ready transition in sync when the user (un)plugs the dash.
 * StrictMode safe: the cleanup removes the same handler instances added.
 *
 * Mirrors the mount-only semantics of the original `useFlasher` effect —
 * the handlers read the latest `state` / `port` via refs so the effect
 * doesn't re-attach listeners on every state change.
 */
export function useAutoConnect(opts: UseAutoConnectOptions): void {
  const { state, port, onPromoteToReady, onDemoteToIdle } = opts

  const stateRef = useRef(state)
  const portRef = useRef(port)
  const onPromoteRef = useRef(onPromoteToReady)
  const onDemoteRef = useRef(onDemoteToIdle)

  // Sync refs with the latest props synchronously before paint so the
  // listeners registered in the mount effect always read fresh values.
  useLayoutEffect(() => {
    stateRef.current = state
    portRef.current = port
    onPromoteRef.current = onPromoteToReady
    onDemoteRef.current = onDemoteToIdle
  })

  useEffect(() => {
    let cancelled = false

    // Sim mode: auto-promote idle → ready with a fake port so contributors
    // land on the "Flash latest" button on first paint. Deferred via Promise
    // microtask to satisfy `react-hooks/set-state-in-effect`.
    if (isSimEnabled()) {
      void Promise.resolve().then(() => {
        if (cancelled) return
        if (stateRef.current !== 'idle') return
        onPromoteRef.current(simSelectPort())
      })
      return () => {
        cancelled = true
      }
    }

    const promoteIfSingleMatch = async (): Promise<void> => {
      const found = await findSingleSupportedPort()
      if (cancelled || !found) return
      // Don't disrupt anything past idle — auto-select only ever transitions
      // idle → ready. Other states own the port lifecycle themselves.
      if (stateRef.current !== 'idle') return
      onPromoteRef.current(found)
    }

    const handleConnect = (): void => {
      void promoteIfSingleMatch()
    }

    const handleDisconnect = (event: Event): void => {
      const target = (event as Event & { target: SerialPort | null }).target
      if (!target) return
      // The flash-time disconnect handler owns the flashing-state case.
      if (stateRef.current !== 'ready' || portRef.current !== target) return
      onDemoteRef.current()
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
}
