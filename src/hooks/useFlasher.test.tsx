// src/hooks/useFlasher.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SUPPORTED_USB_FILTERS } from '../constants'
import * as esptool from '../lib/esptool'
import * as firmware from '../lib/firmware'
import * as integrity from '../lib/integrity'
import * as releases from '../lib/releases'

import { useFlasher } from './useFlasher'

interface MockPortOptions {
  vendorId?: number
  productId?: number
}

function makePort(opts: MockPortOptions = {}): SerialPort {
  return {
    getInfo: () => ({
      usbVendorId: opts.vendorId ?? SUPPORTED_USB_FILTERS[0]?.usbVendorId,
      usbProductId: opts.productId ?? SUPPORTED_USB_FILTERS[0]?.usbProductId,
    }),
  } as unknown as SerialPort
}

interface SerialMock {
  requestPort: ReturnType<typeof vi.fn>
  getPorts: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

interface RegisteredListener {
  event: string
  handler: (event: Event) => void
}

function installSerialMock(overrides: Partial<SerialMock> = {}): SerialMock {
  const mock: SerialMock = {
    requestPort: vi.fn(),
    getPorts: vi.fn().mockResolvedValue([]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides,
  }
  Object.defineProperty(globalThis.navigator, 'serial', {
    value: mock,
    configurable: true,
    writable: true,
  })
  return mock
}

/**
 * Variant of `installSerialMock` that records add/removeEventListener calls
 * so a test can synthesise a `disconnect` event mid-flash.
 */
function installSerialMockWithListeners(
  overrides: Partial<SerialMock> = {},
): { mock: SerialMock; listeners: RegisteredListener[] } {
  const listeners: RegisteredListener[] = []
  const mock: SerialMock = {
    requestPort: vi.fn(),
    getPorts: vi.fn().mockResolvedValue([]),
    addEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
      listeners.push({ event, handler })
    }),
    removeEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
      const idx = listeners.findIndex((l) => l.event === event && l.handler === handler)
      if (idx >= 0) listeners.splice(idx, 1)
    }),
    ...overrides,
  }
  Object.defineProperty(globalThis.navigator, 'serial', {
    value: mock,
    configurable: true,
    writable: true,
  })
  return { mock, listeners }
}

const fireDisconnect = (listeners: RegisteredListener[], target: SerialPort): void => {
  for (const { event, handler } of listeners) {
    if (event === 'disconnect') {
      handler({ target } as unknown as Event)
    }
  }
}

describe('useFlasher state machine', () => {
  let downloadSpy: ReturnType<typeof vi.spyOn>
  let flashSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    downloadSpy = vi.spyOn(firmware, 'downloadFirmware')
    flashSpy = vi.spyOn(esptool, 'flashFirmware')
    // Bypass the SHA-256 gate and the GitHub Releases lookup so tests can
    // focus on the state-machine wiring. Real integrity behaviour is covered
    // by lib/integrity tests; real release-fetch behaviour by lib/releases.
    vi.spyOn(integrity, 'verifyFirmwareSha256').mockResolvedValue(
      '0000000000000000000000000000000000000000000000000000000000000000',
    )
    vi.spyOn(releases, 'fetchLatestRelease').mockRejectedValue(
      new Error('test: release lookup disabled'),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in idle and transitions idle → ready → flashing → success', async () => {
    const port = makePort()
    const serial = installSerialMock({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    downloadSpy.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), size: 3 })
    flashSpy.mockResolvedValue(undefined)

    const { result } = renderHook(() => useFlasher())

    expect(result.current.state).toBe('idle')

    await act(async () => {
      await result.current.selectPort()
    })
    expect(serial.requestPort).toHaveBeenCalledWith({ filters: SUPPORTED_USB_FILTERS })
    expect(result.current.state).toBe('ready')
    expect(result.current.port).toBe(port)

    await act(async () => {
      await result.current.flash()
    })

    await waitFor(() => {
      expect(result.current.state).toBe('success')
    })
    expect(downloadSpy).toHaveBeenCalledOnce()
    expect(flashSpy).toHaveBeenCalledOnce()
    expect(result.current.errorMessage).toBeNull()
  })

  it('transitions flashing → failed when flashFirmware throws', async () => {
    const port = makePort()
    installSerialMock({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    downloadSpy.mockResolvedValue({ bytes: new Uint8Array([1]), size: 1 })
    flashSpy.mockRejectedValue(new Error('esptool exploded'))

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    await act(async () => {
      await result.current.flash()
    })

    await waitFor(() => {
      expect(result.current.state).toBe('failed')
    })
    expect(result.current.errorMessage).toBe('esptool exploded')
    // The log buffer is rAF-coalesced (see useFlasher#appendLog), so wait
    // for the next frame to flush before asserting on its contents.
    await waitFor(() => {
      expect(result.current.log).toContain('Error: esptool exploded')
    })
  })

  it('stays in idle (no error UI) when the user cancels the picker', async () => {
    installSerialMock({
      requestPort: vi
        .fn()
        .mockRejectedValue(new DOMException('No port selected', 'NotFoundError')),
    })

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.errorMessage).toBeNull()
    expect(result.current.port).toBeNull()
  })

  it('returns to idle without failure state when flash is cancelled mid-download', async () => {
    const port = makePort()
    installSerialMock({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    downloadSpy.mockRejectedValue(new DOMException('aborted', 'AbortError'))

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    await act(async () => {
      await result.current.flash()
    })

    await waitFor(() => {
      expect(result.current.state).toBe('idle')
    })
    expect(result.current.errorMessage).toBeNull()
  })

  it('records errorMessage when flash is invoked without a selected port', async () => {
    installSerialMock()

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.flash()
    })

    expect(result.current.state).toBe('failed')
    expect(result.current.errorMessage).toBe('No port selected')
  })

  it('classifies typed errors into errorClass so FailedView can route the user', async () => {
    const port = makePort()
    installSerialMock({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    downloadSpy.mockResolvedValue({ bytes: new Uint8Array([1]), size: 1 })
    // FlashIdError is one of the typed buckets in `classifyError`; use a
    // generic Error here to assert the default fallback bucket is still
    // attached to the FlasherStatus. `'unknown'` matches the regex-fallback
    // path in classifyByMessage.
    flashSpy.mockRejectedValue(new Error('something went sideways'))

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    await act(async () => {
      await result.current.flash()
    })

    await waitFor(() => {
      expect(result.current.state).toBe('failed')
    })
    expect(result.current.errorClass).toBe('unknown')
  })

  it('marks errorClass=disconnect when the port vanishes mid-flash', async () => {
    const port = makePort()
    const { listeners } = installSerialMockWithListeners({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    downloadSpy.mockResolvedValue({ bytes: new Uint8Array([1]), size: 1 })
    // Hold `flashFirmware` pending so we can synthesise a disconnect event
    // while the hook is still in `flashing`. The hook resolves the failed
    // state from the disconnect handler — we never settle this promise.
    flashSpy.mockImplementation(() => new Promise(() => { /* never resolves */ }))

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    // Kick off flash but don't await it — it never resolves on its own.
    act(() => {
      void result.current.flash()
    })

    // Wait until the disconnect guard has attached before firing the event.
    await waitFor(() => {
      expect(listeners.some((l) => l.event === 'disconnect')).toBe(true)
    })

    act(() => {
      fireDisconnect(listeners, port)
    })

    await waitFor(() => {
      expect(result.current.state).toBe('failed')
    })
    expect(result.current.errorClass).toBe('disconnect')
    expect(result.current.errorMessage).toContain('USB connection lost')
  })

  it('clears errorClass back to null when a fresh flash starts', async () => {
    const port = makePort()
    installSerialMock({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    downloadSpy.mockResolvedValue({ bytes: new Uint8Array([1]), size: 1 })
    flashSpy.mockRejectedValueOnce(new Error('first run blew up'))

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    await act(async () => {
      await result.current.flash()
    })

    await waitFor(() => {
      expect(result.current.state).toBe('failed')
    })
    expect(result.current.errorClass).toBe('unknown')

    // Second attempt — `initFlashingStatus` should null out errorClass as
    // soon as flashing begins, even before the next outcome resolves.
    flashSpy.mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.flash()
    })

    await waitFor(() => {
      expect(result.current.state).toBe('success')
    })
    expect(result.current.errorClass).toBeNull()
  })
})
