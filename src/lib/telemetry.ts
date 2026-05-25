// src/lib/telemetry.ts
//
// Anonymous, opt-in telemetry for flash outcomes. Sends a single tiny JSON
// blob per flash attempt to `VITE_TELEMETRY_URL` (build-time env). When the
// env var is unset, every call is a no-op — there is no default endpoint.
//
// Strict no-PII policy:
//   - No port VID/PID, no full user agent, no log contents, no user input.
//   - User agent is bucketed to coarse {browser,os} families, no version.
//   - Errors are mapped to a small enum, never raw `error.message`.
//
// Users can opt out per-browser by setting:
//   localStorage['canshift-flasher.telemetry.optout'] = '1'

import { TELEMETRY_URL } from '../constants'

export type TelemetryOutcome = 'success' | 'failed' | 'cancelled'

export type TelemetryErrorClass =
  | 'flash-id-ffffff'
  | 'sync-failed'
  | 'sha256-mismatch'
  | 'disconnect'
  | 'http'
  | 'cancelled'
  | 'unknown'

export interface TelemetryEvent {
  outcome: TelemetryOutcome
  chipFamily: string | null
  firmwareVersion: string | null
  durationMs: number
  errorClass: TelemetryErrorClass | null
}

const OPT_OUT_STORAGE_KEY = 'canshift-flasher.telemetry.optout'

type BrowserBucket = 'Chrome' | 'Edge' | 'Brave' | 'Opera' | 'Arc' | 'Other'
type OsBucket = 'Windows' | 'macOS' | 'Linux' | 'Other'

interface UaBuckets {
  browser: BrowserBucket
  os: OsBucket
}

/** Coarse browser/OS bucket — no version, no architecture, no language. */
function bucketUserAgent(ua: string): UaBuckets {
  let browser: BrowserBucket = 'Other'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = 'Opera'
  else if (/Arc\//.test(ua)) browser = 'Arc'
  // Brave masks itself as Chrome in UA; the only reliable signal is the
  // `navigator.brave` runtime hook (checked separately in `detectBrowser`).
  else if (/Chrome\//.test(ua)) browser = 'Chrome'

  let os: OsBucket = 'Other'
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua) && !/Android/.test(ua)) os = 'Linux'

  return { browser, os }
}

async function detectBrowser(uaBrowser: BrowserBucket): Promise<BrowserBucket> {
  // Brave exposes a runtime hook — `navigator.brave.isBrave()`.
  const maybeBrave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } })
    .brave
  if (maybeBrave?.isBrave) {
    try {
      const isBrave = await maybeBrave.isBrave()
      if (isBrave) return 'Brave'
    } catch {
      /* swallow */
    }
  }
  return uaBrowser
}

function isOptedOut(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_STORAGE_KEY) === '1'
  } catch {
    // localStorage can throw in some private modes; treat as not opted out.
    return false
  }
}

/**
 * Map a free-form error message to a stable, low-cardinality bucket. The
 * raw message is never sent — only the bucket name.
 */
export function classifyError(message: string): TelemetryErrorClass {
  if (/Flash ID is ffffff/i.test(message)) return 'flash-id-ffffff'
  if (/SHA-?256.*mismatch/i.test(message)) return 'sha256-mismatch'
  if (/USB connection lost/i.test(message) || /disconnect/i.test(message)) {
    return 'disconnect'
  }
  if (/HTTP\s+\d{3}/i.test(message) || /Failed to (fetch|download)/i.test(message)) {
    return 'http'
  }
  if (/Could not enter ESP32 bootloader/i.test(message) || /sync/i.test(message)) {
    return 'sync-failed'
  }
  if (/cancel/i.test(message)) return 'cancelled'
  return 'unknown'
}

/**
 * Best-effort fire-and-forget telemetry. Never throws, never blocks UI.
 * No-op when `VITE_TELEMETRY_URL` is unset or the user has opted out.
 */
export async function sendTelemetry(event: TelemetryEvent): Promise<void> {
  if (!TELEMETRY_URL) return
  if (isOptedOut()) return

  try {
    const ua = bucketUserAgent(navigator.userAgent)
    const browser = await detectBrowser(ua.browser)
    const body = JSON.stringify({
      ...event,
      browser,
      os: ua.os,
    })

    await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    })
  } catch {
    // Telemetry MUST NEVER affect UX — swallow every error path.
  }
}
