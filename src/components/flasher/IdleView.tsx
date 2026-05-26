// src/components/flasher/IdleView.tsx
import { useMemo, type ReactElement } from 'react'

import type { AdvancedOptions } from '../../hooks/useFlasher'
import { useReleaseChannel } from '../../hooks/useReleaseChannel'
import { readDefaultChannel, type Release } from '../../lib/releases'

import { ChannelPicker } from './ChannelPicker'
import { ErrorBanner } from './ErrorBanner'
import { DashIllustration } from './illustrations/DashIllustration'
import { ReleaseSummary } from './ReleaseSummary'
import { PRIMARY_CTA_CLASSES, SECTION_HEADER_CLASSES } from './styles'

interface IdleViewProps {
  onConnect: () => void
  errorMessage: string | null
  release: Release | null
  advanced: AdvancedOptions
  onAdvancedChange: (opts: AdvancedOptions) => void
}

export const IdleView = ({
  onConnect,
  errorMessage,
  release,
  advanced,
  onAdvancedChange,
}: IdleViewProps): ReactElement => {
  const initialChannel = useMemo(() => readDefaultChannel(), [])
  const { channel, setChannel, releases, loading, error } = useReleaseChannel(initialChannel)

  const selectedTag = advanced.versionOverride ?? ''

  const handleChannelChange = (next: typeof channel): void => {
    setChannel(next)
    // Switching channels invalidates any tag override — the previous tag is
    // probably not in the new list. Drop back to "latest of new channel".
    onAdvancedChange({ ...advanced, versionOverride: null })
  }

  const handleVersionChange = (tag: string): void => {
    onAdvancedChange({ ...advanced, versionOverride: tag === '' ? null : tag })
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-center">
        <DashIllustration variant="idle" />
      </div>

      <div className="space-y-2">
        <h2 className={SECTION_HEADER_CLASSES}>Flash your ESP32</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          The same flow covers a first flash, a normal update, and recovery from a broken
          update.
        </p>
      </div>

      <ChannelPicker
        channel={channel}
        onChannelChange={handleChannelChange}
        releases={releases}
        selectedTag={selectedTag}
        onVersionChange={handleVersionChange}
        loading={loading}
        error={error}
      />

      {release ? (
        <ReleaseSummary release={release} />
      ) : (
        <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
          Latest version: checking…
        </div>
      )}

      <button
        type="button"
        onClick={onConnect}
        className={`w-full sm:w-auto ${PRIMARY_CTA_CLASSES} py-3 text-base font-semibold`}
      >
        Connect
      </button>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
    </section>
  )
}
