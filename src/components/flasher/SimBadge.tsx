// src/components/flasher/SimBadge.tsx
import type { ReactElement } from 'react'

export const SimBadge = (): ReactElement => {
  return (
    <div className="flex items-center justify-center">
      <span className="inline-flex items-center rounded-full border border-warning/60 bg-surface-2 px-3 py-1 font-display text-xs uppercase tracking-[0.18em] text-warning">
        (sim)
      </span>
    </div>
  )
}
