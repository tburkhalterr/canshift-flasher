// src/lib/releases.ts
//
// Pulls the latest published firmware release from the canonical GitHub
// repository (`tburkhalterr/CANShift`) so the flasher UI can show the user
// what they're about to install before they install it.
//
// Architecture note: `canshift-studio` mirrors the same calls through its
// Electron main process to dodge CORS. The flasher is plain-browser code, but
// `api.github.com` already sets `Access-Control-Allow-Origin: *` on its REST
// endpoints, so a direct `fetch()` works without a proxy.

import { GITHUB_REPO } from '../constants'

/** Firmware merged image — must be flashed at offset 0x0. */
const FIRMWARE_ASSET_RE = /canshift-firmware-.*-crowpanel_28-merged\.bin$/
/** Optional SPIFFS image — flashed at SPIFFS_FLASH_OFFSET when present. */
const SPIFFS_ASSET_RE = /canshift-spiffs-.*-crowpanel_28\.bin$/

/** Total budget for the entire fetch — bounds user-visible idle latency. */
const FETCH_TIMEOUT_MS = 8_000

/**
 * `?prerelease=1` opts the flasher into the latest pre-release path instead
 * of `/releases/latest`. Read once at module load — runtime mutation would
 * not be picked up by `fetchLatestRelease` callers anyway.
 */
const INCLUDE_PRERELEASE = readPrereleaseFlag()

function readPrereleaseFlag(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('prerelease') === '1'
  } catch {
    return false
  }
}

export interface ReleaseAsset {
  url: string
  sizeBytes: number
  sha256Url: string
}

export interface Release {
  version: string
  tag: string
  publishedAt: string
  notes: string
  firmwareAsset: ReleaseAsset | null
  spiffsAsset: ReleaseAsset | null
  htmlUrl: string
}

/**
 * Trimmed release metadata used by the Advanced (recovery) panel's version
 * override dropdown — just enough to render the option label and feed
 * `versionOverride` back to `useFlasher`.
 */
export interface RecentRelease {
  tag: string
  publishedAt: string
  prerelease: boolean
}

interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GitHubRelease {
  tag_name: string
  prerelease: boolean
  published_at: string
  body: string | null
  html_url: string
  assets: GitHubAsset[]
}

function isAsset(v: unknown): v is GitHubAsset {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  return (
    typeof a.name === 'string' &&
    typeof a.browser_download_url === 'string' &&
    typeof a.size === 'number' &&
    Number.isFinite(a.size)
  )
}

function isRelease(v: unknown): v is GitHubRelease {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (typeof r.tag_name !== 'string') return false
  if (typeof r.prerelease !== 'boolean') return false
  if (typeof r.published_at !== 'string') return false
  if (r.body !== null && typeof r.body !== 'string') return false
  if (typeof r.html_url !== 'string') return false
  if (!Array.isArray(r.assets)) return false
  return true
}

function toReleaseAsset(asset: GitHubAsset): ReleaseAsset {
  return {
    url: asset.browser_download_url,
    sizeBytes: asset.size,
    sha256Url: `${asset.browser_download_url}.sha256`,
  }
}

function toRelease(raw: GitHubRelease): Release {
  const validAssets = raw.assets.filter(isAsset)
  const firmware = validAssets.find((a) => FIRMWARE_ASSET_RE.test(a.name)) ?? null
  const spiffs = validAssets.find((a) => SPIFFS_ASSET_RE.test(a.name)) ?? null
  return {
    version: raw.tag_name.replace(/^v/, ''),
    tag: raw.tag_name,
    publishedAt: raw.published_at,
    notes: raw.body ?? '',
    firmwareAsset: firmware ? toReleaseAsset(firmware) : null,
    spiffsAsset: spiffs ? toReleaseAsset(spiffs) : null,
    htmlUrl: raw.html_url,
  }
}

const fetchJsonWithTimeout = async (url: string): Promise<unknown> => {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`GitHub API returned HTTP ${String(response.status)}`)
    }
    return (await response.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetches the latest release metadata from GitHub.
 *
 * We always call `/releases?per_page=20` (never `/releases/latest`). The
 * `/latest` endpoint is stable-only and returns 404 on prerelease-only
 * repos — which would pollute the user's browser console with an expected
 * 404 on every page load. Picking the right candidate from a 20-item list
 * is cheap. Default flow prefers stable; `?prerelease=1` prefers prereleases.
 */
export const fetchLatestRelease = async (): Promise<Release> => {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`
  const payload = await fetchJsonWithTimeout(url)
  if (!Array.isArray(payload)) {
    throw new Error('GitHub API: expected an array of releases')
  }
  const releases = payload.filter(isRelease)
  const candidate = INCLUDE_PRERELEASE
    ? (releases.find((r) => r.prerelease) ?? releases[0])
    : (releases.find((r) => !r.prerelease) ?? releases[0])
  if (!candidate) {
    throw new Error('GitHub API: no releases available')
  }
  return toRelease(candidate)
}

function isRecentReleaseRaw(
  v: unknown,
): v is { tag_name: string; published_at: string; prerelease: boolean } {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.tag_name === 'string' &&
    typeof r.published_at === 'string' &&
    typeof r.prerelease === 'boolean'
  )
}

/**
 * Fetches the N most-recent releases (default 10) for the version-override
 * dropdown in the Advanced (recovery) panel.
 *
 * Best-effort by design: malformed entries are silently skipped so a single
 * bad release row doesn't blank out the whole picker. Network / HTTP failures
 * still throw — the UI handles them by falling back to the typed-text input.
 */
export const fetchRecentReleases = async (limit = 10): Promise<RecentRelease[]> => {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${String(limit)}`
  const payload = await fetchJsonWithTimeout(url)
  if (!Array.isArray(payload)) {
    throw new Error('GitHub API: expected an array of releases')
  }
  const mapped: RecentRelease[] = []
  for (const entry of payload) {
    if (!isRecentReleaseRaw(entry)) continue
    mapped.push({
      tag: entry.tag_name,
      publishedAt: entry.published_at,
      prerelease: entry.prerelease,
    })
  }
  // GitHub already returns newest-first, but tolerate API drift.
  mapped.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  return mapped.slice(0, limit)
}

/**
 * Fetches a specific release by Git tag (e.g. `v0.9.1`).
 *
 * Used by the Advanced (recovery) panel's "Version override" input — power
 * users only. A 404 is surfaced as a friendly error so the UI can render it
 * verbatim without leaking the GitHub API response shape.
 */
export async function fetchReleaseByTag(tag: string): Promise<Release> {
  const trimmed = tag.trim()
  if (trimmed.length === 0) {
    throw new Error('Version override is empty')
  }
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(trimmed)}`
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: controller.signal,
    })
    if (response.status === 404) {
      throw new Error(`No release found for tag "${trimmed}". Check the tag spelling (e.g. v0.10.0).`)
    }
    if (!response.ok) {
      throw new Error(`GitHub API returned HTTP ${String(response.status)} for tag "${trimmed}"`)
    }
    const payload = (await response.json()) as unknown
    if (!isRelease(payload)) {
      throw new Error(`GitHub API: release payload for tag "${trimmed}" was malformed`)
    }
    return toRelease(payload)
  } finally {
    clearTimeout(timer)
  }
}
