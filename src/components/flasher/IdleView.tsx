// src/components/flasher/IdleView.tsx
import { lazy, Suspense, useState, type ReactElement } from 'react'

import type { AdvancedOptions } from '../../hooks/useFlasher'
import type { UseReleaseChannelResult } from '../../hooks/useReleaseChannel'
import { type SelectedDashboardLayout } from '../../lib/dashboards/catalog'
import { formatBytes } from '../../lib/format'
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

      {localFirmware ? (
        // #120 (UX-13): when `useFlasher.reset()` preserves `localFirmware`
        // across a Flash again, the visible <input> is cleared even though
        // the file is still in memory. Surface a prominent affordance so
        // the user knows the file is loaded and can either reuse it or
        // pick a different one. Verification gating from #96 still applies
        // via the disabled state below.
        <ReuseLocalFirmwarePill
          firmware={localFirmware}
          onReuse={onConnect}
          onClear={() => {
            onLocalFirmwareChange(null)
          }}
          disabled={!ecuProfile || !dashboardLayout || !localFirmwareReady}
          disabledReason={
            !ecuProfile
              ? 'Pick an ECU profile first'
              : !dashboardLayout
                ? 'Pick a dashboard layout first'
                : !localFirmwareReady
                  ? 'Resolve the local firmware verification warning before continuing'
                  : undefined
          }
        />
      ) : null}

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

interface ReuseLocalFirmwarePillProps {
  firmware: LocalFirmware
  onReuse: () => void
  onClear: () => void
  disabled: boolean
  disabledReason: string | undefined
}

const ReuseLocalFirmwarePill = ({
  firmware,
  onReuse,
  onClear,
  disabled,
  disabledReason,
}: ReuseLocalFirmwarePillProps): ReactElement => (
  <div
    data-testid="reuse-local-firmware-pill"
    className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
  >
    <div className="min-w-0 space-y-0.5">
      <p className="font-display text-xs font-semibold uppercase tracking-wide text-text-muted">
        Reuse local firmware
      </p>
      <p className="truncate text-text">
        <span aria-hidden="true">📎 </span>
        <span className="font-mono text-xs">{firmware.name}</span>
        <span className="text-text-muted"> ({formatBytes(firmware.bytes.byteLength)})</span>
      </p>
    </div>
    <div className="flex flex-shrink-0 gap-2">
      <button
        type="button"
        onClick={onReuse}
        disabled={disabled}
        title={disabledReason}
        className={`${PRIMARY_CTA_CLASSES} px-3 py-1.5 text-xs`}
      >
        Flash again with this file
      </button>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition hover:text-text focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg"
      >
        Pick a different file
      </button>
    </div>
  </div>
)
