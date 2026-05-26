// src/hooks/useReleaseChannel.ts
import { useCallback, useEffect, useState } from 'react'

import {
  fetchReleasesByChannel,
  type Channel,
  type DefaultChannel,
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
  /** Locked once the user picks manually (or the URL forced the initial value). */
  userPicked: boolean
}

/**
 * Fetches the list of releases for the active channel, refetching whenever
 * the user toggles between `stable` and `beta` in the IdleView channel picker.
 *
 * Auto-switch behaviour: on first data load, if the OTHER channel's newest
 * release is strictly more recent than the current channel's newest, the hook
 * flips to it. This surfaces "newest of either channel" by default. The flip
 * is a one-shot — once the user manually picks, or the URL pinned the initial
 * value (`?prerelease=1`), we never override their choice.
 */
export const useReleaseChannel = (initial: DefaultChannel): UseReleaseChannelResult => {
  const [state, setState] = useState<State>(() => ({
    channel: initial.channel,
    releases: [],
    loading: true,
    error: null,
    userPicked: initial.forced,
  }))

  const setChannel = useCallback((next: Channel): void => {
    setState((prev) =>
      prev.channel === next
        ? { ...prev, userPicked: true }
        : { channel: next, releases: [], loading: true, error: null, userPicked: true },
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    const otherChannel: Channel = state.channel === 'beta' ? 'stable' : 'beta'

    Promise.all([
      fetchReleasesByChannel(state.channel, RELEASES_LIMIT),
      // Only fetch the other channel's head when auto-switch is still in
      // play — otherwise it's wasted work and an extra deserialization.
      state.userPicked
        ? Promise.resolve<RecentRelease[]>([])
        : fetchReleasesByChannel(otherChannel, 1),
    ])
      .then(([forCurrent, forOther]) => {
        if (cancelled) return
        const currentHead = forCurrent[0]
        const otherHead = forOther[0]
        const shouldFlip =
          !state.userPicked &&
          otherHead !== undefined &&
          (currentHead === undefined ||
            otherHead.publishedAt.localeCompare(currentHead.publishedAt) > 0)

        if (shouldFlip) {
          // Re-render under the flipped channel; the next effect run will
          // load `otherChannel`'s full list. userPicked stays false so the
          // user can still manually flip back if they prefer.
          setState((prev) =>
            prev.channel === state.channel
              ? { ...prev, channel: otherChannel, releases: [], loading: true }
              : prev,
          )
          return
        }

        setState((prev) =>
          prev.channel === state.channel
            ? { ...prev, releases: forCurrent, loading: false, error: null }
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
  }, [state.channel, state.userPicked])

  return {
    channel: state.channel,
    setChannel,
    releases: state.releases,
    loading: state.loading,
    error: state.error,
  }
}
