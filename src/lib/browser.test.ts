// src/lib/browser.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isWebSerialSupported } from './browser'

const originalNavigator = globalThis.navigator

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
  }
})

function setNavigator(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  })
}

describe('isWebSerialSupported', () => {
  it('returns false on iPhone user agents even with navigator.serial defined', () => {
    setNavigator({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Chrome/120',
      serial: {},
    })
    expect(isWebSerialSupported()).toBe(false)
  })

  it('returns false on iPad user agents', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605',
      serial: {},
    })
    expect(isWebSerialSupported()).toBe(false)
  })

  it('returns true on desktop Chrome with navigator.serial', () => {
    setNavigator({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      serial: {},
    })
    expect(isWebSerialSupported()).toBe(true)
  })

  it('returns false when navigator is undefined (SSR-like environment)', () => {
    // Simulate SSR by removing navigator entirely.
    setNavigator(undefined)
    expect(isWebSerialSupported()).toBe(false)
  })

  it('returns false on desktop Firefox where serial is absent', () => {
    setNavigator({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
    })
    expect(isWebSerialSupported()).toBe(false)
  })
})
