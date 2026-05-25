// src/components/Flasher.tsx
import type { ReactElement } from 'react'

import { useFlasher } from '../hooks/useFlasher'
import { formatBytes, formatPortInfo } from '../lib/format'

import { LogStream } from './LogStream'
import { ProgressBar } from './ProgressBar'

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
      return <IdleView onConnect={flasher.selectPort} errorMessage={flasher.errorMessage} />
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
          flashProgress={flasher.flashProgress}
          chipInfo={flasher.chipInfo}
          log={flasher.log}
        />
      )
    case 'success':
      return <SuccessView onAgain={flasher.reset} log={flasher.log} />
    case 'failed':
      return (
        <FailedView
          errorMessage={flasher.errorMessage}
          onRetry={flasher.flash}
          onReset={flasher.reset}
          log={flasher.log}
        />
      )
  }
}

function UnsupportedBrowser(): ReactElement {
  return (
    <section className="space-y-4 rounded-lg border border-status-danger bg-status-danger-dim p-6">
      <h2 className="text-lg font-semibold text-text">Chromium-based browser required</h2>
      <p className="text-sm text-text-dim">
        This flasher uses Web Serial, which is currently only available in Chromium browsers
        (Chrome, Edge, Brave, Arc, Opera). Safari and Firefox do not implement the spec.
      </p>
      <p className="text-sm text-text-dim">Please reopen this page in a Chromium browser.</p>
    </section>
  )
}

interface IdleViewProps {
  onConnect: () => void
  errorMessage: string | null
}

function IdleView({ onConnect, errorMessage }: IdleViewProps): ReactElement {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-text">Flash your CANShift dash</h2>
        <p className="text-sm text-text-dim">
          Plug your dash in via USB and click Connect. The same flow covers a first flash,
          a normal update, and recovery from a broken update.
        </p>
      </div>

      <button
        type="button"
        onClick={onConnect}
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg"
      >
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
        Connected: <span className="font-mono text-text">{port ? formatPortInfo(port) : '—'}</span>
      </div>

      <button
        type="button"
        onClick={onFlash}
        className="w-full rounded-md bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg"
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
  flashProgress: { written: number; total: number } | null
  chipInfo: string | null
  log: string
}

function FlashingView({
  downloadProgress,
  flashProgress,
  chipInfo,
  log,
}: FlashingViewProps): ReactElement {
  const downloadLabel = downloadProgress
    ? `Downloading firmware — ${formatBytes(downloadProgress.loaded)}${
        downloadProgress.total ? ` / ${formatBytes(downloadProgress.total)}` : ''
      }`
    : 'Preparing...'

  const flashLabel = flashProgress
    ? `Writing to flash — ${formatBytes(flashProgress.written)} / ${formatBytes(flashProgress.total)}`
    : 'Waiting to start flash...'

  return (
    <section className="space-y-6">
      <div className="rounded-md border border-warning bg-surface-2 px-4 py-3 text-sm text-warning">
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

      <ProgressBar
        value={flashProgress?.written ?? null}
        max={flashProgress?.total ?? null}
        label={flashLabel}
      />

      <LogStream log={log} />
    </section>
  )
}

interface SuccessViewProps {
  onAgain: () => void
  log: string
}

function SuccessView({ onAgain, log }: SuccessViewProps): ReactElement {
  return (
    <section className="space-y-6">
      <div className="space-y-2 rounded-md border border-success bg-surface-2 px-4 py-4">
        <h2 className="text-lg font-semibold text-success">Flashed successfully.</h2>
        <p className="text-sm text-text-dim">
          Your dash now hosts Studio at{' '}
          <span className="font-mono text-text">canshift.local</span>. Connect to the CANShift
          WiFi access point and open that URL in your browser.
        </p>
        <p className="text-sm text-text-muted">
          This flow also covers normal updates and recovery from a broken update — bookmark{' '}
          <span className="font-mono">canshift.tmbk.app</span>.
        </p>
      </div>

      <button
        type="button"
        onClick={onAgain}
        className="rounded-md border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-text transition hover:bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg"
      >
        Flash again
      </button>

      <details className="text-sm text-text-muted">
        <summary className="cursor-pointer">Show log</summary>
        <div className="mt-2">
          <LogStream log={log} />
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
}

function FailedView({
  errorMessage,
  onRetry,
  onReset,
  log,
}: FailedViewProps): ReactElement {
  return (
    <section className="space-y-6">
      <div className="space-y-2 rounded-md border border-status-danger bg-status-danger-dim px-4 py-4">
        <h2 className="text-lg font-semibold text-text">Flash failed</h2>
        <p className="font-mono text-sm text-text-dim">{errorMessage ?? 'Unknown error'}</p>
        <p className="text-sm text-text-muted">
          If retry keeps failing: check the USB cable, try a different USB port, and reboot
          the dash before retrying.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-text transition hover:bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg"
        >
          Start over
        </button>
      </div>

      <LogStream log={log} />
    </section>
  )
}

function ErrorBanner({ message }: { message: string }): ReactElement {
  return (
    <div className="rounded-md border border-status-danger bg-status-danger-dim px-4 py-3 text-sm text-text">
      {message}
    </div>
  )
}
