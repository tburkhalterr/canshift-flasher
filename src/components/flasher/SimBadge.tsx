// src/components/flasher/SimBadge.tsx
import type { ReactElement } from 'react'

import { isProdSimActive } from '../../lib/sim'

/**
 * Sim-mode indicator.
 *
 * - Dev build (or `vite preview` with `VITE_SIM` set): subtle pill. This is
 *   the working surface for contributors and the e2e suite, so it should not
 *   shout.
 * - Production build with sim somehow active (SEC-006 defence in depth):
 *   loud, persistent red banner so a phished user is told in unmistakable
 *   terms that *nothing is actually being flashed*. The dev/VITE_SIM gate in
 *   `sim.ts:resolveSimMode` is the primary protection — this banner is the
 *   belt to that braces, surfaced only if anything ever slips through.
 */
export const SimBadge = (): ReactElement => {
  if (isProdSimActive()) {
    return (
      <div
        role="alert"
        className="rounded-lg border-2 border-danger bg-danger/15 px-4 py-3 text-center"
      >
        <p className="font-display text-base font-bold uppercase tracking-[0.18em] text-danger">
          Simulation mode — nothing is being flashed
        </p>
        <p className="mt-1 text-sm text-danger/90">
          This page is running a fake flash sequence. If you reached this page
          from a link claiming to flash your ESP32, close it now and visit the
          official flasher directly.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center">
      <span className="inline-flex items-center rounded-full border border-warning/60 bg-surface-2 px-3 py-1 font-display text-xs uppercase tracking-[0.18em] text-warning">
        (sim)
      </span>
    </div>
  )
}
