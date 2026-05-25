// src/components/ProgressBar.tsx
import type { ReactElement } from 'react'

interface ProgressBarProps {
  value: number | null
  max: number | null
  label: string
}

export function ProgressBar({ value, max, label }: ProgressBarProps): ReactElement {
  const determinate = value !== null && max !== null && max > 0
  const pct = determinate ? Math.min(100, Math.round((value / max) * 100)) : 0
  const valueText = determinate ? `${pct}%` : '...'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm text-text-dim">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{valueText}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? pct : undefined}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full bg-primary transition-[width] duration-200 ${
            determinate ? '' : 'animate-pulse'
          }`}
          style={{ width: determinate ? `${pct}%` : '40%' }}
        />
      </div>
    </div>
  )
}
