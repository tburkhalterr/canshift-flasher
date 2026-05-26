// src/components/flasher/SuccessView.tsx
import type { ReactElement } from 'react'

import type { Release } from '../../lib/releases'
import { LogStream } from '../LogStream'

import { downloadLogReport } from './log-report'
import { SECONDARY_CTA_CLASSES } from './styles'

interface SuccessViewProps {
  onAgain: () => void
  log: string
  chipInfo: string | null
  port: SerialPort | null
  release: Release | null
  logTruncated: boolean
}

export const SuccessView = ({
  onAgain,
  log,
  chipInfo,
  port,
  release,
  logTruncated,
}: SuccessViewProps): ReactElement => {
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
            onClick={() => downloadLogReport({ log, chipInfo, port, release, logTruncated })}
            className="text-sm text-text-muted underline-offset-4 hover:underline"
          >
            Download log
          </button>
        </div>
      </details>
    </section>
  )
}
