// src/components/HelpZone.tsx
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

import { DASH_AP_SSID, DASH_HOSTNAME } from '../constants'

interface Topic {
  id: string
  question: string
  icon: ReactElement
  answer: ReactNode
}

// Inline SVG icons — no external icon library, CSP-friendly. All 16px square,
// `currentColor` so parent text colour drives the stroke/fill.

const HelpIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const UsbIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="10" cy="20" r="2" />
    <circle cx="4" cy="4" r="2" />
    <path d="M10 18V6m0 0l4 4m-4-4l-4 4" />
    <path d="M4 6v4l8 8h6a2 2 0 0 0 2-2v-2" />
    <path d="M18 14V8h4" />
  </svg>
)

const ChipIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="6" y="6" width="12" height="12" rx="1" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </svg>
)

const RestartIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

const PowerIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
)

const BrowserIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" />
  </svg>
)

const ShieldIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const TOPICS: readonly Topic[] = [
  {
    id: 'no-port',
    question: 'No port shown when I click Connect',
    icon: <UsbIcon />,
    answer: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Confirm the ESP32 is plugged in directly via USB — avoid passive hubs.</li>
        <li>
          Use a USB <em>data</em> cable, not a charge-only cable. Try a known-good cable first.
        </li>
        <li>
          On macOS, allow browser access to USB devices in System Settings &gt; Privacy &amp;
          Security.
        </li>
        <li>The ESP32 uses a CP210x or CH340 USB bridge — driver-less on modern OSes.</li>
      </ul>
    ),
  },
  {
    id: 'flash-id-ffffff',
    question: '"Flash ID is ffffff"',
    icon: <ChipIcon />,
    answer: (
      <p>
        The ESP32 is not responding in bootloader mode. Unplug the ESP32, hold the BOOT button (if
        present), re-plug, then retry. If the ESP32 has no BOOT button, just re-plug and retry — the
        flasher will assert the reset/boot lines automatically.
      </p>
    ),
  },
  {
    id: 'enter-bootloader',
    question: '"Could not enter ESP32 bootloader"',
    icon: <RestartIcon />,
    answer: (
      <p>
        Same root cause as Flash ID ffffff — the auto-reset sequence did not bring the chip into
        download mode. Try a different USB port, a different cable, and re-plug the ESP32 before
        retrying. If the ESP32 exposes a BOOT button, hold it while clicking Flash.
      </p>
    ),
  },
  {
    id: 'no-boot',
    question: "Flash succeeds but ESP32 doesn't boot",
    icon: <PowerIcon />,
    answer: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Unplug for 5 seconds, then re-plug. The ESP32 auto-resets on boot.</li>
        <li>
          Connect to the <span className="font-mono">{DASH_AP_SSID}</span> WiFi access point and
          open <span className="font-mono">{DASH_HOSTNAME}</span> in your browser.
        </li>
        <li>
          If the access point never appears, re-flash — the SPIFFS partition may not have been
          written.
        </li>
      </ul>
    ),
  },
  {
    id: 'browser-unsupported',
    question: 'Browser says "not supported"',
    icon: <BrowserIcon />,
    answer: (
      <p>
        Web Serial is Chromium-only. Use Chrome, Edge, Brave, Arc, or Opera. Safari and Firefox do
        not implement the spec and will never see the ESP32.
      </p>
    ),
  },
  {
    id: 'sha-mismatch',
    question: '"SHA-256 mismatch"',
    icon: <ShieldIcon />,
    answer: (
      <p>
        The firmware download was corrupted or tampered with. Retry — this is almost always a
        transient CDN error. If it persists, file an issue with the log attached.
      </p>
    ),
  },
] as const

export const HelpZone = (): ReactElement => {
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const activeTopic = TOPICS.find((topic) => topic.question === openTopic) ?? null

  return (
    <section
      aria-labelledby="help-zone-title"
      className="mt-2 rounded-md border border-border bg-surface px-4 py-4 text-sm text-text-dim"
    >
      <h2
        id="help-zone-title"
        className="flex items-center gap-2 font-display text-sm uppercase tracking-[0.15em] text-text"
      >
        <HelpIcon />
        Troubleshooting
      </h2>

      <div role="tablist" aria-label="Troubleshooting topics" className="mt-4 flex flex-wrap gap-2">
        {TOPICS.map((topic) => {
          const isActive = topic.question === openTopic
          const panelId = `help-panel-${topic.id}`
          const tabId = `help-tab-${topic.id}`
          return (
            <button
              key={topic.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              aria-label={topic.question}
              title={topic.question}
              onClick={() => setOpenTopic(isActive ? null : topic.question)}
              className={`flex h-10 w-10 items-center justify-center rounded-sm border transition-colors ${
                isActive
                  ? 'border-status-danger bg-surface-2 text-status-danger'
                  : 'border-border bg-surface-2 text-text-dim hover:border-status-danger hover:text-status-danger'
              }`}
            >
              {topic.icon}
            </button>
          )
        })}
      </div>

      {activeTopic ? (
        <div
          id={`help-panel-${activeTopic.id}`}
          role="tabpanel"
          aria-labelledby={`help-tab-${activeTopic.id}`}
          className="mt-3 rounded-sm border border-border bg-surface-2 px-3 py-3"
        >
          <h3 className="text-text">{activeTopic.question}</h3>
          <div className="mt-2 text-text-dim">{activeTopic.answer}</div>
        </div>
      ) : null}

      <p className="mt-4 text-text-muted">
        Need more help? Open an issue on{' '}
        <a
          href="https://github.com/tburkhalterr/canshift-flasher/issues"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-4 hover:underline"
        >
          tburkhalterr/canshift-flasher
        </a>
        .
      </p>
    </section>
  )
}
