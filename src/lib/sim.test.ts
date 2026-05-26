// src/lib/sim.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SimMode } from './sim'

const ORIGINAL_SEARCH = window.location.search

function setQueryString(search: string): void {
  // jsdom's `location` is read-only on .search but `history.replaceState`
  // updates it cleanly.
  window.history.replaceState({}, '', `/${search}`)
}

async function loadSimWithEnv(viteSim: string | undefined): Promise<{
  SIM_MODE: SimMode
  isSimEnabled: () => boolean
  simSelectPort: () => SerialPort
  simFlash: typeof import('./sim').simFlash
}> {
  vi.resetModules()
  vi.doMock('../constants', async () => {
    const actual = await vi.importActual<typeof import('../constants')>('../constants')
    return { ...actual, VITE_SIM: viteSim }
  })
  const mod = await import('./sim')
  return {
    SIM_MODE: mod.SIM_MODE,
    isSimEnabled: mod.isSimEnabled,
    simSelectPort: mod.simSelectPort,
    simFlash: mod.simFlash,
  }
}

describe('SIM_MODE resolution', () => {
  afterEach(() => {
    setQueryString(ORIGINAL_SEARCH)
    vi.doUnmock('../constants')
    vi.resetModules()
  })

  it('defaults to "off" with no env and no query string', async () => {
    setQueryString('')
    const { SIM_MODE, isSimEnabled } = await loadSimWithEnv(undefined)
    expect(SIM_MODE).toBe('off')
    expect(isSimEnabled()).toBe(false)
  })

  it('resolves to "success" when ?sim=success is present', async () => {
    setQueryString('?sim=success')
    const { SIM_MODE, isSimEnabled } = await loadSimWithEnv(undefined)
    expect(SIM_MODE).toBe('success')
    expect(isSimEnabled()).toBe(true)
  })

  it('resolves to "fail" when ?sim=fail is present', async () => {
    setQueryString('?sim=fail')
    const { SIM_MODE } = await loadSimWithEnv(undefined)
    expect(SIM_MODE).toBe('fail')
  })

  it('treats ?sim=1 as an alias for ?sim=success', async () => {
    setQueryString('?sim=1')
    const { SIM_MODE } = await loadSimWithEnv(undefined)
    expect(SIM_MODE).toBe('success')
  })

  it('resolves VITE_SIM=1 build-time env to "success" when no query is set', async () => {
    setQueryString('')
    const { SIM_MODE } = await loadSimWithEnv('1')
    expect(SIM_MODE).toBe('success')
  })

  it('lets the query string override the build-time env', async () => {
    setQueryString('?sim=fail')
    const { SIM_MODE } = await loadSimWithEnv('success')
    expect(SIM_MODE).toBe('fail')
  })
})

describe('simSelectPort', () => {
  afterEach(() => {
    setQueryString(ORIGINAL_SEARCH)
    vi.doUnmock('../constants')
    vi.resetModules()
  })

  it('returns a port whose getInfo() matches the first supported USB filter', async () => {
    setQueryString('?sim=success')
    const { simSelectPort } = await loadSimWithEnv(undefined)
    const port = simSelectPort()
    const info = port.getInfo()
    expect(info.usbVendorId).toBe(0x1a86)
    expect(info.usbProductId).toBe(0x7523)
  })
})

describe('simFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    setQueryString(ORIGINAL_SEARCH)
    vi.doUnmock('../constants')
    vi.resetModules()
  })

  async function drain(promise: Promise<unknown>): Promise<void> {
    let settled = false
    promise
      .catch(() => undefined)
      .finally(() => {
        settled = true
      })
    for (let i = 0; i < 200 && !settled; i += 1) {
      await vi.advanceTimersByTimeAsync(100)
    }
    await promise.catch(() => undefined)
  }

  it('streams progress, log, and chipInfo to completion in success mode', async () => {
    setQueryString('?sim=success')
    const { simFlash } = await loadSimWithEnv(undefined)

    const logs: string[] = []
    const progress: { written: number; total: number }[] = []
    const chipInfos: string[] = []

    const promise = simFlash({
      onLog: (line) => logs.push(line),
      onProgress: (p) => progress.push(p),
      onChipInfo: (chip) => chipInfos.push(chip),
    })

    await drain(promise)
    await expect(promise).resolves.toBeUndefined()

    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0]).toMatch(/Starting fake flash/i)
    expect(logs[logs.length - 1]).toMatch(/Flash complete/i)
    expect(chipInfos).toEqual(['ESP32-S3 (sim)'])
    expect(progress.length).toBeGreaterThan(0)
    const last = progress[progress.length - 1]
    expect(last?.written).toBe(last?.total)
  })

  it('throws a recognisable error in fail mode after streaming partial progress', async () => {
    setQueryString('?sim=fail')
    const { simFlash } = await loadSimWithEnv(undefined)

    const logs: string[] = []
    const progress: { written: number; total: number }[] = []

    const promise = simFlash({
      onLog: (line) => logs.push(line),
      onProgress: (p) => progress.push(p),
    })

    await drain(promise)
    await expect(promise).rejects.toThrow(/Simulated flash failure/i)
    expect(progress.length).toBeGreaterThan(0)
    expect(logs.some((l) => /failure injected/i.test(l))).toBe(true)
  })
})
