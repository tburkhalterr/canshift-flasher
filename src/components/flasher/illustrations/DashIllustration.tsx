// src/components/flasher/illustrations/DashIllustration.tsx
import type { ReactElement } from 'react'

export type DashVariant = 'idle' | 'ready' | 'flashing' | 'success' | 'failed'

interface DashIllustrationProps {
  variant: DashVariant
  className?: string
}

const VARIANT_LABELS: Record<DashVariant, string> = {
  idle: 'ESP32 awaiting USB connection',
  ready: 'ESP32 connected, ready to flash',
  flashing: 'ESP32 being flashed',
  success: 'ESP32 successfully flashed',
  failed: 'ESP32 flash failed',
}

// Tailwind text colour driving `currentColor` on every stroke.
const VARIANT_TONE: Record<DashVariant, string> = {
  idle: 'text-text-dim',
  ready: 'text-success',
  flashing: 'text-warning',
  success: 'text-success',
  failed: 'text-status-danger',
}

// Whole illustration pulses softly while flashing — pure Tailwind, no JS.
const VARIANT_ANIMATION: Record<DashVariant, string> = {
  idle: '',
  ready: '',
  flashing: 'animate-pulse',
  success: '',
  failed: '',
}

export const DashIllustration = ({
  variant,
  className,
}: DashIllustrationProps): ReactElement => {
  const tone = VARIANT_TONE[variant]
  const animation = VARIANT_ANIMATION[variant]
  const wrapperClasses = ['w-48', 'transition-colors', tone, animation, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapperClasses}>
      <svg
        role="img"
        aria-label={VARIANT_LABELS[variant]}
        viewBox="0 0 200 120"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Dash body — outer rectangle */}
        <rect x="20" y="20" width="160" height="80" rx="8" />

        {/* Inner display area */}
        <rect x="32" y="32" width="136" height="56" rx="4" aria-hidden="true" />

        {/* USB-C port detail on the right edge — pulses gently in idle to invite plugging in */}
        <g aria-hidden="true" className={variant === 'idle' ? 'animate-pulse' : ''}>
          <rect x="180" y="54" width="6" height="12" rx="2" />
        </g>

        {/* Status LEDs along the bottom edge */}
        <g aria-hidden="true">
          <circle cx="40" cy="108" r="2" />
          <circle cx="50" cy="108" r="2" />
        </g>

        {/* Variant-specific overlays */}
        {variant === 'ready' ? (
          // Check-circle top-right of the display
          <g aria-hidden="true">
            <circle cx="156" cy="44" r="10" />
            <path d="M150 44 l4 4 l8 -8" />
          </g>
        ) : null}

        {variant === 'flashing' ? (
          // Progress sliver inside the display
          <g aria-hidden="true">
            <rect
              x="40"
              y="76"
              width="60"
              height="4"
              rx="2"
              fill="currentColor"
              stroke="none"
            />
            <rect x="40" y="76" width="120" height="4" rx="2" />
          </g>
        ) : null}

        {variant === 'success' ? (
          <g aria-hidden="true">
            {/* Abstracted dashboard UI inside the display — horizontal bars */}
            <rect x="42" y="44" width="60" height="4" rx="2" />
            <rect x="42" y="56" width="80" height="4" rx="2" />
            <rect x="42" y="68" width="40" height="4" rx="2" />
            {/* Large check-circle overlay top-right */}
            <circle cx="156" cy="44" r="12" />
            <path d="M149 44 l5 5 l10 -10" />
          </g>
        ) : null}

        {variant === 'failed' ? (
          // Warning-triangle overlay top-right
          <g aria-hidden="true">
            <path d="M156 32 l12 22 l-24 0 z" />
            <path d="M156 40 v8" />
            <circle cx="156" cy="51" r="0.5" fill="currentColor" />
          </g>
        ) : null}
      </svg>
    </div>
  )
}
