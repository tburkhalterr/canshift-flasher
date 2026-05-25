// src/components/CanshiftLogo.tsx
import type { ReactElement } from 'react'

/**
 * Placeholder logo — replace src/components/CanshiftLogo.tsx with the
 * official CANShift mark when one is available (see README).
 */
export function CanshiftLogo(): ReactElement {
  return (
    <div className="flex items-center gap-3" aria-label="CANShift">
      <div
        className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <span className="font-mono text-lg font-bold">CS</span>
      </div>
      <span className="text-xl font-semibold tracking-tight">CANShift Flasher</span>
    </div>
  )
}
