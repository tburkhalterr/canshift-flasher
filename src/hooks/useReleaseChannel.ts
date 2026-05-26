// src/hooks/useReleaseChannel.ts
import { useCallback, useEffect, useState } from 'react'

import {
  fetchReleasesByChannel,
  type Channel,
  type RecentRelease,
} from '../lib/releases'

export interface UseReleaseChannelResult {
  channel: Channel
  setChannel: (channel: Channel) => void
  releases: RecentRelease[]
  loading: boolean
  error: string | null
}

const RELEASES_LIMIT = 10

interface State {
  channel: Channel
  releases: RecentRelease[]
  loading: boolean
  error: string | null
}

/**
 * Fetches the list of releases for the active channel, refetching whenever
 * the user toggles between `stable` and `beta` in the IdleView channel picker.
 * Errors surface in `error` so the UI can render a degraded picker without
 * breaking the connect flow.
 */
export const useReleaseChannel = (initial: Channel): UseReleaseChannelResult => {
  const [state, setState] = useState<State>(() => ({
    channel: initial,
    releases: [],
    loading: true,
    error: null,
  }))

  const setChannel = useCallback((next: Channel): void => {
    setState((prev) =>
      prev.channel === next
        ? prev
        : { channel: next, releases: [], loading: true, error: null },
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchReleasesByChannel(state.channel, RELEASES_LIMIT)
      .then((value) => {
        if (cancelled) return
        setState((prev) =>
          prev.channel === state.channel
            ? { ...prev, releases: value, loading: false, error: null }
            : prev,
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setState((prev) =>
          prev.channel === state.channel
            ? { ...prev, releases: [], loading: false, error: message }
            : prev,
        )
      })
    return () => {
      cancelled = true
    }
  }, [state.channel])

  return {
    channel: state.channel,
    setChannel,
    releases: state.releases,
    loading: state.loading,
    error: state.error,
  }
}
