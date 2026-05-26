// src/components/StepGuide.tsx
import type { ReactElement } from 'react'

import type { FlasherState } from '../hooks/useFlasher'

type StepStatus = 'pending' | 'active' | 'done'

interface Step {
  index: number
  label: string
  icon: (props: { className: string }) => ReactElement
}

// Inline SVGs keep the CSP strict — no external icon library.
function UsbIcon({ className }: { className: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2v14" />
      <path d="M12 16l-4-4h8l-4 4z" fill="currentColor" />
      <path d="M12 22v-3" />
      <path d="M8 10V7h2" />
      <path d="M16 12V9l-2-2" />
      <circle cx="12" cy="3.5" r="1.5" fill="currentColor" />
    </svg>
  )
}

function LinkIcon({ className }: { className: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  )
}

function BoltIcon({ className }: { className: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M13 2L4 14h6l-2 8 9-12h-6l2-8z" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  )
}

const STEPS: readonly Step[] = [
  { index: 1, label: 'Plug', icon: UsbIcon },
  { index: 2, label: 'Connect', icon: LinkIcon },
  { index: 3, label: 'Flash', icon: BoltIcon },
] as const

function getActiveStep(state: FlasherState): number {
  switch (state) {
    case 'idle':
    case 'failed':
      return 1
    case 'ready':
      return 2
    case 'flashing':
      return 3
    case 'success':
      return 4
  }
}

function statusFor(stepIndex: number, activeStep: number): StepStatus {
  if (stepIndex < activeStep) return 'done'
  if (stepIndex === activeStep) return 'active'
  return 'pending'
}

// Direction:
// - 'horizontal' — 3 cards in a row (legacy mobile-friendly layout).
// - 'vertical' — 3 cards stacked, label right of icon.
// - 'responsive' — horizontal on mobile, vertical on md+ (Tailwind `md:` breakpoint).
type StepGuideDirection = 'horizontal' | 'vertical' | 'responsive'

const LIST_CLASS_BY_DIRECTION: Record<StepGuideDirection, string> = {
  horizontal: 'flex flex-row flex-wrap gap-2',
  vertical: 'flex flex-col gap-2',
  responsive: 'flex flex-row flex-wrap gap-2 md:flex-col md:flex-nowrap',
}

const CARD_CLASS_BY_DIRECTION: Record<StepGuideDirection, string> = {
  horizontal: 'flex flex-1 min-w-[120px] flex-row items-center gap-2 rounded-md border px-3 py-2.5',
  vertical: 'flex w-full flex-row items-center gap-2 rounded-md border px-3 py-2.5',
  responsive:
    'flex flex-1 min-w-[120px] flex-row items-center gap-2 rounded-md border px-3 py-2.5 md:w-full md:flex-none',
}

const CARD_BY_STATUS: Record<StepStatus, string> = {
  pending: 'border-border bg-surface',
  active: 'border-status-danger/60 bg-status-danger-dim',
  done: 'border-border bg-surface',
}

const ICON_BY_STATUS: Record<StepStatus, string> = {
  pending: 'text-text-muted',
  active: 'text-status-danger',
  done: 'text-success',
}

const LABEL_BY_STATUS: Record<StepStatus, string> = {
  pending: 'text-text-muted',
  active: 'text-text',
  done: 'text-text-dim',
}

const NUMBER_BY_STATUS: Record<StepStatus, string> = {
  pending: 'text-text-muted',
  active: 'text-status-danger',
  done: 'text-text-dim',
}

interface StepGuideProps {
  state: FlasherState
  direction?: StepGuideDirection
}

export function StepGuide({ state, direction = 'responsive' }: StepGuideProps): ReactElement {
  const activeStep = getActiveStep(state)

  return (
    <ol aria-label="Flashing progress" className={LIST_CLASS_BY_DIRECTION[direction]}>
      {STEPS.map((step) => {
        const status = statusFor(step.index, activeStep)
        const Icon = status === 'done' ? CheckCircleIcon : step.icon
        const ariaLabel = `Step ${step.index} of 3: ${step.label} — ${status}`
        return (
          <li
            key={step.index}
            aria-label={ariaLabel}
            {...(status === 'active' ? { 'aria-current': 'step' as const } : {})}
            className={`${CARD_CLASS_BY_DIRECTION[direction]} ${CARD_BY_STATUS[status]}`}
          >
            <span
              aria-hidden="true"
              className={`font-display text-xs font-bold ${NUMBER_BY_STATUS[status]}`}
            >
              {step.index}
            </span>
            <Icon className={ICON_BY_STATUS[status]} />
            <span className={`text-sm font-medium whitespace-nowrap ${LABEL_BY_STATUS[status]}`}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
