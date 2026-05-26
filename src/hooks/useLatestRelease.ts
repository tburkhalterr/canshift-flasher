// src/hooks/useLatestRelease.ts
import { useEffect, useRef, useState } from 'react'

import { fetchLatestRelease, type Release } from '../lib/releases'

export interface UseLatestReleaseResult {
  release: Release | null
  releaseRef: React.RefObject<Release | null>
}

/**
 * Fire-and-forget release metadata fetch on mount. The flash flow doesn't
 * block on this — a failed lookup falls back to FIRMWARE_URL — but having
 * the version + notes ready in `idle` state is the whole point of #14.
 *
 * Returns both the reactive value (for rendering) and a ref (so async
 * callbacks can read the current value without forcing rebinding).
 */
export const useLatestRelease = (): UseLatestReleaseResult => {
  const [release, setRelease] = useState<Release | null>(null)
  const releaseRef = useRef<Release | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchLatestRelease()
      .then((value) => {
        if (cancelled) return
        releaseRef.current = value
        setRelease(value)
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('Failed to fetch latest release metadata:', message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { release, releaseRef }
}
