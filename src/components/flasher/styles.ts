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
