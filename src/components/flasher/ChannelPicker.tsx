// src/components/flasher/ChannelPicker.tsx
import type { ChangeEvent, ReactElement } from 'react'

import type { Channel, RecentRelease } from '../../lib/releases'

interface ChannelPickerProps {
  channel: Channel
  onChannelChange: (channel: Channel) => void
  releases: RecentRelease[]
  /** Empty string = latest of the channel (no explicit override). */
  selectedTag: string
  onVersionChange: (tag: string) => void
  loading: boolean
  error: string | null
}

const SELECT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-60'

const formatReleaseOption = (release: RecentRelease): string => {
  const date = release.publishedAt.slice(0, 10)
  return `${release.tag} · ${date}`
}

export const ChannelPicker = ({
  channel,
  onChannelChange,
  releases,
  selectedTag,
  onVersionChange,
  loading,
  error,
}: ChannelPickerProps): ReactElement => {
  const handleChannel = (event: ChangeEvent<HTMLSelectElement>): void => {
    onChannelChange(event.target.value as Channel)
  }

  const handleVersion = (event: ChangeEvent<HTMLSelectElement>): void => {
    onVersionChange(event.target.value)
  }

  const latestTag = releases[0]?.tag ?? null
  const versionDisabled = loading || releases.length === 0

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-2 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-text-dim">
          <span>Channel</span>
          <select
            value={channel}
            onChange={handleChannel}
            className={SELECT_CLASSES}
            aria-label="Release channel"
          >
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-text-dim">
          <span>Version</span>
          <select
            value={selectedTag}
            onChange={handleVersion}
            className={SELECT_CLASSES}
            disabled={versionDisabled}
            aria-label="Firmware version"
          >
            <option value="">
              {loading
                ? 'Loading…'
                : latestTag
                  ? `Latest (${latestTag})`
                  : 'No releases available'}
            </option>
            {releases.map((release) => (
              <option key={release.tag} value={release.tag}>
                {formatReleaseOption(release)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="text-xs text-status-danger" role="alert">
          Couldn&apos;t load the release list — {error}
        </p>
      ) : !loading && releases.length === 0 ? (
        <p className="text-xs text-text-muted">
          No {channel === 'stable' ? 'stable' : 'beta'} releases yet. Try the{' '}
          <button
            type="button"
            onClick={() => onChannelChange(channel === 'stable' ? 'beta' : 'stable')}
            className="underline-offset-4 hover:underline"
          >
            {channel === 'stable' ? 'Beta' : 'Stable'}
          </button>{' '}
          channel.
        </p>
      ) : null}
    </div>
  )
}
