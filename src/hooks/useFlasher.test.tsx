// src/hooks/useFlasher.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SUPPORTED_USB_FILTERS } from '../constants'
import * as esptool from '../lib/esptool'
import * as firmware from '../lib/firmware'

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

describe('useFlasher state machine', () => {
  let downloadSpy: ReturnType<typeof vi.spyOn>
  let flashSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    downloadSpy = vi.spyOn(firmware, 'downloadFirmware')
    flashSpy = vi.spyOn(esptool, 'flashFirmware')
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
    expect(result.current.log).toContain('Error: esptool exploded')
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
})
