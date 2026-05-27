// src/components/HelpZone.tsx
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

import { DASH_AP_SSID, DASH_HOSTNAME } from '../constants'

import {
  BrowserIcon,
  ChipIcon,
  CloseIcon,
  HelpIcon,
  PowerIcon,
  RestartIcon,
  ShieldIcon,
  UsbIcon,
} from './icons'

interface Topic {
  id: string
  question: string
  icon: ReactElement
  answer: ReactNode
}

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

interface HelpZoneProps {
  onClose?: () => void
}

export const HelpZone = ({ onClose }: HelpZoneProps = {}): ReactElement => {
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const activeTopic = TOPICS.find((topic) => topic.question === openTopic) ?? null

  return (
    <section
      aria-labelledby="help-zone-title"
      className="text-sm text-text-dim"
    >
      <div className="flex items-center justify-between">
        <h2
          id="help-zone-title"
          className="flex items-center gap-2 font-display text-sm uppercase tracking-[0.15em] text-text"
        >
          <HelpIcon />
          Troubleshooting
        </h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label="Troubleshooting topics"
        className="mt-4 flex flex-wrap gap-2"
      >
        {TOPICS.map((topic) => {
          const isOpen = topic.question === openTopic
          const panelId = `help-panel-${topic.id}`
          const buttonId = `help-disclosure-${topic.id}`
          return (
            <button
              key={topic.id}
              id={buttonId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              aria-label={topic.question}
              title={topic.question}
              onClick={() => setOpenTopic(isOpen ? null : topic.question)}
              className={`flex h-10 w-10 items-center justify-center rounded-sm border transition-colors ${
                isOpen
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
          aria-labelledby={`help-disclosure-${activeTopic.id}`}
          className="mt-3 rounded-sm border border-border bg-surface-2 px-3 py-3"
        >
          <h3 className="text-text">{activeTopic.question}</h3>
          <div className="mt-2 text-text-dim">{activeTopic.answer}</div>
        </div>
      ) : null}

      <p className="mt-4 text-text-muted">
        Read the{' '}
        <a href="/docs/" className="underline-offset-4 hover:underline">
          full documentation
        </a>{' '}
        or open an issue on{' '}
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
