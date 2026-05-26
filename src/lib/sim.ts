// src/lib/sim.ts
//
// Hardware-free dev mode. When enabled, the flasher bypasses Web Serial and
// runs a fake flash sequence in the renderer so contributors can walk every
// UI state — idle → ready → flashing (progress) → success / failed — without
// a CANShift dash plugged in.
//
// Resolution order (read once at module load):
//   1. `?sim=success` / `?sim=fail` / `?sim=1` query string → wins.
//      `?sim=1` is sugar for `?sim=success` so the most common case is short.
//   2. `VITE_SIM` env at build time. Same value vocabulary.
//   3. Otherwise: `'off'` and every helper is a no-op.
//
// SECURITY (SEC-006, #98): the query-string branch is gated by
// `import.meta.env.DEV || VITE_SIM` so a phishing link like
// `https://flasher.example/?sim=success` cannot trick a user on the production
// build into thinking their ESP32 was flashed. `VITE_SIM` is an explicit
// build-time opt-in used by the e2e suite (Playwright runs against
// `vite preview`, which is a production build, so the preview server is
// launched with `VITE_SIM=1` — see `playwright.config.ts`).
//
// Sim mode never reaches `lib/esptool.ts` or `lib/firmware.ts` — those modules
// stay clean of conditional logic. `useFlasher` is the only call-site that
// branches on `isSimEnabled()`.

import { IS_DEV_BUILD, SUPPORTED_USB_FILTERS, VITE_SIM } from '../constants'

export type SimMode = 'off' | 'success' | 'fail'

function parseSimValue(raw: string | null | undefined): SimMode | null {
  if (raw === null || raw === undefined) return null
  const v = raw.trim().toLowerCase()
  if (v === '') return null
  if (v === 'success' || v === '1' || v === 'true') return 'success'
  if (v === 'fail' || v === 'failed' || v === '0' || v === 'false') {
    return v === '0' || v === 'false' ? 'off' : 'fail'
  }
  if (v === 'off') return 'off'
  return null
}

function resolveSimMode(): SimMode {
  // Production builds with no explicit `VITE_SIM` opt-in ignore `?sim=*`
  // entirely — see header for SEC-006 rationale.
  const querystringAllowed = IS_DEV_BUILD || parseSimValue(VITE_SIM) !== null
  if (querystringAllowed && typeof window !== 'undefined') {
    try {
      const qs = new URLSearchParams(window.location.search).get('sim')
      const fromQs = parseSimValue(qs)
      if (fromQs !== null) return fromQs
    } catch {
      /* swallow — non-browser test env, etc. */
    }
  }
  const fromEnv = parseSimValue(VITE_SIM)
  return fromEnv ?? 'off'
}

/** Resolved once at module load — see header for resolution order. */
export const SIM_MODE: SimMode = resolveSimMode()

/** True when sim mode is active. Branch on this in `useFlasher` only. */
export function isSimEnabled(): boolean {
  return SIM_MODE !== 'off'
}

/**
 * True when sim mode is somehow active on a production build (i.e. a
 * deployed bundle was built with `VITE_SIM` set, or — in the unlikely
 * defence-in-depth case that the dev gate is bypassed — sim is on without
 * `import.meta.env.DEV`). Drives the loud "SIMULATION — nothing is being
 * flashed" banner in `SimBadge`.
 */
export function isProdSimActive(): boolean {
  return !IS_DEV_BUILD && SIM_MODE !== 'off'
}

/**
 * Returns a fake `SerialPort`-shaped object whose `getInfo()` matches the
 * first supported VID/PID, so `isSupportedPort` accepts it and the existing
 * idle → ready transition fires unchanged.
 */
export function simSelectPort(): SerialPort {
  const filter = SUPPORTED_USB_FILTERS[0]
  const vendor = filter?.usbVendorId ?? 0x1a86
  const product = filter?.usbProductId ?? 0x7523
  // Cast through unknown — we only need the shape that `useFlasher` and
  // `formatPortInfo` actually read. The serial transport never sees this
  // value because `flashFirmware` is replaced by `simFlash`.
  return {
    getInfo: () => ({ usbVendorId: vendor, usbProductId: product }),
  } as unknown as SerialPort
}

export interface SimFlashCallbacks {
  onLog: (line: string) => void
  onProgress: (progress: { written: number; total: number }) => void
  onChipInfo?: (chip: string) => void
}

/**
 * Realistic fake flash sequence — ~3-4s wall-clock. Resolves on `success`
 * and throws a recognisable error on `fail` so the UI lands in `failed`
 * with a non-empty `errorMessage`.
 */
export async function simFlash(callbacks: SimFlashCallbacks): Promise<void> {
  const { onLog, onProgress, onChipInfo } = callbacks
  const totalBytes = 1_572_864 // ~1.5 MiB — matches a real merged image.
  const chipLabel = 'ESP32-S3 (sim)'

  onLog('[sim] Starting fake flash sequence.\n')
  await sleep(150)
  onLog('[sim] Trying reset sequence: classic...\n')
  await sleep(200)
  if (onChipInfo) onChipInfo(chipLabel)
  onLog(`[sim] Detected chip: ${chipLabel}\n`)
  await sleep(200)
  onLog('[sim] Writing flash...\n')

  if (SIM_MODE === 'fail') {
    // Surface ~30% in so the progress bar moves before failure.
    for (let written = 0; written <= totalBytes * 0.3; written += 65_536) {
      onProgress({ written, total: totalBytes })
      await sleep(60)
    }
    onLog('[sim] Simulated failure injected.\n')
    throw new Error('Simulated flash failure (sim mode).')
  }

  const stepBytes = 65_536
  for (let written = 0; written <= totalBytes; written += stepBytes) {
    onProgress({ written: Math.min(written, totalBytes), total: totalBytes })
    await sleep(40)
  }
  onLog('[sim] Flash complete.\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
