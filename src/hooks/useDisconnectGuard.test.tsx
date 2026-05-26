// src/hooks/useDisconnectGuard.test.tsx
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDisconnectGuard } from './useDisconnectGuard'

const makePort = (id = 1): SerialPort =>
  ({
    __id: id,
    getInfo: () => ({}),
  }) as unknown as SerialPort

interface SerialMock {
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  getPorts: ReturnType<typeof vi.fn>
  requestPort: ReturnType<typeof vi.fn>
}

interface Registered {
  event: string
  handler: (event: Event) => void
}

const installSerialMock = (): { mock: SerialMock; listeners: Registered[] } => {
  const listeners: Registered[] = []
  const mock: SerialMock = {
    addEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
      listeners.push({ event, handler })
    }),
    removeEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
      const idx = listeners.findIndex((l) => l.event === event && l.handler === handler)
      if (idx >= 0) listeners.splice(idx, 1)
    }),
    getPorts: vi.fn().mockResolvedValue([]),
    requestPort: vi.fn(),
  }
  Object.defineProperty(globalThis.navigator, 'serial', {
    value: mock,
    configurable: true,
    writable: true,
  })
  return { mock, listeners }
}

const fireDisconnect = (listeners: Registered[], target: SerialPort | null): void => {
  for (const { event, handler } of listeners) {
    if (event === 'disconnect') {
      handler({ target } as unknown as Event)
    }
  }
}

describe('useDisconnectGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('attach registers a disconnect listener that fires for the matching port', () => {
    const { listeners } = installSerialMock()
    const port = makePort()
    const onDisconnect = vi.fn()

    const { result } = renderHook(() => useDisconnectGuard())

    act(() => {
      result.current.attach(port, onDisconnect)
    })

    expect(listeners).toHaveLength(1)
    expect(listeners[0]?.event).toBe('disconnect')

    fireDisconnect(listeners, port)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  it('does not fire onDisconnect for a different port', () => {
    const { listeners } = installSerialMock()
    const port = makePort(1)
    const otherPort = makePort(2)
    const onDisconnect = vi.fn()

    const { result } = renderHook(() => useDisconnectGuard())

    act(() => {
      result.current.attach(port, onDisconnect)
    })

    fireDisconnect(listeners, otherPort)
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('replaces the first listener when attach is called twice (one active guard)', () => {
    const { mock, listeners } = installSerialMock()
    const portA = makePort(1)
    const portB = makePort(2)
    const firstOnDisconnect = vi.fn()
    const secondOnDisconnect = vi.fn()

    const { result } = renderHook(() => useDisconnectGuard())

    act(() => {
      result.current.attach(portA, firstOnDisconnect)
    })
    act(() => {
      result.current.attach(portB, secondOnDisconnect)
    })

    expect(mock.addEventListener).toHaveBeenCalledTimes(2)
    expect(mock.removeEventListener).toHaveBeenCalledTimes(1)
    expect(listeners).toHaveLength(1)

    // First guard is gone — firing for portA no longer reaches the first cb.
    fireDisconnect(listeners, portA)
    expect(firstOnDisconnect).not.toHaveBeenCalled()
    expect(secondOnDisconnect).not.toHaveBeenCalled()

    // Second guard fires for portB.
    fireDisconnect(listeners, portB)
    expect(secondOnDisconnect).toHaveBeenCalledTimes(1)
  })

  it('detach removes the listener so subsequent events do not fire', () => {
    const { listeners } = installSerialMock()
    const port = makePort()
    const onDisconnect = vi.fn()

    const { result } = renderHook(() => useDisconnectGuard())

    act(() => {
      result.current.attach(port, onDisconnect)
    })
    act(() => {
      result.current.detach()
    })

    expect(listeners).toHaveLength(0)
    fireDisconnect(listeners, port)
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('detach with no active listener is a no-op', () => {
    const { mock } = installSerialMock()

    const { result } = renderHook(() => useDisconnectGuard())

    act(() => {
      result.current.detach()
    })

    expect(mock.removeEventListener).not.toHaveBeenCalled()
  })

  it('cleans up the listener on unmount (no leak)', () => {
    const { mock, listeners } = installSerialMock()
    const port = makePort()
    const onDisconnect = vi.fn()

    const { result, unmount } = renderHook(() => useDisconnectGuard())

    act(() => {
      result.current.attach(port, onDisconnect)
    })
    expect(listeners).toHaveLength(1)

    unmount()

    expect(mock.removeEventListener).toHaveBeenCalled()
    expect(listeners).toHaveLength(0)
  })
})
