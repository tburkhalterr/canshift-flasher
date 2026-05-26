// src/components/flasher/FailedView.tsx
import { useEffect, useRef, type ReactElement } from 'react'

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
  const retryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    retryRef.current?.focus()
  }, [])

  return (
    <section className="space-y-4">
      <div className="flex justify-center">
        <DashIllustration variant="failed" />
      </div>

      <div
        role="alert"
        aria-live="assertive"
        className="space-y-2 rounded-md border border-status-danger/60 bg-status-danger-dim px-4 py-4"
      >
        <h2 className={SECTION_HEADER_CLASSES}>Flash failed</h2>
        <p className="break-all font-mono text-sm text-text-dim">{errorMessage ?? 'Unknown error'}</p>
        <p className="text-sm leading-relaxed text-text-muted">
          If retry keeps failing: check the USB cable, try a different USB port, and reboot
          the ESP32 before retrying.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          ref={retryRef}
          type="button"
          onClick={onRetry}
          className={`w-full sm:w-auto ${PRIMARY_CTA_CLASSES} py-3 text-base font-semibold`}
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onReset}
          className={`w-full sm:w-auto ${SECONDARY_CTA_CLASSES}`}
        >
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
