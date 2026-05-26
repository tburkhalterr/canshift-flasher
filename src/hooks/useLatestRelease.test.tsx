// src/hooks/useLatestRelease.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as releases from '../lib/releases'
import { type Release } from '../lib/releases'

import { useLatestRelease } from './useLatestRelease'

const makeRelease = (overrides: Partial<Release> = {}): Release => ({
  version: '1.2.3',
  tag: 'v1.2.3',
  publishedAt: '2026-01-01T00:00:00Z',
  notes: 'test notes',
  prerelease: false,
  firmwareAsset: null,
  spiffsAsset: null,
  htmlUrl: 'https://example.test/release',
  ...overrides,
})

describe('useLatestRelease', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('populates release and releaseRef when fetchLatestRelease resolves', async () => {
    const release = makeRelease()
    vi.spyOn(releases, 'fetchLatestRelease').mockResolvedValue(release)

    const { result } = renderHook(() => useLatestRelease())

    expect(result.current.release).toBeNull()
    expect(result.current.releaseRef.current).toBeNull()

    await waitFor(() => {
      expect(result.current.release).toEqual(release)
    })
    expect(result.current.releaseRef.current).toEqual(release)
  })

  it('leaves release and releaseRef null and logs a warning when fetch rejects', async () => {
    vi.spyOn(releases, 'fetchLatestRelease').mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useLatestRelease())

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled()
    })
    expect(result.current.release).toBeNull()
    expect(result.current.releaseRef.current).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to fetch latest release metadata:',
      'network down',
    )
  })

  it('coerces non-Error rejections to a string in the warning', async () => {
    vi.spyOn(releases, 'fetchLatestRelease').mockRejectedValue('plain string failure')

    renderHook(() => useLatestRelease())

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to fetch latest release metadata:',
        'plain string failure',
      )
    })
  })

  it('does not setState after unmount when the fetch resolves late', async () => {
    let resolveFetch: (value: Release) => void = () => {}
    const pending = new Promise<Release>((resolve) => {
      resolveFetch = resolve
    })
    vi.spyOn(releases, 'fetchLatestRelease').mockReturnValue(pending)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result, unmount } = renderHook(() => useLatestRelease())
    const refBeforeUnmount = result.current.releaseRef
    unmount()

    resolveFetch(makeRelease({ version: '9.9.9' }))
    // Give the microtask queue a chance to flush the .then callback.
    await Promise.resolve()
    await Promise.resolve()

    // The ref is untouched after unmount — both the reactive state and the
    // ref were guarded by `cancelled`.
    expect(refBeforeUnmount.current).toBeNull()
    // React would log an "update on unmounted component" warning if setState
    // ran post-unmount; assert that didn't happen.
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
