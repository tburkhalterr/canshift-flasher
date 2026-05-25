// src/App.tsx
import { useMemo, type ReactElement } from 'react'

import { CanshiftLogo } from './components/CanshiftLogo'
import { Flasher } from './components/Flasher'
import { isWebSerialSupported } from './lib/browser'

export function App(): ReactElement {
  const webSerialSupported = useMemo(() => isWebSerialSupported(), [])

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <CanshiftLogo />
      </header>

      <div className="rounded-lg border border-border bg-surface p-6 shadow-lg">
        <Flasher webSerialSupported={webSerialSupported} />
      </div>

      <footer className="text-xs text-text-muted">
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
          . Firmware source:{' '}
          <a
            href="https://github.com/tburkhalterr/CANShift"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            tburkhalterr/CANShift
          </a>
          .
        </p>
      </footer>
    </main>
  )
}
