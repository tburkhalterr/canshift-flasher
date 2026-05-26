// src/components/flasher/FailedView.tsx
import type { ReactElement } from 'react'

import type { Release } from '../../lib/releases'
import { LogStream } from '../LogStream'

import { DashIllustration } from './illustrations/DashIllustration'
import { downloadLogReport } from './log-report'
import {
  PRIMARY_CTA_CLASSES,
  SECONDARY_CTA_CLASSES,
  SECTION_HEADER_CLASSES,
} from './styles'

interface FailedViewProps {
  errorMessage: string | null
  onRetry: () => void
  onReset: () => void
  log: string
  chipInfo: string | null
  port: SerialPort | null
  release: Release | null
  logTruncated: boolean
}

export const FailedView = ({
  errorMessage,
  onRetry,
  onReset,
  log,
  chipInfo,
  port,
  release,
  logTruncated,
}: FailedViewProps): ReactElement => {
  return (
    <section className="space-y-6">
      <div className="flex justify-center">
        <DashIllustration variant="failed" />
      </div>

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
        onClick={() => downloadLogReport({ log, chipInfo, port, release, logTruncated })}
        className="text-sm text-text-muted underline-offset-4 hover:underline"
      >
        Download log
      </button>
    </section>
  )
}
