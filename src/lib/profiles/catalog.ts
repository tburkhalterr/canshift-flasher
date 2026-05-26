// src/lib/profiles/catalog.ts
//
// Catalog loader — reads the static index + per-profile signals.json files
// shipped under `public/profiles/`. Both endpoints are validated against the
// vendored schema (see `./schema.ts`) before any consumer sees them, so a
// malformed catalog fails loudly instead of silently corrupting the flash
// flow.

import {
  ProfileIndexSchema,
  RuntimeSignalConfigSchema,
  type ProfileIndexEntry,
  type RuntimeSignalConfig,
} from './schema'

const INDEX_PATH = '/profiles/index.json'
const profilePath = (slug: string): string => `/profiles/${slug}.json`

/** The selected profile threaded through the flash flow. */
export interface SelectedEcuProfile {
  slug: string
  name: string
  signals: RuntimeSignalConfig
}

/**
 * Fetch and validate the catalog index.
 *
 * Throws on network error, non-2xx response, or schema mismatch — the picker
 * surfaces the message inline and the user can pick "Skip" to proceed.
 */
export async function loadProfileIndex(
  signal?: AbortSignal,
): Promise<ProfileIndexEntry[]> {
  const fetchInit: RequestInit = signal ? { signal } : {}
  const response = await fetch(INDEX_PATH, fetchInit)
  if (!response.ok) {
    throw new Error(
      `Failed to load profile index (HTTP ${String(response.status)})`,
    )
  }
  const raw: unknown = await response.json()
  return ProfileIndexSchema.parse(raw)
}

/**
 * Fetch and validate a single profile's signals.json.
 */
export async function loadProfileSignals(
  slug: string,
  signal?: AbortSignal,
): Promise<RuntimeSignalConfig> {
  const fetchInit: RequestInit = signal ? { signal } : {}
  const response = await fetch(profilePath(slug), fetchInit)
  if (!response.ok) {
    throw new Error(
      `Failed to load profile "${slug}" (HTTP ${String(response.status)})`,
    )
  }
  const raw: unknown = await response.json()
  return RuntimeSignalConfigSchema.parse(raw)
}

/**
 * Trigger a client-side download of the picked profile's raw JSON. Used by
 * SuccessView until SPIFFS injection (Phase 1b) lands — the user uploads
 * the file via Studio post-flash.
 */
export function downloadProfileJson(profile: SelectedEcuProfile): void {
  const body = JSON.stringify(profile.signals, null, 2)
  const blob = new Blob([body], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = 'signals.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
