// src/components/flasher/illustrations/StepCard.tsx
import type { ReactElement, ReactNode } from 'react'

interface StepCardProps {
  step: number
  icon: ReactNode
  title: string
  children: ReactNode
}

export const StepCard = ({ step, icon, title, children }: StepCardProps): ReactElement => {
  return (
    <div className="flex gap-3 rounded-md border border-border bg-surface-2 px-4 py-3">
      <div
        aria-hidden="true"
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-text"
      >
        {step}
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-text-dim">
            {icon}
          </span>
          <h3 className="font-display text-sm font-bold tracking-wide text-text">{title}</h3>
        </div>
        <div className="text-sm leading-relaxed text-text-dim">{children}</div>
      </div>
    </div>
  )
}
