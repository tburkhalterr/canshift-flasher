// src/hooks/useLatestRelease.ts
import { useEffect, useRef, useState } from 'react'

import { fetchLatestRelease, type Release } from '../lib/releases'

export interface UseLatestReleaseResult {
  release: Release | null
  releaseRef: React.RefObject<Release | null>
}

/**
 * Fire-and-forget release metadata fetch on mount. A failed lookup leaves
 * `release` null — the flash flow then throws and directs the user to the
 * local-file upload (`LocalFirmwareInput`) per REF-11 (#137). Having the
 * version + notes ready in `idle` state is the whole point of #14.
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
      .catch(() => {
        // UI surfaces this via the ChannelPicker error state — no need to
        // duplicate the message in the browser console.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { release, releaseRef }
}
