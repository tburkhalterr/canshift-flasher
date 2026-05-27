// src/lib/dashboards/catalog.ts
//
// Catalog loader — reads the static index + per-dashboard JSON files shipped
// under `public/dashboards/`. Both endpoints are validated against the
// vendored schema (see `./schema.ts`) before any consumer sees them, so a
// malformed catalog fails loudly instead of silently corrupting the flash
// flow.

import {
  DashboardConfigSchema,
  DashboardIndexSchema,
  type DashboardConfig,
  type DashboardIndexEntry,
} from './schema'

const INDEX_PATH = '/dashboards/index.json'
const dashboardPath = (slug: string): string => `/dashboards/${slug}.json`

/** The selected dashboard layout threaded through the flash flow. */
export interface SelectedDashboardLayout {
  slug: string
  name: string
  config: DashboardConfig
}

/**
 * Fetch and validate the catalog index.
 *
 * Throws on network error, non-2xx response, or schema mismatch — the picker
 * surfaces the message inline and the user can pick "Skip" to proceed.
 */
export async function loadDashboardIndex(
  signal?: AbortSignal,
): Promise<DashboardIndexEntry[]> {
  const fetchInit: RequestInit = signal ? { signal } : {}
  const response = await fetch(INDEX_PATH, fetchInit)
  if (!response.ok) {
    throw new Error(
      `Failed to load dashboard index (HTTP ${String(response.status)})`,
    )
  }
  const raw: unknown = await response.json()
  return DashboardIndexSchema.parse(raw)
}

/**
 * Fetch and validate a single dashboard layout's JSON.
 */
export async function loadDashboardConfig(
  slug: string,
  signal?: AbortSignal,
): Promise<DashboardConfig> {
  const fetchInit: RequestInit = signal ? { signal } : {}
  const response = await fetch(dashboardPath(slug), fetchInit)
  if (!response.ok) {
    throw new Error(
      `Failed to load dashboard "${slug}" (HTTP ${String(response.status)})`,
    )
  }
  const raw: unknown = await response.json()
  return DashboardConfigSchema.parse(raw)
}

/**
 * Trigger a client-side download of the picked layout's raw JSON. Used by
 * SuccessView until SPIFFS injection (Phase 1b) lands — the user uploads
 * the file via Studio post-flash.
 */
export function downloadDashboardJson(layout: SelectedDashboardLayout): void {
  const body = JSON.stringify(layout.config, null, 2)
  const blob = new Blob([body], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = 'dashboard.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
