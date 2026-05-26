// src/components/Flasher.tsx
import type { ReactElement } from 'react'

import { useFlasher } from '../hooks/useFlasher'
import {
  buildLogBlob,
  buildLogFilename,
  formatBytes,
  formatPortInfo,
} from '../lib/format'
import type { Release } from '../lib/releases'

import { LogStream } from './LogStream'
import { ProgressBar } from './ProgressBar'

interface LogContext {
  log: string
  chipInfo: string | null
  port: SerialPort | null
  release: Release | null
}

function downloadLogReport({ log, chipInfo, port, release }: LogContext): void {
  const timestamp = new Date()
  const blob = buildLogBlob({
    log,
    chipInfo,
    portInfo: port ? formatPortInfo(port) : null,
    userAgent: navigator.userAgent,
    timestamp,
    firmwareVersion: release?.version ?? null,
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = buildLogFilename(timestamp)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  queueMicrotask(() => URL.revokeObjectURL(url))
}

// Visual language mirrors canshift-studio: Orbitron for headers (via
// `font-display`), system sans for body, brand red (`status-danger`) for
// primary CTAs, `border-border` + `bg-surface-2` for secondary surfaces.
const PRIMARY_CTA_CLASSES =
  'inline-flex items-center justify-center rounded-md bg-status-danger px-5 py-2.5 text-sm font-medium text-text shadow-sm transition hover:bg-status-danger/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg disabled:pointer-events-none disabled:opacity-50'

const SECONDARY_CTA_CLASSES =
  'inline-flex items-center justify-center rounded-md border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-text transition hover:bg-surface focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg'

const SECTION_HEADER_CLASSES =
  'font-display text-lg font-bold tracking-wide text-text'

interface FlasherProps {
  webSerialSupported: boolean
}

export function Flasher({ webSerialSupported }: FlasherProps): ReactElement {
  const flasher = useFlasher()

  if (!webSerialSupported) {
    return <UnsupportedBrowser />
  }

  switch (flasher.state) {
    case 'idle':
      return (
        <IdleView
          onConnect={flasher.selectPort}
          errorMessage={flasher.errorMessage}
          release={flasher.release}
        />
      )
    case 'ready':
      return (
        <ReadyView
          port={flasher.port}
          onFlash={flasher.flash}
          onReselect={flasher.reselectPort}
        />
      )
    case 'flashing':
      return (
        <FlashingView
          downloadProgress={flasher.downloadProgress}
          spiffsDownloadProgress={flasher.spiffsDownloadProgress}
          flashProgress={flasher.flashProgress}
          chipInfo={flasher.chipInfo}
          log={flasher.log}
          onCancel={flasher.cancel}
        />
      )
    case 'success':
      return (
        <SuccessView
          onAgain={flasher.reset}
          log={flasher.log}
          chipInfo={flasher.chipInfo}
          port={flasher.port}
          release={flasher.release}
        />
      )
    case 'failed':
      return (
        <FailedView
          errorMessage={flasher.errorMessage}
          onRetry={flasher.flash}
          onReset={flasher.reset}
          log={flasher.log}
          chipInfo={flasher.chipInfo}
          port={flasher.port}
          release={flasher.release}
        />
      )
  }
}

function UnsupportedBrowser(): ReactElement {
  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-md border border-status-danger/60 bg-status-danger-dim px-5 py-5">
        <h2 className={SECTION_HEADER_CLASSES}>Chromium browser required</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          This flasher uses Web Serial, which is only available in Chromium-based browsers:
          Chrome, Edge, Brave, Arc, Opera. Safari and Firefox do not implement the spec.
        </p>
        <p className="text-sm leading-relaxed text-text-muted">
          Re-open this page in one of the browsers above to continue.
        </p>
      </div>
    </section>
  )
}

interface IdleViewProps {
  onConnect: () => void
  errorMessage: string | null
  release: Release | null
}

function formatPublishedDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const yyyy = d.getUTCFullYear().toString()
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function ReleaseSummary({ release }: { release: Release }): ReactElement {
  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
      <div>
        Latest: <span className="font-mono text-text">v{release.version}</span>
        <span className="text-text-dim">
          {' '}
          (published {formatPublishedDate(release.publishedAt)})
        </span>
      </div>
      {release.notes.trim().length > 0 ? (
        <details className="text-sm text-text-dim">
          <summary className="cursor-pointer">Release notes</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-text-dim">
            {release.notes}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

function IdleView({ onConnect, errorMessage, release }: IdleViewProps): ReactElement {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className={SECTION_HEADER_CLASSES}>Flash your CANShift dash</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          Plug your dash in via USB and click Connect. The same flow covers a first flash,
          a normal update, and recovery from a broken update.
        </p>
      </div>

      {release ? (
        <ReleaseSummary release={release} />
      ) : (
        <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
          Latest version: checking…
        </div>
      )}

      <button type="button" onClick={onConnect} className={PRIMARY_CTA_CLASSES}>
        Connect
      </button>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
    </section>
  )
}

interface ReadyViewProps {
  port: SerialPort | null
  onFlash: () => void
  onReselect: () => void
}

function ReadyView({ port, onFlash, onReselect }: ReadyViewProps): ReactElement {
  return (
    <section className="space-y-6">
      <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
        Connected:{' '}
        <span className="font-mono text-text">{port ? formatPortInfo(port) : '—'}</span>
      </div>

      <button
        type="button"
        onClick={onFlash}
        className={`w-full ${PRIMARY_CTA_CLASSES} py-3 text-base font-semibold`}
      >
        Flash latest
      </button>

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

interface FlashingViewProps {
  downloadProgress: { loaded: number; total: number | null } | null
  spiffsDownloadProgress: { loaded: number; total: number | null } | null
  flashProgress: { written: number; total: number } | null
  chipInfo: string | null
  log: string
  onCancel: () => void
}

function FlashingView({
  downloadProgress,
  spiffsDownloadProgress,
  flashProgress,
  chipInfo,
  log,
  onCancel,
}: FlashingViewProps): ReactElement {
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

interface SuccessViewProps {
  onAgain: () => void
  log: string
  chipInfo: string | null
  port: SerialPort | null
  release: Release | null
}

function SuccessView({ onAgain, log, chipInfo, port, release }: SuccessViewProps): ReactElement {
  const heading = release ? `Flashed v${release.version} successfully` : 'Flashed successfully'
  return (
    <section className="space-y-6">
      <div className="space-y-2 rounded-md border border-success/60 bg-surface-2 px-4 py-4">
        <h2 className="font-display text-lg font-bold tracking-wide text-success">{heading}</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          Your dash now hosts Studio at{' '}
          <span className="font-mono text-text">canshift.local</span>. Connect to the CANShift
          WiFi access point and open that URL in your browser.
        </p>
        <p className="text-sm leading-relaxed text-text-muted">
          This flow also covers normal updates and recovery from a broken update — bookmark{' '}
          <span className="font-mono">canshift.tmbk.ch</span>.
        </p>
      </div>

      <button type="button" onClick={onAgain} className={SECONDARY_CTA_CLASSES}>
        Flash again
      </button>

      <details className="text-sm text-text-muted">
        <summary className="cursor-pointer">Show log</summary>
        <div className="mt-2 space-y-3">
          <LogStream log={log} />
          <button
            type="button"
            onClick={() => downloadLogReport({ log, chipInfo, port, release })}
            className="text-sm text-text-muted underline-offset-4 hover:underline"
          >
            Download log
          </button>
        </div>
      </details>
    </section>
  )
}

interface FailedViewProps {
  errorMessage: string | null
  onRetry: () => void
  onReset: () => void
  log: string
  chipInfo: string | null
  port: SerialPort | null
  release: Release | null
}

function FailedView({
  errorMessage,
  onRetry,
  onReset,
  log,
  chipInfo,
  port,
  release,
}: FailedViewProps): ReactElement {
  return (
    <section className="space-y-6">
      <div className="space-y-2 rounded-md border border-status-danger/60 bg-status-danger-dim px-4 py-4">
        <h2 className={SECTION_HEADER_CLASSES}>Flash failed</h2>
        <p className="font-mono text-sm text-text-dim">{errorMessage ?? 'Unknown error'}</p>
        <p className="text-sm leading-relaxed text-text-muted">
          If retry keeps failing: check the USB cable, try a different USB port, and reboot
          the dash before retrying.
        </p>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onRetry} className={PRIMARY_CTA_CLASSES}>
          Retry
        </button>
        <button type="button" onClick={onReset} className={SECONDARY_CTA_CLASSES}>
          Start over
        </button>
      </div>

      <LogStream log={log} />

      <button
        type="button"
        onClick={() => downloadLogReport({ log, chipInfo, port, release })}
        className="text-sm text-text-muted underline-offset-4 hover:underline"
      >
        Download log
      </button>
    </section>
  )
}

function ErrorBanner({ message }: { message: string }): ReactElement {
  return (
    <div className="rounded-md border border-status-danger/60 bg-status-danger-dim px-4 py-3 text-sm text-text">
      {message}
    </div>
  )
}
