// src/components/HelpZone.tsx
import type { ReactElement, ReactNode } from 'react'

interface Topic {
  question: string
  answer: ReactNode
}

const TOPICS: readonly Topic[] = [
  {
    question: 'No port shown when I click Connect',
    answer: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Confirm the dash is plugged in directly via USB — avoid passive hubs.</li>
        <li>
          Use a USB <em>data</em> cable, not a charge-only cable. Try a known-good cable first.
        </li>
        <li>
          On macOS, allow browser access to USB devices in System Settings &gt; Privacy &amp;
          Security.
        </li>
        <li>The dash uses a CP210x or CH340 USB bridge — driver-less on modern OSes.</li>
      </ul>
    ),
  },
  {
    question: '"Flash ID is ffffff"',
    answer: (
      <p>
        The ESP32 is not responding in bootloader mode. Unplug the dash, hold the BOOT button (if
        present), re-plug, then retry. If the dash has no BOOT button, just re-plug and retry — the
        flasher will assert the reset/boot lines automatically.
      </p>
    ),
  },
  {
    question: '"Could not enter ESP32 bootloader"',
    answer: (
      <p>
        Same root cause as Flash ID ffffff — the auto-reset sequence did not bring the chip into
        download mode. Try a different USB port, a different cable, and re-plug the dash before
        retrying. If the dash exposes a BOOT button, hold it while clicking Flash.
      </p>
    ),
  },
  {
    question: "Flash succeeds but dash doesn't boot",
    answer: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Unplug for 5 seconds, then re-plug. The dash auto-resets on boot.</li>
        <li>
          Connect to the <span className="font-mono">CANShift</span> WiFi access point and open{' '}
          <span className="font-mono">canshift.local</span> in your browser.
        </li>
        <li>
          If the access point never appears, re-flash — the SPIFFS partition may not have been
          written.
        </li>
      </ul>
    ),
  },
  {
    question: 'Browser says "not supported"',
    answer: (
      <p>
        Web Serial is Chromium-only. Use Chrome, Edge, Brave, Arc, or Opera. Safari and Firefox do
        not implement the spec and will never see the dash.
      </p>
    ),
  },
  {
    question: '"SHA-256 mismatch"',
    answer: (
      <p>
        The firmware download was corrupted or tampered with. Retry — this is almost always a
        transient CDN error. If it persists, file an issue with the log attached.
      </p>
    ),
  },
] as const

export function HelpZone(): ReactElement {
  return (
    <details className="mt-2 rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-dim">
      <summary className="cursor-pointer text-text">Troubleshooting</summary>
      <div className="mt-3 space-y-2">
        {TOPICS.map((topic) => (
          <details
            key={topic.question}
            className="rounded-sm border border-border bg-surface-2 px-3 py-2"
          >
            <summary className="cursor-pointer text-text">{topic.question}</summary>
            <div className="mt-2 text-text-dim">{topic.answer}</div>
          </details>
        ))}
        <p className="pt-2 text-text-muted">
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
      </div>
    </details>
  )
}
