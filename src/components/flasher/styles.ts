// src/components/flasher/styles.ts

// Visual language mirrors canshift-studio: Orbitron for headers (via
// `font-display`), system sans for body, brand red (`status-danger`) for
// primary CTAs, `border-border` + `bg-surface-2` for secondary surfaces.
export const PRIMARY_CTA_CLASSES =
  'inline-flex items-center justify-center rounded-md bg-status-danger px-5 py-2.5 text-sm font-medium text-text shadow-sm transition hover:bg-status-danger/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg disabled:pointer-events-none disabled:opacity-50'

export const SECONDARY_CTA_CLASSES =
  'inline-flex items-center justify-center rounded-md border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-text transition hover:bg-surface focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg'

export const SECTION_HEADER_CLASSES =
  'font-display text-lg font-bold tracking-wide text-text'

// Full-width form controls used inside the flasher card. Shared between
// <select> dropdowns and text <input>s so spacing/focus styling stays in
// lock-step. SELECT_CLASSES keeps the `font-mono` tag look + the loading
// `disabled:cursor-wait` affordance used by release/channel pickers.
export const SELECT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-60'

export const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60'
