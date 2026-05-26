// src/components/flasher/ReadyView.tsx
import type { ReactElement } from 'react'

import type { AdvancedOptions } from '../../hooks/useFlasher'
import { formatPortInfo } from '../../lib/format'

import { AdvancedPanel } from './AdvancedPanel'
import { PRIMARY_CTA_CLASSES } from './styles'

interface ReadyViewProps {
  port: SerialPort | null
  chipInfo: string | null
  onFlash: () => void
  onReselect: () => void
  advanced: AdvancedOptions
  onAdvancedChange: (opts: AdvancedOptions) => void
}

export const ReadyView = ({
  port,
  chipInfo,
  onFlash,
  onReselect,
  advanced,
  onAdvancedChange,
}: ReadyViewProps): ReactElement => {
  return (
    <section className="space-y-6">
      <div className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
        Connected:{' '}
        <span className="font-mono text-text">{port ? formatPortInfo(port) : '—'}</span>
      </div>

      {chipInfo ? (
        <p className="text-sm text-text-dim">
          Detected: <span className="font-mono text-text">{chipInfo}</span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={onFlash}
        className={`w-full ${PRIMARY_CTA_CLASSES} py-3 text-base font-semibold`}
      >
        Flash latest
      </button>

      <AdvancedPanel value={advanced} onChange={onAdvancedChange} />

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
