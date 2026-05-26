// src/App.tsx
import { useMemo, type ReactElement } from 'react'

import { CanshiftLogo } from './components/CanshiftLogo'
import { Flasher } from './components/Flasher'
import { isWebSerialSupported } from './lib/browser'

// Single-card layout mirrors canshift-studio's BootScreen treatment:
// centered, dark, sober. Max-width keeps the card readable on wide screens.
// The GitHub link in the top-right corner points at the main CANShift repo
// (firmware + studio + mobile), not at this flasher sub-project — the footer
// link below handles the flasher repo.
const CANSHIFT_REPO_URL = 'https://github.com/tburkhalterr/CANShift'

export function App(): ReactElement {
  const webSerialSupported = useMemo(() => isWebSerialSupported(), [])

  return (
    <>
      <a
        href={CANSHIFT_REPO_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="CANShift on GitHub"
        className="fixed right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition hover:bg-surface hover:text-text focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg sm:right-6 sm:top-6"
      >
        <GithubIcon />
      </a>

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
    </>
  )
}

function GithubIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1-.02-1.97-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.17a11.07 11.07 0 0 1 5.79 0c2.21-1.48 3.18-1.17 3.18-1.17.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.42-2.69 5.39-5.26 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.13 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}
