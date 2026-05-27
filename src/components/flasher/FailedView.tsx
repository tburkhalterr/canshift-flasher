// src/components/flasher/FailedView.tsx
import { useEffect, useRef, type ReactElement } from 'react'

import type { ErrorClass } from '../../hooks/useFlasher'
import { useHelp } from '../../hooks/useHelp'
import type { Release } from '../../lib/releases'
import { getHelpTopicTitle, type HelpTopicId } from '../help-topics'
import { LogStream } from '../LogStream'

import { DashIllustration } from './illustrations/DashIllustration'
import { downloadLogReport } from './log-report'
import {
  PRIMARY_CTA_CLASSES,
  SECONDARY_CTA_CLASSES,
  SECTION_HEADER_CLASSES,
} from './styles'

/**
 * Map each failure bucket (from `classifyError`) to the help topic that
 * documents it. Buckets without a clean-fit topic (`http`, `cancelled`,
 * `unknown`) deliberately omit a link rather than route the user somewhere
 * tangentially related — the existing error message + Retry/Start-over CTAs
 * stay as the only affordances in those cases.
 */
const ERROR_CLASS_TO_TOPIC: Readonly<Partial<Record<ErrorClass, HelpTopicId>>> = {
  'flash-id-ffffff': 'flash-id-ffffff',
  'sync-failed': 'enter-bootloader',
  'sha256-mismatch': 'sha-mismatch',
  disconnect: 'enter-bootloader',
}

const resolveHelpTopic = (
  errorClass: ErrorClass | null,
): { id: HelpTopicId; title: string } | null => {
  if (errorClass === null) return null
  const topicId = ERROR_CLASS_TO_TOPIC[errorClass]
  if (!topicId) return null
  return { id: topicId, title: getHelpTopicTitle(topicId) }
}

interface FailedViewProps {
  errorMessage: string | null
  errorClass: ErrorClass | null
  onRetry: () => void
  onReset: () => void
  onReselectPort: () => Promise<void> | void
  log: string
  chipInfo: string | null
  port: SerialPort | null
  release: Release | null
  logTruncated: boolean
}

export const FailedView = ({
  errorMessage,
  errorClass,
  onRetry,
  onReset,
  onReselectPort,
  log,
  chipInfo,
  port,
  release,
  logTruncated,
}: FailedViewProps): ReactElement => {
  const primaryCtaRef = useRef<HTMLButtonElement>(null)
  const help = useHelp()
  const helpTopic = resolveHelpTopic(errorClass)

  useEffect(() => {
    primaryCtaRef.current?.focus()
  }, [])

  // Mid-flash USB disconnect: the cached `portRef` in useFlasher is now a
  // dead handle, so calling `flash()` again would just blow up with
  // "port closed". Route the user to Re-select port instead, and demote
  // Retry to a disabled hint so the affordance isn't silently missing.
  const isDisconnect = errorClass === 'disconnect'

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
          {isDisconnect
            ? 'Re-plug the ESP32, then click Re-select port to pick the new connection.'
            : 'If retry keeps failing: check the USB cable, try a different USB port, and reboot the ESP32 before retrying.'}
        </p>
        {helpTopic ? (
          <p className="text-sm">
            <button
              type="button"
              onClick={() => help.open(helpTopic.id)}
              className="inline-flex items-center gap-1 text-status-danger underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
            >
              See troubleshooting: {helpTopic.title}
              <span aria-hidden="true">&rarr;</span>
            </button>
          </p>
        ) : null}
      </div>

      {isDisconnect ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              ref={primaryCtaRef}
              type="button"
              onClick={() => {
                void onReselectPort()
              }}
              className={`w-full sm:w-auto ${PRIMARY_CTA_CLASSES} py-3 text-base font-semibold`}
            >
              Re-select port
            </button>
            <button
              type="button"
              onClick={onReset}
              className={`w-full sm:w-auto ${SECONDARY_CTA_CLASSES}`}
            >
              Start over
            </button>
          </div>
          <p className="text-xs text-text-muted">
            Retry unavailable — port lost. Use Re-select port.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            ref={primaryCtaRef}
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
      )}

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
