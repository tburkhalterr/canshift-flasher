// src/components/flasher/IdleView.tsx
import type { ReactElement } from 'react'

import type { AdvancedOptions } from '../../hooks/useFlasher'
import type { UseReleaseChannelResult } from '../../hooks/useReleaseChannel'
import { type LocalFirmware } from '../../lib/local-firmware'
import { type Release } from '../../lib/releases'

import { ChannelPicker } from './ChannelPicker'
import { ErrorBanner } from './ErrorBanner'
import { DashIllustration } from './illustrations/DashIllustration'
import { LocalFirmwareInput } from './LocalFirmwareInput'
import { ReleaseSummary } from './ReleaseSummary'
import { PRIMARY_CTA_CLASSES, SECTION_HEADER_CLASSES } from './styles'

interface IdleViewProps {
  onConnect: () => void
  errorMessage: string | null
  release: Release | null
  advanced: AdvancedOptions
  onAdvancedChange: (opts: AdvancedOptions) => void
  localFirmware: LocalFirmware | null
  onLocalFirmwareChange: (firmware: LocalFirmware | null) => void
  channelState: UseReleaseChannelResult
}

export const IdleView = ({
  onConnect,
  errorMessage,
  release,
  advanced,
  onAdvancedChange,
  localFirmware,
  onLocalFirmwareChange,
  channelState,
}: IdleViewProps): ReactElement => {
  const { channel, setChannel, releases, loading, error } = channelState
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

      {localFirmware ? null : (
        <ChannelPicker
          channel={channel}
          onChannelChange={handleChannelChange}
          releases={releases}
          selectedTag={selectedTag}
          onVersionChange={handleVersionChange}
          loading={loading}
          error={error}
        />
      )}

      <LocalFirmwareInput value={localFirmware} onChange={onLocalFirmwareChange} />

      {localFirmware || !release ? null : <ReleaseSummary release={release} />}

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
