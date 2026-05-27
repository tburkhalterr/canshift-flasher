// src/App.tsx
import { lazy, Suspense, useEffect, useMemo, useState, type ReactElement } from 'react'

import { CanshiftLogo } from './components/CanshiftLogo'
import { Flasher } from './components/Flasher'
import { BUILD_DATE, BUILD_SHA } from './constants'
import { isWebSerialSupported } from './lib/browser'

// Lazy-loaded: the help drawer is hidden behind a button on first paint.
// First-open latency is acceptable; null fallback never user-visible because
// the aside is `inert` + translated off-screen until helpOpen flips true.
const HelpZone = lazy(() =>
  import('./components/HelpZone').then((m) => ({ default: m.HelpZone })),
)

const CANSHIFT_REPO_URL = 'https://github.com/tburkhalterr/CANShift'
const FLASHER_REPO_URL = 'https://github.com/tburkhalterr/canshift-flasher'

const formatBuildDate = (iso: string): string => {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(iso)
  return match ? match[0] : iso
}

export function App(): ReactElement {
  const webSerialSupported = useMemo(() => isWebSerialSupported(), [])
  const buildDate = formatBuildDate(BUILD_DATE)
  const [helpOpen, setHelpOpen] = useState(false)

  // Esc closes the help drawer — only active when open so it never steals key
  // events from forms or other dialogs.
  useEffect(() => {
    if (!helpOpen) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setHelpOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [helpOpen])

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <CanshiftLogo />
          <span className="hidden font-display text-xs uppercase tracking-[0.18em] text-text-muted sm:inline">
            Firmware Flasher
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href="/docs/"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-display text-xs uppercase tracking-[0.15em] text-text-dim transition hover:bg-surface-2 hover:text-text focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg sm:px-3"
          >
            <DocsIcon />
            <span className="hidden sm:inline">Docs</span>
          </a>
          <a
            href={CANSHIFT_REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="CANShift on GitHub"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition hover:bg-surface-2 hover:text-text focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg"
          >
            <GithubIcon />
          </a>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <section className="mx-auto w-full max-w-3xl rounded-md border border-border bg-surface p-6 shadow-lg sm:p-8">
            <Flasher webSerialSupported={webSerialSupported} />
          </section>
        </main>

        {helpOpen ? (
          <button
            type="button"
            aria-label="Close help"
            onClick={() => setHelpOpen(false)}
            className="absolute inset-0 z-10 bg-black/40 lg:hidden"
          />
        ) : null}

        <aside
          aria-label="Help"
          // `inert` (not just aria-hidden) is what keeps focusable descendants
          // out of the tab order while the drawer is collapsed — Lighthouse's
          // `aria-hidden-focus` audit would otherwise flag the tab buttons.
          inert={!helpOpen}
          className={`absolute bottom-0 right-0 top-0 z-20 w-full max-w-sm transform border-l border-border bg-surface px-4 py-6 shadow-2xl transition-transform duration-200 ease-out sm:px-6 ${
            helpOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
          }`}
        >
          {/* Only mount HelpZone once the user has opened the drawer — keeps
              the lazy chunk request off the first-paint critical path. Once
              loaded, React keeps it mounted, so subsequent opens are instant. */}
          {helpOpen ? (
            <Suspense fallback={null}>
              <HelpZone onClose={() => setHelpOpen(false)} />
            </Suspense>
          ) : null}
        </aside>

        {helpOpen ? null : (
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="Open troubleshooting help"
            title="Troubleshooting"
            className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-text-dim shadow-lg transition hover:bg-surface-2 hover:text-text focus:outline-none focus:ring-2 focus:ring-ring sm:bottom-6 sm:right-6"
          >
            <HelpIcon />
            <span className="font-display text-xs uppercase tracking-[0.15em]">Help</span>
          </button>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-text-muted sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/docs/"
            className="underline-offset-4 hover:text-text hover:underline"
          >
            Documentation
          </a>
          <a
            href={FLASHER_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:text-text hover:underline"
          >
            tburkhalterr/canshift-flasher
          </a>
        </div>
        <a
          href={`${FLASHER_REPO_URL}/commit/${BUILD_SHA}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono underline-offset-4 hover:text-text hover:underline"
          title={`Built ${buildDate}`}
        >
          {BUILD_SHA} · {buildDate}
        </a>
      </footer>
    </div>
  )
}

const DocsIcon = (): ReactElement => (
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
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)

const GithubIcon = (): ReactElement => (
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

const HelpIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="18"
    height="18"
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
