// src/App.tsx
import { useMemo, type ReactElement } from 'react'

import { CanshiftLogo } from './components/CanshiftLogo'
import { Flasher } from './components/Flasher'
import { isWebSerialSupported } from './lib/browser'

// Single-card layout mirrors canshift-studio's BootScreen treatment:
// centered, dark, sober. Max-width keeps the card readable on wide screens.
export function App(): ReactElement {
  const webSerialSupported = useMemo(() => isWebSerialSupported(), [])

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col items-center gap-3">
        <CanshiftLogo />
        <p className="font-display text-xs uppercase tracking-[0.18em] text-text-muted">
          Firmware Flasher
        </p>
      </header>

      <section className="w-full rounded-md border border-border bg-surface p-6 shadow-lg sm:p-8">
        <Flasher webSerialSupported={webSerialSupported} />
      </section>

      <footer className="flex flex-col items-center gap-2 text-center text-xs text-text-muted">
        <p>First flash · Update · Recovery — same flow.</p>
        <p>
          Open source —{' '}
          <a
            href="https://github.com/tburkhalterr/canshift-flasher"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            tburkhalterr/canshift-flasher
          </a>
          .
        </p>
      </footer>
    </main>
  )
}
