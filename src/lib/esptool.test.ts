// src/lib/esptool.test.ts
//
// Coverage limited by design: the full flash flow requires a real Web Serial
// port + a real ESP32 stub. We mock `esptool-js` and `runResetSequence` to
// cover only the variant-order retry logic — the part that's pure control
// flow over our own code.
//
// The end-to-end flash (loader.main + writeFlash on a live transport) is
// tracked separately for a future Playwright + hardware-in-the-loop suite.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResetVariant } from './reset'

// --- mock `esptool-js` --------------------------------------------------

const mockMain = vi.fn<() => Promise<string>>()
const mockWriteFlash = vi.fn<() => Promise<void>>()
const mockAfter = vi.fn<(action: string) => Promise<void>>()
const mockDisconnect = vi.fn<() => Promise<void>>()

vi.mock('esptool-js', () => {
  class Transport {
    constructor(public port: SerialPort, public tracing: boolean) {}
    disconnect = mockDisconnect
  }
  class ESPLoader {
    constructor(public options: unknown) {}
    main = mockMain
    writeFlash = mockWriteFlash
    after = mockAfter
  }
  return { Transport, ESPLoader }
})

// --- mock `./reset` -----------------------------------------------------

const mockRunResetSequence = vi.fn<(port: SerialPort, variant: ResetVariant) => Promise<void>>()

vi.mock('./reset', async () => {
  const actual = await vi.importActual<typeof import('./reset')>('./reset')
  return {
    ...actual,
    runResetSequence: (port: SerialPort, variant: ResetVariant) =>
      mockRunResetSequence(port, variant),
  }
})

// --- imports MUST come after vi.mock calls above ------------------------

const { flashFirmware, isSerialNoiseError } = await import('./esptool')
const { RESET_VARIANT_ORDER } = await import('./reset')

// --- fixtures -----------------------------------------------------------

function makeFakePort(): SerialPort {
  return {
    writable: {} as WritableStream<Uint8Array>,
    setSignals: vi.fn(() => Promise.resolve()),
  } as unknown as SerialPort
}

function makeBaseOptions(): {
  port: SerialPort
  firmware: Uint8Array
  onLog: (line: string) => void
  onProgress: (progress: { written: number; total: number }) => void
} {
  return {
    port: makeFakePort(),
    firmware: new Uint8Array([0x01, 0x02, 0x03]),
    onLog: vi.fn<(line: string) => void>(),
    onProgress: vi.fn<(progress: { written: number; total: number }) => void>(),
  }
}

describe('flashFirmware (variant retry order)', () => {
  beforeEach(() => {
    mockMain.mockReset()
    mockWriteFlash.mockReset().mockResolvedValue(undefined)
    mockAfter.mockReset().mockResolvedValue(undefined)
    mockDisconnect.mockReset().mockResolvedValue(undefined)
    mockRunResetSequence.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the first variant when it succeeds and does not try later variants', async () => {
    mockMain.mockResolvedValueOnce('ESP32-S3')

    const opts = makeBaseOptions()
    await flashFirmware(opts)

    expect(mockRunResetSequence).toHaveBeenCalledTimes(1)
    expect(mockRunResetSequence).toHaveBeenCalledWith(opts.port, RESET_VARIANT_ORDER[0])
    expect(mockWriteFlash).toHaveBeenCalledTimes(1)
    expect(mockAfter).toHaveBeenCalledWith('hard_reset')
  })

  it('falls through to subsequent variants on bootloader entry failure', async () => {
    mockMain.mockRejectedValueOnce(new Error('classic failed'))
    mockMain.mockResolvedValueOnce('ESP32-S3')

    const opts = makeBaseOptions()
    await flashFirmware(opts)

    expect(mockRunResetSequence).toHaveBeenCalledTimes(2)
    expect(mockRunResetSequence.mock.calls[0]?.[1]).toBe(RESET_VARIANT_ORDER[0])
    expect(mockRunResetSequence.mock.calls[1]?.[1]).toBe(RESET_VARIANT_ORDER[1])
    expect(mockWriteFlash).toHaveBeenCalledTimes(1)
  })

  it('tries every variant in declared order before giving up', async () => {
    for (let i = 0; i < RESET_VARIANT_ORDER.length; i += 1) {
      mockMain.mockRejectedValueOnce(new Error(`variant ${String(i)} failed`))
    }

    const opts = makeBaseOptions()
    await expect(flashFirmware(opts)).rejects.toThrow(/Could not enter ESP32 bootloader/i)

    expect(mockRunResetSequence).toHaveBeenCalledTimes(RESET_VARIANT_ORDER.length)
    RESET_VARIANT_ORDER.forEach((variant, i) => {
      expect(mockRunResetSequence.mock.calls[i]?.[1]).toBe(variant)
    })
    expect(mockWriteFlash).not.toHaveBeenCalled()
  })

  it('preserves the last error as `.cause` when all variants fail', async () => {
    const lastError = new Error('usb-jtag failed last')
    mockMain.mockRejectedValueOnce(new Error('first'))
    mockMain.mockRejectedValueOnce(new Error('second'))
    mockMain.mockRejectedValueOnce(lastError)

    const opts = makeBaseOptions()
    const err = await flashFirmware(opts).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error & { cause?: unknown }).cause).toBe(lastError)
  })

  // TODO: cover the full flash flow (loader.main → writeFlash → hard reset
  // against a real Transport) in a Playwright + hardware-in-the-loop suite.
  // Mocking esptool-js can only validate our own control flow.
  it.skip('end-to-end flash against a real port is covered by Playwright (future)', () => {
    /* tracked separately */
  })
})

describe('isSerialNoiseError', () => {
  it('returns false for non-Error values', () => {
    expect(isSerialNoiseError(null)).toBe(false)
    expect(isSerialNoiseError(undefined)).toBe(false)
    expect(isSerialNoiseError('Invalid head of packet')).toBe(false)
    expect(isSerialNoiseError({ message: 'Invalid head of packet' })).toBe(false)
  })

  it('returns false for unrelated Error messages', () => {
    expect(isSerialNoiseError(new Error('The port is already open'))).toBe(false)
    expect(isSerialNoiseError(new Error('Failed to connect with the device'))).toBe(false)
    expect(isSerialNoiseError(new Error(''))).toBe(false)
  })

  // The four representative strings below are pinned to esptool-js
  // `lib/webserial.js`. Any upstream re-wording will fail these tests instead
  // of silently disabling the baud-rate fallback (the regression that
  // motivated #164).
  it.each([
    ['Invalid head of packet (0xff): Possible serial noise or corruption.'],
    ['Serial data stream stopped: Possible serial noise or corruption.'],
    ['No serial data received.'],
    ['something something noise or corruption something'],
  ])('matches representative esptool-js noise message: %s', (message) => {
    expect(isSerialNoiseError(new Error(message))).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(isSerialNoiseError(new Error('INVALID HEAD OF PACKET'))).toBe(true)
    expect(isSerialNoiseError(new Error('no serial data received'))).toBe(true)
  })

  it('treats Error subclasses the same as plain Error', () => {
    class CustomError extends Error {}
    expect(isSerialNoiseError(new CustomError('Invalid head of packet'))).toBe(true)
  })
})
