// src/lib/telemetry.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BootloaderEntryError, FlashIdError } from './esptool'
import { FirmwareDownloadError } from './firmware'
import { FirmwareIntegrityError } from './integrity'
import type { TelemetryErrorClass, TelemetryEvent } from './telemetry'

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
  downloadMs: 1_200,
  verifyMs: 80,
  flashMs: 3_041,
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
    expect(parsed.downloadMs).toBe(1_200)
    expect(parsed.verifyMs).toBe(80)
    expect(parsed.flashMs).toBe(3_041)
    expect(parsed.errorClass).toBeNull()
    // Build provenance is sourced from the `__BUILD_SHA__` define mocked in
    // `vitest.config.ts` — match that exact mock value here.
    expect(parsed.buildSha).toBe('testsha1')
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

describe('classifyError', () => {
  // Each test re-imports the typed error classes together with `./telemetry`
  // so the `instanceof` checks line up — `sendTelemetry`'s afterEach calls
  // `vi.resetModules()`, which would otherwise leave the top-level imports
  // pointing at a stale copy of the class identity.
  async function loadClassifier(): Promise<{
    classifyError: (err: unknown) => TelemetryErrorClass
    FlashIdError: typeof FlashIdError
    BootloaderEntryError: typeof BootloaderEntryError
    FirmwareIntegrityError: typeof FirmwareIntegrityError
    FirmwareDownloadError: typeof FirmwareDownloadError
  }> {
    const tmod = await import('./telemetry')
    const emod = await import('./esptool')
    const fmod = await import('./firmware')
    const imod = await import('./integrity')
    return {
      classifyError: tmod.classifyError,
      FlashIdError: emod.FlashIdError,
      BootloaderEntryError: emod.BootloaderEntryError,
      FirmwareIntegrityError: imod.FirmwareIntegrityError,
      FirmwareDownloadError: fmod.FirmwareDownloadError,
    }
  }

  it('classifies FlashIdError as flash-id-ffffff', async () => {
    const { classifyError, FlashIdError: Cls } = await loadClassifier()
    expect(classifyError(new Cls('Flash ID is ffffff'))).toBe('flash-id-ffffff')
  })

  it('classifies BootloaderEntryError as sync-failed', async () => {
    const { classifyError, BootloaderEntryError: Cls } = await loadClassifier()
    expect(classifyError(new Cls('Could not enter ESP32 bootloader'))).toBe('sync-failed')
  })

  it('classifies FirmwareIntegrityError as sha256-mismatch', async () => {
    const { classifyError, FirmwareIntegrityError: Cls } = await loadClassifier()
    expect(classifyError(new Cls('mismatch', 'boom'))).toBe('sha256-mismatch')
  })

  it('classifies FirmwareDownloadError as http', async () => {
    const { classifyError, FirmwareDownloadError: Cls } = await loadClassifier()
    expect(classifyError(new Cls('HTTP 404 Not Found'))).toBe('http')
  })

  it('classifies AbortError DOMException as cancelled', async () => {
    const { classifyError } = await loadClassifier()
    expect(classifyError(new DOMException('aborted', 'AbortError'))).toBe('cancelled')
  })

  it('returns unknown for non-Error values', async () => {
    const { classifyError } = await loadClassifier()
    expect(classifyError('plain string')).toBe('unknown')
    expect(classifyError(null)).toBe('unknown')
    expect(classifyError(undefined)).toBe('unknown')
  })

  it('does NOT log the regex-fallback warning when a typed class matches', async () => {
    // Issue #162: every typed-class match must take the `instanceof` fast path
    // and skip the `classifyByMessage` warning entirely. If a future refactor
    // moves the warn into the typed branch, the noisy log returns.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const {
      classifyError,
      FlashIdError: FlashIdCls,
      BootloaderEntryError: BootloaderCls,
      FirmwareIntegrityError: IntegrityCls,
      FirmwareDownloadError: DownloadCls,
    } = await loadClassifier()

    expect(classifyError(new FlashIdCls('Flash ID is ffffff'))).toBe('flash-id-ffffff')
    expect(classifyError(new BootloaderCls('Could not enter ESP32 bootloader'))).toBe('sync-failed')
    expect(classifyError(new IntegrityCls('mismatch', 'boom'))).toBe('sha256-mismatch')
    expect(classifyError(new DownloadCls('HTTP 500'))).toBe('http')
    expect(classifyError(new DOMException('aborted', 'AbortError'))).toBe('cancelled')

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('falls back to message regex for raw Error and warns (back-compat)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { classifyError } = await loadClassifier()

    // A raw `Error` (no typed class) still classifies by message AND warns,
    // so unmigrated throw sites stay observable in dev/CI.
    expect(classifyError(new Error('Flash ID is ffffff'))).toBe('flash-id-ffffff')
    expect(classifyError(new Error('Firmware download failed: HTTP 500'))).toBe('http')
    expect(classifyError(new Error('SHA-256 mismatch'))).toBe('sha256-mismatch')
    expect(classifyError(new Error('USB connection lost'))).toBe('disconnect')
    expect(classifyError(new Error('Could not enter ESP32 bootloader'))).toBe('sync-failed')
    expect(classifyError(new Error('user cancelled'))).toBe('cancelled')

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns unknown for raw Error with no matching message', async () => {
    const { classifyError } = await loadClassifier()
    expect(classifyError(new Error('something unexpected'))).toBe('unknown')
  })
})
