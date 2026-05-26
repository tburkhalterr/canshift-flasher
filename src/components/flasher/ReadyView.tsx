// src/components/flasher/ReadyView.tsx
import type { ReactElement } from 'react'

import type { AdvancedOptions } from '../../hooks/useFlasher'
import type { UseReleaseChannelResult } from '../../hooks/useReleaseChannel'
import { formatPortInfo } from '../../lib/format'
import { type LocalFirmware } from '../../lib/local-firmware'

import { AdvancedPanel } from './AdvancedPanel'
import { ChannelPicker } from './ChannelPicker'
import { DashIllustration } from './illustrations/DashIllustration'
import { LocalFirmwareInput } from './LocalFirmwareInput'
import { PRIMARY_CTA_CLASSES } from './styles'

interface ReadyViewProps {
  port: SerialPort | null
  chipInfo: string | null
  onFlash: () => void
  onReselect: () => void
  advanced: AdvancedOptions
  onAdvancedChange: (opts: AdvancedOptions) => void
  localFirmware: LocalFirmware | null
  onLocalFirmwareChange: (firmware: LocalFirmware | null) => void
  channelState: UseReleaseChannelResult
}

const flashLabel = (
  localFirmware: LocalFirmware | null,
  overrideTag: string,
  latestTag: string | undefined,
): string => {
  if (localFirmware) return `Flash ${localFirmware.name}`
  if (overrideTag.length > 0) return `Flash ${overrideTag}`
  if (latestTag) return `Flash ${latestTag}`
  return 'Flash latest'
}

export const ReadyView = ({
  port,
  chipInfo,
  onFlash,
  onReselect,
  advanced,
  onAdvancedChange,
  localFirmware,
  onLocalFirmwareChange,
  channelState,
}: ReadyViewProps): ReactElement => {
  const { channel, setChannel, releases, loading, error } = channelState
  const overrideTag = advanced.versionOverride?.trim() ?? ''

  const handleChannelChange = (next: typeof channel): void => {
    setChannel(next)
    onAdvancedChange({ ...advanced, versionOverride: null })
  }

  const handleVersionChange = (tag: string): void => {
    onAdvancedChange({ ...advanced, versionOverride: tag === '' ? null : tag })
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-center">
        <DashIllustration variant="ready" />
      </div>

      <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
        Connected:{' '}
        <span className="font-mono text-text">{port ? formatPortInfo(port) : '—'}</span>
        {chipInfo ? (
          <>
            {' · '}
            <span className="font-mono text-text">{chipInfo}</span>
          </>
        ) : null}
      </div>

      {localFirmware ? null : (
        <ChannelPicker
          channel={channel}
          onChannelChange={handleChannelChange}
          releases={releases}
          selectedTag={advanced.versionOverride ?? ''}
          onVersionChange={handleVersionChange}
          loading={loading}
          error={error}
        />
      )}

      <LocalFirmwareInput value={localFirmware} onChange={onLocalFirmwareChange} />

      <button
        type="button"
        onClick={onFlash}
        className={`w-full sm:w-auto ${PRIMARY_CTA_CLASSES} py-3 text-base font-semibold`}
      >
        {flashLabel(localFirmware, overrideTag, releases[0]?.tag)}
      </button>

      <AdvancedPanel value={advanced} onChange={onAdvancedChange} />

      <button
        type="button"
        onClick={onReselect}
        className="text-sm text-text-muted underline-offset-4 hover:underline"
      >
        Re-select port
      </button>
    </section>
  )
}
