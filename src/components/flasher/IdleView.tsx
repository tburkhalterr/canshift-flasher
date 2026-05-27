// src/components/flasher/IdleView.tsx
import { lazy, Suspense, useState, type ReactElement } from 'react'

import type { AdvancedOptions } from '../../hooks/useFlasher'
import type { UseReleaseChannelResult } from '../../hooks/useReleaseChannel'
import { type SelectedDashboardLayout } from '../../lib/dashboards/catalog'
import { type LocalFirmware } from '../../lib/local-firmware'
import { type SelectedEcuProfile } from '../../lib/profiles/catalog'
import { type Release } from '../../lib/releases'

import { ChannelPicker } from './ChannelPicker'
import { DashboardLayoutPicker } from './DashboardLayoutPicker'
import { EcuProfilePicker } from './EcuProfilePicker'
import { ErrorBanner } from './ErrorBanner'
import { DashIllustration } from './illustrations/DashIllustration'
import { ReleaseSummary } from './ReleaseSummary'
import { PRIMARY_CTA_CLASSES, SECTION_HEADER_CLASSES } from './styles'

// Lazy-loaded: the panel lives inside a collapsed <details>, so the JS isn't
// needed for first paint. Null fallback is fine — never user-visible.
const LocalFirmwareInput = lazy(() =>
  import('./LocalFirmwareInput').then((m) => ({ default: m.LocalFirmwareInput })),
)

interface IdleViewProps {
  onConnect: () => void
  errorMessage: string | null
  release: Release | null
  advanced: AdvancedOptions
  onAdvancedChange: (opts: AdvancedOptions) => void
  localFirmware: LocalFirmware | null
  onLocalFirmwareChange: (firmware: LocalFirmware | null) => void
  channelState: UseReleaseChannelResult
  ecuProfile: SelectedEcuProfile | null
  onEcuProfileChange: (profile: SelectedEcuProfile | null) => void
  dashboardLayout: SelectedDashboardLayout | null
  onDashboardLayoutChange: (layout: SelectedDashboardLayout | null) => void
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
  ecuProfile,
  onEcuProfileChange,
  dashboardLayout,
  onDashboardLayoutChange,
}: IdleViewProps): ReactElement => {
  const { channel, setChannel, releases, loading, error } = channelState
  const selectedTag = advanced.versionOverride ?? ''
  // #96 (SEC-004): block Connect when a local firmware is loaded but lacks
  // a verified or explicitly-accepted checksum. Initial value is `true` so
  // the gate is a no-op until `LocalFirmwareInput` reports otherwise.
  const [localFirmwareReady, setLocalFirmwareReady] = useState(true)

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

      <Suspense fallback={null}>
        <LocalFirmwareInput
          value={localFirmware}
          onChange={onLocalFirmwareChange}
          onReadinessChange={setLocalFirmwareReady}
        />
      </Suspense>

      {localFirmware || !release ? null : <ReleaseSummary release={release} />}

      <EcuProfilePicker
        selectedSlug={ecuProfile?.slug ?? null}
        onChange={onEcuProfileChange}
      />

      <DashboardLayoutPicker
        selectedSlug={dashboardLayout?.slug ?? null}
        onChange={onDashboardLayoutChange}
      />

      <button
        type="button"
        onClick={onConnect}
        disabled={!ecuProfile || !dashboardLayout || !localFirmwareReady}
        title={
          !ecuProfile
            ? 'Pick an ECU profile first'
            : !dashboardLayout
              ? 'Pick a dashboard layout first'
              : !localFirmwareReady
                ? 'Resolve the local firmware verification warning before continuing'
                : undefined
        }
        className={`w-full sm:w-auto ${PRIMARY_CTA_CLASSES} py-3 text-base font-semibold`}
      >
        Connect
      </button>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
    </section>
  )
}
