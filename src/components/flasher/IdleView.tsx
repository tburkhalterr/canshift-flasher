// src/components/flasher/IdleView.tsx
import type { ReactElement } from 'react'

import type { Release } from '../../lib/releases'

import { ErrorBanner } from './ErrorBanner'
import { DashIllustration } from './illustrations/DashIllustration'
import { ReleaseSummary } from './ReleaseSummary'
import { PRIMARY_CTA_CLASSES, SECTION_HEADER_CLASSES } from './styles'

interface IdleViewProps {
  onConnect: () => void
  errorMessage: string | null
  release: Release | null
}

export const IdleView = ({ onConnect, errorMessage, release }: IdleViewProps): ReactElement => {
  return (
    <section className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <DashIllustration variant="idle" />
        <p className="text-sm leading-relaxed text-text-dim">
          Plug your ESP32 in via USB to begin.
        </p>
      </div>

      <div className="space-y-2">
        <h2 className={SECTION_HEADER_CLASSES}>Flash your ESP32</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          The same flow covers a first flash, a normal update, and recovery from a broken
          update.
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
