// src/components/flasher/ReadyView.tsx
import { lazy, Suspense, type ReactElement } from 'react'

import type { AdvancedOptions } from '../../hooks/useFlasher'
import type { UseReleaseChannelResult } from '../../hooks/useReleaseChannel'
import { formatPortInfo } from '../../lib/format'
import { type LocalFirmware } from '../../lib/local-firmware'

import { ChannelPicker } from './ChannelPicker'
import { DashIllustration } from './illustrations/DashIllustration'
import { PRIMARY_CTA_CLASSES } from './styles'

// Lazy-loaded: both panels live inside collapsed <details> elements, so the
// JS isn't needed for first paint. One-time fetch on first interaction is
// acceptable; the null fallback is never user-visible (collapsed by default).
const AdvancedPanel = lazy(() =>
  import('./AdvancedPanel').then((m) => ({ default: m.AdvancedPanel })),
)
const LocalFirmwareInput = lazy(() =>
  import('./LocalFirmwareInput').then((m) => ({ default: m.LocalFirmwareInput })),
)

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

      <Suspense fallback={null}>
        <LocalFirmwareInput value={localFirmware} onChange={onLocalFirmwareChange} />
      </Suspense>

      <button
        type="button"
        onClick={onFlash}
        className={`w-full sm:w-auto ${PRIMARY_CTA_CLASSES} py-3 text-base font-semibold`}
      >
        {flashLabel(localFirmware, overrideTag, releases[0]?.tag)}
      </button>

      <Suspense fallback={null}>
        <AdvancedPanel value={advanced} onChange={onAdvancedChange} />
      </Suspense>

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
