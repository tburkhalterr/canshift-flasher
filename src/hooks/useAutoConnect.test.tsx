// src/hooks/useAutoConnect.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SUPPORTED_USB_FILTERS } from '../constants'
import * as sim from '../lib/sim'

import { useAutoConnect, type UseAutoConnectOptions } from './useAutoConnect'

interface MockPortOptions {
  vendorId?: number
  productId?: number
}

const makePort = (opts: MockPortOptions = {}): SerialPort => {
  return {
    getInfo: () => ({
      usbVendorId: opts.vendorId ?? SUPPORTED_USB_FILTERS[0]?.usbVendorId,
      usbProductId: opts.productId ?? SUPPORTED_USB_FILTERS[0]?.usbProductId,
    }),
  } as unknown as SerialPort
}

interface SerialMock {
  getPorts: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  requestPort: ReturnType<typeof vi.fn>
}

const installSerialMock = (overrides: Partial<SerialMock> = {}): SerialMock => {
  const mock: SerialMock = {
    getPorts: vi.fn().mockResolvedValue([]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestPort: vi.fn(),
    ...overrides,
  }
  Object.defineProperty(globalThis.navigator, 'serial', {
    value: mock,
    configurable: true,
    writable: true,
  })
  return mock
}

type EventHandler = (event: Event) => void

interface CapturedListeners {
  connect: EventHandler | null
  disconnect: EventHandler | null
}

const captureListeners = (): {
  serial: SerialMock
  listeners: CapturedListeners
} => {
  const listeners: CapturedListeners = { connect: null, disconnect: null }
  const serial = installSerialMock({
    getPorts: vi.fn().mockResolvedValue([]),
    addEventListener: vi.fn((event: string, handler: EventHandler) => {
      if (event === 'connect') listeners.connect = handler
      else if (event === 'disconnect') listeners.disconnect = handler
    }),
  })
  return { serial, listeners }
}

const defaultOpts = (
  overrides: Partial<UseAutoConnectOptions> = {},
): UseAutoConnectOptions => ({
  state: 'idle',
  port: null,
  onPromoteToReady: vi.fn(),
  onDemoteToIdle: vi.fn(),
  ...overrides,
})

describe('useAutoConnect', () => {
  beforeEach(() => {
    // Default: sim disabled. Individual tests can override.
    vi.spyOn(sim, 'isSimEnabled').mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('promotes to ready when exactly one supported port is already authorised', async () => {
    const port = makePort()
    installSerialMock({ getPorts: vi.fn().mockResolvedValue([port]) })
    const onPromoteToReady = vi.fn()
    const onDemoteToIdle = vi.fn()

    renderHook(() => useAutoConnect(defaultOpts({ onPromoteToReady, onDemoteToIdle })))

    await waitFor(() => {
      expect(onPromoteToReady).toHaveBeenCalledWith(port)
    })
    expect(onPromoteToReady).toHaveBeenCalledTimes(1)
    expect(onDemoteToIdle).not.toHaveBeenCalled()
  })

  it('does not promote when zero supported ports are authorised', async () => {
    installSerialMock({ getPorts: vi.fn().mockResolvedValue([]) })
    const onPromoteToReady = vi.fn()

    renderHook(() => useAutoConnect(defaultOpts({ onPromoteToReady })))

    // Allow microtasks/promises to settle.
    await Promise.resolve()
    await Promise.resolve()
    expect(onPromoteToReady).not.toHaveBeenCalled()
  })

  it('does not promote when multiple supported ports are authorised (ambiguous)', async () => {
    const portA = makePort()
    const portB = makePort({ vendorId: 0x10c4, productId: 0xea60 })
    installSerialMock({ getPorts: vi.fn().mockResolvedValue([portA, portB]) })
    const onPromoteToReady = vi.fn()

    renderHook(() => useAutoConnect(defaultOpts({ onPromoteToReady })))

    await Promise.resolve()
    await Promise.resolve()
    expect(onPromoteToReady).not.toHaveBeenCalled()
  })

  it('promotes to ready when a connect event leaves exactly one supported port', async () => {
    const port = makePort()
    const { serial, listeners } = captureListeners()

    const onPromoteToReady = vi.fn()
    renderHook(() => useAutoConnect(defaultOpts({ onPromoteToReady })))

    // Let the mount-time `promoteIfSingleMatch` settle without doing anything.
    await Promise.resolve()
    await Promise.resolve()
    expect(onPromoteToReady).not.toHaveBeenCalled()

    // Now simulate a plug-in: getPorts() resolves with one supported port.
    serial.getPorts.mockResolvedValue([port])
    expect(listeners.connect).not.toBeNull()
    listeners.connect?.({} as Event)

    await waitFor(() => {
      expect(onPromoteToReady).toHaveBeenCalledWith(port)
    })
  })

  it('demotes to idle when the current ready port emits disconnect', async () => {
    const port = makePort()
    const { listeners } = captureListeners()

    const onDemoteToIdle = vi.fn()
    renderHook(() =>
      useAutoConnect(defaultOpts({ state: 'ready', port, onDemoteToIdle })),
    )

    await Promise.resolve()
    expect(listeners.disconnect).not.toBeNull()
    listeners.disconnect?.({ target: port } as unknown as Event)

    expect(onDemoteToIdle).toHaveBeenCalledTimes(1)
  })

  it('ignores a disconnect event for a foreign port', async () => {
    const port = makePort()
    const otherPort = makePort({ vendorId: 0x10c4, productId: 0xea60 })
    const { listeners } = captureListeners()

    const onDemoteToIdle = vi.fn()
    renderHook(() =>
      useAutoConnect(defaultOpts({ state: 'ready', port, onDemoteToIdle })),
    )

    await Promise.resolve()
    listeners.disconnect?.({ target: otherPort } as unknown as Event)

    expect(onDemoteToIdle).not.toHaveBeenCalled()
  })

  it('ignores disconnect events while state !== ready (flash-time guard owns this)', async () => {
    const port = makePort()
    const { listeners } = captureListeners()

    const onDemoteToIdle = vi.fn()
    renderHook(() =>
      useAutoConnect(defaultOpts({ state: 'flashing', port, onDemoteToIdle })),
    )

    await Promise.resolve()
    listeners.disconnect?.({ target: port } as unknown as Event)

    expect(onDemoteToIdle).not.toHaveBeenCalled()
  })

  it('ignores disconnect events with a null event target', async () => {
    const port = makePort()
    const { listeners } = captureListeners()

    const onDemoteToIdle = vi.fn()
    renderHook(() =>
      useAutoConnect(defaultOpts({ state: 'ready', port, onDemoteToIdle })),
    )

    await Promise.resolve()
    listeners.disconnect?.({ target: null } as unknown as Event)

    expect(onDemoteToIdle).not.toHaveBeenCalled()
  })

  it('removes both connect and disconnect listeners on unmount', async () => {
    const serial = installSerialMock({
      getPorts: vi.fn().mockResolvedValue([]),
    })

    const { unmount } = renderHook(() => useAutoConnect(defaultOpts()))
    await Promise.resolve()

    unmount()

    const events = serial.removeEventListener.mock.calls.map((call) => call[0])
    expect(events).toContain('connect')
    expect(events).toContain('disconnect')
  })

  it('skips mount-time auto-promote when current state is not idle', async () => {
    const port = makePort()
    installSerialMock({ getPorts: vi.fn().mockResolvedValue([port]) })
    const onPromoteToReady = vi.fn()

    renderHook(() =>
      useAutoConnect(defaultOpts({ state: 'ready', port, onPromoteToReady })),
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(onPromoteToReady).not.toHaveBeenCalled()
  })

  it('auto-promotes with the simSelectPort() result when sim mode is enabled', async () => {
    const simPort = makePort()
    vi.spyOn(sim, 'isSimEnabled').mockReturnValue(true)
    vi.spyOn(sim, 'simSelectPort').mockReturnValue(simPort)
    // Serial is not used in sim mode but the hook still references it; provide
    // a stub to avoid accidental real-platform calls.
    installSerialMock()

    const onPromoteToReady = vi.fn()
    renderHook(() => useAutoConnect(defaultOpts({ onPromoteToReady })))

    await waitFor(() => {
      expect(onPromoteToReady).toHaveBeenCalledWith(simPort)
    })
  })
})
