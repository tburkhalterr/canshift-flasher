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

/**
 * Minimal fake Release the state-machine tests can hand to the flasher.
 * The static `FIRMWARE_URL` fallback was removed in REF-11 (#137), so every
 * test that exercises the network-fetch path now needs a release object —
 * `acquirePayload(null, ...)` throws by design.
 */
const makeFakeRelease = (): releases.Release => ({
  version: '1.0.0',
  tag: 'v1.0.0',
  publishedAt: '2025-01-01T00:00:00Z',
  notes: '',
  prerelease: false,
  htmlUrl: 'https://github.com/tburkhalterr/CANShift/releases/tag/v1.0.0',
  firmwareAsset: {
    url: 'https://api.github.com/repos/tburkhalterr/CANShift/releases/assets/1',
    sizeBytes: 3,
    expectedSha256: null,
    sha256Url: 'https://api.github.com/repos/tburkhalterr/CANShift/releases/assets/2',
  },
  spiffsAsset: null,
})

/**
 * Build a successful `downloadFirmwareBundle` resolved value for a given byte
 * buffer. REF-11 (#137) routed every flash through the bundle path — the
 * legacy `downloadFirmware` direct call is gone.
 */
const makeBundleResult = (bytes: Uint8Array): firmware.FirmwareBundle => ({
  firmware: { bytes, size: bytes.byteLength },
  firmwareManifestUrl:
    'https://api.github.com/repos/tburkhalterr/CANShift/releases/assets/2',
  spiffs: null,
  spiffsManifestUrl: null,
})

describe('useFlasher state machine', () => {
  let downloadSpy: ReturnType<typeof vi.spyOn>
  let flashSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // REF-11 (#137): the static FIRMWARE_URL fallback was removed, so the
    // hook now always goes through `downloadFirmwareBundle`. Spy on the bundle
    // entry point — `downloadFirmware` is only called internally by the bundle
    // helper and a module-local spy wouldn't intercept that call.
    downloadSpy = vi.spyOn(firmware, 'downloadFirmwareBundle')
    flashSpy = vi.spyOn(esptool, 'flashFirmware')
    // Bypass the SHA-256 gate so tests can focus on the state-machine wiring.
    // Real integrity behaviour is covered by lib/integrity tests; real
    // release-fetch behaviour by lib/releases.
    vi.spyOn(integrity, 'verifyFirmwareSha256').mockResolvedValue(
      '0000000000000000000000000000000000000000000000000000000000000000',
    )
    // REF-11 (#137): the bundle path requires a release with a firmware
    // asset. Tests that need to exercise the "no release" path mock this
    // individually.
    vi.spyOn(releases, 'fetchLatestRelease').mockResolvedValue(makeFakeRelease())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in idle and transitions idle → ready → flashing → success', async () => {
    const port = makePort()
    const serial = installSerialMock({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    downloadSpy.mockResolvedValue(makeBundleResult(new Uint8Array([1, 2, 3])))
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

    downloadSpy.mockResolvedValue(makeBundleResult(new Uint8Array([1])))
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

  it('stays silent (no error UI) when the user cancels a populated picker', async () => {
    // Two supported ports are already authorised — picker had something to
    // show, so NotFoundError must be a real cancel. Silent path. See #110.
    // Two ports (not one) keep `useAutoConnect` from auto-promoting to ready
    // so we can still observe that `selectPort` itself produced no error.
    // Two distinct supported bridges so the auto-connect helper (which
    // only promotes when exactly one port is available) leaves the hook
    // in `idle` and `selectPort` is the only thing under test. IDs mirror
    // the CH340 + CH9102 entries in `SUPPORTED_USB_FILTERS`.
    const portA = makePort({ vendorId: 0x1a86, productId: 0x7523 })
    const portB = makePort({ vendorId: 0x1a86, productId: 0x55d4 })
    installSerialMock({
      requestPort: vi
        .fn()
        .mockRejectedValue(new DOMException('No port selected', 'NotFoundError')),
      getPorts: vi.fn().mockResolvedValue([portA, portB]),
    })

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    expect(result.current.errorMessage).toBeNull()
    expect(result.current.port).toBeNull()
  })

  it('shows the plug-it-in hint when the picker had no supported port to show', async () => {
    // Web Serial fires the same NotFoundError whether the user cancelled a
    // populated picker or dismissed an empty one. `getPorts` returning no
    // supported entries disambiguates — surface a hint instead of silently
    // doing nothing. See #110.
    installSerialMock({
      requestPort: vi
        .fn()
        .mockRejectedValue(new DOMException('No port selected', 'NotFoundError')),
      getPorts: vi.fn().mockResolvedValue([]),
    })

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.port).toBeNull()
    expect(result.current.errorMessage).toBe(
      'No supported ESP32 detected. Plug the ESP32 in via USB, then click Connect again — see Troubleshooting for cable / driver tips.',
    )
  })

  it('stays silent when only unsupported ports are authorised and the user cancels', async () => {
    // Mirror of the "cancelled populated picker" case but with only
    // unsupported ports authorised. Under the new logic this is treated as
    // "nothing supported to show" — hint surfaces. Guard against a future
    // regression where unsupported ports get counted as "supported".
    const unsupportedPort = makePort({ vendorId: 0xdead, productId: 0xbeef })
    installSerialMock({
      requestPort: vi
        .fn()
        .mockRejectedValue(new DOMException('No port selected', 'NotFoundError')),
      getPorts: vi.fn().mockResolvedValue([unsupportedPort]),
    })

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    expect(result.current.errorMessage).toContain('No supported ESP32 detected')
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

    downloadSpy.mockResolvedValue(makeBundleResult(new Uint8Array([1])))
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

    downloadSpy.mockResolvedValue(makeBundleResult(new Uint8Array([1])))
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

  it('coalesces rapid flashFirmware onProgress callbacks into one rAF batch', async () => {
    // Per-chunk callbacks fire dozens of times per second on a real flash.
    // Each one used to be its own `setStatus(prev => ...)` → full
    // reconciliation including the LogStream subtree. The hook now buffers
    // pending progress in refs and flushes once per animation frame, mirroring
    // the buffering `appendLog` already does. See #105 (PERF-003).
    const port = makePort()
    installSerialMock({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    // Drive the test rAF cadence by hand so we can fire callbacks between frames.
    vi.useFakeTimers()
    const rafCallbacks: FrameRequestCallback[] = []
    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {
      /* tests drain by invoking callbacks directly */
    })

    downloadSpy.mockResolvedValue({ bytes: new Uint8Array([1]), size: 1 })

    // Hold flashFirmware open so we can fire many onProgress callbacks before
    // the success transition lands and we lose the chance to observe coalescing.
    let firedProgress: ((progress: { written: number; total: number }) => void) | null = null
    let resolveFlash: (() => void) | null = null
    flashSpy.mockImplementation((opts: esptool.FlashRunOptions) => {
      firedProgress = opts.onProgress
      return new Promise<void>((resolve) => {
        resolveFlash = resolve
      })
    })

    const { result } = renderHook(() => useFlasher())

    await act(async () => {
      await result.current.selectPort()
    })

    act(() => {
      void result.current.flash()
    })

    // Wait for flashFirmware to be invoked and hand us its onProgress.
    await vi.waitFor(() => {
      expect(firedProgress).not.toBeNull()
    })

    // Drain the rAFs the flashing-state transition itself scheduled — only
    // post-drain rAFs count as progress-induced.
    act(() => {
      while (rafCallbacks.length > 0) {
        const cb = rafCallbacks.shift()
        cb?.(performance.now())
      }
    })
    const rafBaseline = rafSpy.mock.calls.length

    // Fire 100 progress callbacks in a tight loop — same shape as a chatty
    // esptool stream. Without coalescing this would be 100 setStatus calls
    // and 100 React reconciliations; with rAF batching it must schedule at
    // most one rAF until the next frame fires.
    act(() => {
      for (let i = 0; i < 100; i++) {
        firedProgress?.({ written: i, total: 100 })
      }
    })

    const rafScheduledByProgress = rafSpy.mock.calls.length - rafBaseline
    expect(rafScheduledByProgress).toBe(1)
    // Pending progress should not yet be on state — coalescing means the
    // rAF callback hasn't run, so `flashProgress` is still null.
    expect(result.current.flashProgress).toBeNull()

    // Flush the queued rAF — the latest value (99 / 100) must land on state.
    act(() => {
      const cb = rafCallbacks.shift()
      cb?.(performance.now())
    })
    expect(result.current.flashProgress).toEqual({ written: 99, total: 100 })

    // A second burst after the flush should schedule exactly one more rAF.
    const rafAfterFirstFlush = rafSpy.mock.calls.length
    act(() => {
      for (let i = 0; i < 50; i++) {
        firedProgress?.({ written: 200 + i, total: 100 })
      }
    })
    expect(rafSpy.mock.calls.length - rafAfterFirstFlush).toBe(1)

    // Let the flash settle so the hook unmounts cleanly.
    act(() => {
      resolveFlash?.()
    })

    vi.useRealTimers()
  })

  it('clears errorClass back to null when a fresh flash starts', async () => {
    const port = makePort()
    installSerialMock({
      requestPort: vi.fn().mockResolvedValue(port),
    })

    downloadSpy.mockResolvedValue(makeBundleResult(new Uint8Array([1])))
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
