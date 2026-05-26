// src/components/flasher/SuccessView.tsx
import type { ReactElement } from 'react'

import { DASH_AP_SSID, DASH_HOSTNAME } from '../../constants'
import type { Release } from '../../lib/releases'
import { LogStream } from '../LogStream'

import { DashIllustration } from './illustrations/DashIllustration'
import { StepCard } from './illustrations/StepCard'
import { downloadLogReport } from './log-report'
import { SECONDARY_CTA_CLASSES } from './styles'

interface SuccessViewProps {
  onAgain: () => void
  log: string
  chipInfo: string | null
  port: SerialPort | null
  release: Release | null
  logTruncated: boolean
}

// Shared SVG props for the inline step icons — single colour, currentColor.
const ICON_SVG_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const WifiOffIcon = (): ReactElement => (
  <svg {...ICON_SVG_PROPS}>
    {/* WiFi arcs with a diagonal slash through them */}
    <path d="M3 9 a16 16 0 0 1 6 -3" />
    <path d="M5 13 a10 10 0 0 1 3 -2" />
    <path d="M9 17 a4 4 0 0 1 1.5 -1" />
    <circle cx="12" cy="20" r="0.5" fill="currentColor" />
    <path d="M3 3 l18 18" />
  </svg>
)

const WifiIcon = (): ReactElement => (
  <svg {...ICON_SVG_PROPS}>
    <path d="M2 8 a18 18 0 0 1 20 0" />
    <path d="M5 12 a12 12 0 0 1 14 0" />
    <path d="M8 16 a6 6 0 0 1 8 0" />
    <circle cx="12" cy="20" r="0.5" fill="currentColor" />
  </svg>
)

const GlobeIcon = (): ReactElement => (
  <svg {...ICON_SVG_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12 h18" />
    <path d="M12 3 a13 13 0 0 1 0 18 a13 13 0 0 1 0 -18 z" />
  </svg>
)

export const SuccessView = ({
  onAgain,
  log,
  chipInfo,
  port,
  release,
  logTruncated,
}: SuccessViewProps): ReactElement => {
  const heading = release ? `Flashed v${release.version} successfully` : 'Flashed successfully'
  return (
    <section className="space-y-4">
      <div className="flex flex-col items-center gap-3">
        <DashIllustration variant="success" />
        <h2 className="font-display text-lg font-bold tracking-wide text-success">{heading}</h2>
      </div>

      <div className="space-y-3">
        <StepCard step={1} icon={<WifiOffIcon />} title="Disconnect from your home WiFi">
          The dash hosts its own network — your laptop has to leave the usual one first.
        </StepCard>
        <StepCard
          step={2}
          icon={<WifiIcon />}
          title={`Connect to the ${DASH_AP_SSID} access point`}
        >
          Look for the <span className="font-mono text-text">{DASH_AP_SSID}</span> WiFi network
          and join it.
        </StepCard>
        <StepCard step={3} icon={<GlobeIcon />} title={`Open ${DASH_HOSTNAME} in your browser`}>
          Type <span className="font-mono text-text">{DASH_HOSTNAME}</span> into the address
          bar to reach Studio on the dash.
        </StepCard>
      </div>

      <button type="button" onClick={onAgain} className={SECONDARY_CTA_CLASSES}>
        Flash again
      </button>

      <details className="text-sm text-text-muted">
        <summary className="cursor-pointer">Show log</summary>
        <div className="mt-2 space-y-3">
          <LogStream log={log} />
          <button
            type="button"
            onClick={() => downloadLogReport({ log, chipInfo, port, release, logTruncated })}
            className="text-sm text-text-muted underline-offset-4 hover:underline"
          >
            Download log
          </button>
        </div>
      </details>
    </section>
  )
}
