// src/lib/reset.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESET_PASS_GAP_MS, RESET_VARIANT_ORDER, runResetSequence, type ResetVariant } from './reset'

interface SignalCall {
  dataTerminalReady: boolean
  requestToSend: boolean
}

interface MockPort {
  writable: WritableStream<Uint8Array> | null
  calls: SignalCall[]
  setSignals: (signals: SerialOutputSignals) => Promise<void>
}

function makeMockPort(): MockPort {
  const calls: SignalCall[] = []
  // A truthy `writable` is all `runResetSequence` checks.
  const writable = {} as unknown as WritableStream<Uint8Array>
  return {
    writable,
    calls,
    setSignals(signals) {
      calls.push({
        dataTerminalReady: Boolean(signals.dataTerminalReady),
        requestToSend: Boolean(signals.requestToSend),
      })
      return Promise.resolve()
    },
  }
}

describe('runResetSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function runUnderFakeTimers(promise: Promise<void>): Promise<void> {
    // Drain microtasks + scheduled timers until the promise settles.
    let settled = false
    promise.finally(() => {
      settled = true
    })
    // A few rounds of advancing timers covers the three-step sequences.
    for (let i = 0; i < 10 && !settled; i += 1) {
      await vi.advanceTimersByTimeAsync(200)
    }
    await promise
  }

  it('drives the classic DTR/RTS sequence in order', async () => {
    const port = makeMockPort()
    await runUnderFakeTimers(runResetSequence(port as unknown as SerialPort, 'classic'))

    expect(port.calls).toEqual([
      { dataTerminalReady: false, requestToSend: true },
      { dataTerminalReady: true, requestToSend: false },
      { dataTerminalReady: false, requestToSend: false },
    ])
  })

  it('drives the inverted sequence with DTR/RTS swapped on the boot pulse', async () => {
    const port = makeMockPort()
    await runUnderFakeTimers(runResetSequence(port as unknown as SerialPort, 'inverted'))

    expect(port.calls).toEqual([
      { dataTerminalReady: true, requestToSend: false },
      { dataTerminalReady: false, requestToSend: true },
      { dataTerminalReady: false, requestToSend: false },
    ])
  })

  it('drives the usb-jtag sequence as a single brief reset pulse', async () => {
    const port = makeMockPort()
    await runUnderFakeTimers(runResetSequence(port as unknown as SerialPort, 'usb-jtag'))

    expect(port.calls).toEqual([
      { dataTerminalReady: false, requestToSend: true },
      { dataTerminalReady: false, requestToSend: false },
    ])
  })

  it('skips silently when the port has no writable surface', async () => {
    const port = makeMockPort()
    port.writable = null
    await runUnderFakeTimers(runResetSequence(port as unknown as SerialPort, 'classic'))

    expect(port.calls).toHaveLength(0)
  })

  it('returns early when setSignals throws (port closed mid-sequence)', async () => {
    const port = makeMockPort()
    vi.spyOn(port, 'setSignals').mockRejectedValueOnce(
      new DOMException('The port is closed.', 'InvalidStateError'),
    )

    await expect(
      runUnderFakeTimers(runResetSequence(port as unknown as SerialPort, 'classic')),
    ).resolves.toBeUndefined()
    // Only the failing call was attempted — the loop bailed instead of
    // throwing or hammering the closed port.
    expect(port.setSignals).toHaveBeenCalledTimes(1)
  })

  it('waits the configured durations between steps', async () => {
    const port = makeMockPort()
    const setSignalsSpy = vi.spyOn(port, 'setSignals')

    const promise = runResetSequence(port as unknown as SerialPort, 'classic')

    // Step 1 fires synchronously inside the loop's first iteration.
    await Promise.resolve()
    expect(setSignalsSpy).toHaveBeenCalledTimes(1)

    // Advance past the 120ms wait — step 2 should now fire.
    await vi.advanceTimersByTimeAsync(120)
    expect(setSignalsSpy).toHaveBeenCalledTimes(2)

    // Advance past the 80ms wait — step 3 should now fire.
    await vi.advanceTimersByTimeAsync(80)
    expect(setSignalsSpy).toHaveBeenCalledTimes(3)

    await promise
  })
})

describe('RESET_VARIANT_ORDER', () => {
  it('includes every supported variant exactly once', () => {
    const expected: ResetVariant[] = ['classic', 'inverted', 'usb-jtag']
    expect(RESET_VARIANT_ORDER).toEqual(expected)
    expect(new Set(RESET_VARIANT_ORDER).size).toBe(RESET_VARIANT_ORDER.length)
  })
})

describe('RESET_PASS_GAP_MS', () => {
  it('exports a positive settle window', () => {
    expect(RESET_PASS_GAP_MS).toBeGreaterThan(0)
  })
})
