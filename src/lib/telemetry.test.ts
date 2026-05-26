// src/lib/telemetry.test.ts
//
// Intentionally minimal: `classifyError` is about to be rewritten in issue
// #51 to use typed `instanceof` checks instead of regex, so deep regex-shape
// tests would just be thrown away. We cover the opt-out + transport
// behaviour of `sendTelemetry` plus one smoke test for `classifyError`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TelemetryEvent } from './telemetry'

const OPT_OUT_KEY = 'canshift-flasher.telemetry.optout'
const FAKE_TELEMETRY_URL = 'https://telemetry.example.test/collect'

interface TelemetryModule {
  sendTelemetry: (event: TelemetryEvent) => Promise<void>
  classifyError: (typeof import('./telemetry'))['classifyError']
}

async function loadTelemetryWithUrl(url: string | undefined): Promise<TelemetryModule> {
  vi.resetModules()
  vi.doMock('../constants', async () => {
    const actual = await vi.importActual<typeof import('../constants')>('../constants')
    return { ...actual, TELEMETRY_URL: url }
  })
  const mod = await import('./telemetry')
  return { sendTelemetry: mod.sendTelemetry, classifyError: mod.classifyError }
}

const SAMPLE_EVENT: TelemetryEvent = {
  outcome: 'success',
  chipFamily: 'ESP32-S3',
  firmwareVersion: '0.10.0',
  durationMs: 4_321,
  errorClass: null,
}

describe('sendTelemetry', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.removeItem(OPT_OUT_KEY)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('../constants')
    vi.resetModules()
    window.localStorage.removeItem(OPT_OUT_KEY)
  })

  it('is a no-op when TELEMETRY_URL is unset', async () => {
    const { sendTelemetry } = await loadTelemetryWithUrl(undefined)
    await sendTelemetry(SAMPLE_EVENT)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is a no-op when the user has opted out via localStorage', async () => {
    window.localStorage.setItem(OPT_OUT_KEY, '1')
    const { sendTelemetry } = await loadTelemetryWithUrl(FAKE_TELEMETRY_URL)
    await sendTelemetry(SAMPLE_EVENT)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs the event with keepalive and JSON body when URL is set and opt-out is off', async () => {
    const { sendTelemetry } = await loadTelemetryWithUrl(FAKE_TELEMETRY_URL)
    await sendTelemetry(SAMPLE_EVENT)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(FAKE_TELEMETRY_URL)
    const requestInit = init as RequestInit
    expect(requestInit.method).toBe('POST')
    expect(requestInit.keepalive).toBe(true)
    expect(requestInit.credentials).toBe('omit')
    expect((requestInit.headers as Record<string, string>)['Content-Type']).toBe('application/json')

    const parsed = JSON.parse(requestInit.body as string) as Record<string, unknown>
    expect(parsed.outcome).toBe('success')
    expect(parsed.chipFamily).toBe('ESP32-S3')
    expect(parsed.firmwareVersion).toBe('0.10.0')
    expect(parsed.durationMs).toBe(4_321)
    expect(parsed.errorClass).toBeNull()
    // UA buckets are appended — exact values depend on the test runner's UA.
    expect(typeof parsed.browser).toBe('string')
    expect(typeof parsed.os).toBe('string')
  })

  it('swallows fetch errors and never throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const { sendTelemetry } = await loadTelemetryWithUrl(FAKE_TELEMETRY_URL)
    await expect(sendTelemetry(SAMPLE_EVENT)).resolves.toBeUndefined()
  })
})

describe('classifyError (smoke)', () => {
  // Deep coverage waits for #51 — for now, one happy-path mapping is enough
  // to lock in the public contract (string in, enum out).
  it('maps a known error message to its enum bucket', async () => {
    const { classifyError } = await loadTelemetryWithUrl(undefined)
    expect(classifyError('Flash ID is ffffff — the chip cannot reach its own flash.')).toBe(
      'flash-id-ffffff',
    )
  })
})
