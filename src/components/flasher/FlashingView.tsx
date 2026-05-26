// src/components/flasher/FlashingView.tsx
import type { ReactElement } from 'react'

import { formatBytes } from '../../lib/format'
import { LogStream } from '../LogStream'
import { ProgressBar } from '../ProgressBar'

import { DashIllustration } from './illustrations/DashIllustration'

interface FlashingViewProps {
  downloadProgress: { loaded: number; total: number | null } | null
  spiffsDownloadProgress: { loaded: number; total: number | null } | null
  flashProgress: { written: number; total: number } | null
  chipInfo: string | null
  log: string
  onCancel: () => void
}

export const FlashingView = ({
  downloadProgress,
  spiffsDownloadProgress,
  flashProgress,
  chipInfo,
  log,
  onCancel,
}: FlashingViewProps): ReactElement => {
  const downloadLabel = downloadProgress
    ? `Downloading firmware — ${formatBytes(downloadProgress.loaded)}${
        downloadProgress.total ? ` / ${formatBytes(downloadProgress.total)}` : ''
      }`
    : 'Preparing...'

  const spiffsLabel = spiffsDownloadProgress
    ? `Downloading SPIFFS — ${formatBytes(spiffsDownloadProgress.loaded)}${
        spiffsDownloadProgress.total ? ` / ${formatBytes(spiffsDownloadProgress.total)}` : ''
      }`
    : null

  const flashLabel = flashProgress
    ? `Writing to flash — ${formatBytes(flashProgress.written)} / ${formatBytes(flashProgress.total)}`
    : 'Waiting to start flash...'

  // writeFlash can't be cleanly cancelled — only offer cancel during the
  // download phase (before any bytes have been written to the chip).
  const canCancel = flashProgress === null

  return (
    <section className="space-y-6">
      <div className="flex justify-center">
        <DashIllustration variant="flashing" />
      </div>

      <div className="rounded-md border border-warning/60 bg-surface-2 px-4 py-3 text-sm text-warning">
        Do not unplug the dash while flashing.
      </div>

      {chipInfo ? (
        <div className="text-sm text-text-dim">
          Chip detected: <span className="font-mono text-text">{chipInfo}</span>
        </div>
      ) : null}

      <ProgressBar
        value={downloadProgress?.loaded ?? null}
        max={downloadProgress?.total ?? null}
        label={downloadLabel}
      />

      {spiffsLabel ? (
        <ProgressBar
          value={spiffsDownloadProgress?.loaded ?? null}
          max={spiffsDownloadProgress?.total ?? null}
          label={spiffsLabel}
        />
      ) : null}

      <ProgressBar
        value={flashProgress?.written ?? null}
        max={flashProgress?.total ?? null}
        label={flashLabel}
      />

      {canCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-text-muted underline-offset-4 hover:underline"
        >
          Cancel
        </button>
      ) : null}

      <LogStream log={log} />
    </section>
  )
}
