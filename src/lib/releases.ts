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

/**
 * GitHub's release-asset CDN does not send CORS headers, so the flasher routes
 * every binary download through `/api/firmware-proxy?url=…` — a same-origin
 * endpoint that adds them server-side. See `api/firmware-proxy.ts`.
 */
const FIRMWARE_PROXY_BASE = '/api/firmware-proxy'

/**
 * Hosts that legitimately serve firmware metadata or binaries today.
 * Mirrors `api/firmware-proxy.ts` ALLOWED_HOSTS plus the legacy
 * `canshift.tmbk.ch` fallback for the sidecar `.sha256` manifest. Used as
 * defence-in-depth against:
 *  - SEC-002: a MITM'd / spoofed `api.github.com` returning attacker-controlled
 *    asset URLs that would otherwise flow into `acquirePayload`/`verifyPayload`.
 *  - SEC-001: a hostile `localStorage` cache entry (XSS, shared machine,
 *    malicious extension) pointing the flasher at attacker-hosted firmware
 *    plus a matching attacker digest.
 */
const ALLOWED_ASSET_HOSTS = new Set<string>([
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'canshift.tmbk.ch',
])

/**
 * Returns true when `url` is an https URL pointing at an allowlisted host, or
 * a `/api/firmware-proxy?url=…` same-origin proxy URL whose embedded `url`
 * query parameter also passes the same check.
 */
export const isAllowedAssetUrl = (url: string): boolean => {
  if (typeof url !== 'string' || url.length === 0) return false
  // Same-origin proxy URLs are stored relative (`/api/firmware-proxy?url=…`).
  // Validate them by extracting and recursing on the embedded target — the
  // same-origin protocol/host is not part of the trust decision.
  if (url.startsWith(`${FIRMWARE_PROXY_BASE}?`)) {
    try {
      const proxied = new URL(url, 'https://placeholder.invalid')
      const inner = proxied.searchParams.get('url')
      if (inner === null) return false
      return isAllowedAssetUrl(inner)
    } catch {
      return false
    }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  return ALLOWED_ASSET_HOSTS.has(parsed.hostname)
}

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
  /**
   * SHA-256 hex digest published by GitHub on the asset metadata (the `digest`
   * field, formatted as `sha256:HEX`). Preferred over fetching `sha256Url`
   * since it avoids a second request and works even when no `.sha256` sidecar
   * was published alongside the binary.
   */
  expectedSha256: string | null
  /** Legacy sidecar manifest URL — kept as a fallback for releases that
   *  predate GitHub's `digest` field. */
  sha256Url: string
}

export interface Release {
  version: string
  tag: string
  publishedAt: string
  notes: string
  prerelease: boolean
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

/** Update channel — drives default version selection. */
export type Channel = 'stable' | 'beta'

/**
 * Initial channel preference. `?prerelease=1` is a hard pin — the user asked
 * for beta and we don't auto-switch back to stable on them even if a stable
 * release ships later. Without the flag, the hook auto-picks whichever channel
 * has the newest release.
 */
export interface DefaultChannel {
  channel: Channel
  /** True when the URL flag forced the choice — disables the auto-switch. */
  forced: boolean
}

export const readDefaultChannel = (): DefaultChannel => {
  if (typeof window === 'undefined') return { channel: 'stable', forced: false }
  try {
    const prerelease = new URLSearchParams(window.location.search).get('prerelease') === '1'
    return prerelease ? { channel: 'beta', forced: true } : { channel: 'stable', forced: false }
  } catch {
    return { channel: 'stable', forced: false }
  }
}

interface GitHubAsset {
  name: string
  /**
   * GitHub API URL for the asset (e.g. `https://api.github.com/repos/.../releases/assets/123`).
   * Fetching this with `Accept: application/octet-stream` returns the binary
   * with proper CORS headers. The `browser_download_url` (github.com/.../download/...)
   * issues a 302 from github.com which lacks `Access-Control-Allow-Origin`,
   * so a browser `fetch()` is blocked.
   */
  url: string
  browser_download_url: string
  size: number
  /**
   * SHA-256 (or other) digest published by GitHub. Format: `"sha256:HEX"`.
   * May be absent on older releases or non-octet-stream assets.
   */
  digest?: string | null
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
  if (a.digest !== undefined && a.digest !== null && typeof a.digest !== 'string') return false
  if (
    typeof a.name !== 'string' ||
    typeof a.url !== 'string' ||
    typeof a.browser_download_url !== 'string' ||
    typeof a.size !== 'number' ||
    !Number.isFinite(a.size)
  ) {
    return false
  }
  // SEC-002: drop any asset whose GitHub-supplied URLs fall outside the
  // host allowlist. The `browser_download_url` feeds the legacy
  // `${url}.sha256` sidecar fetch, so it must be validated too.
  if (!isAllowedAssetUrl(a.url) || !isAllowedAssetUrl(a.browser_download_url)) {
    return false
  }
  return true
}

const DIGEST_RE = /^sha256:([0-9a-f]{64})$/i

const extractSha256 = (digest: string | null | undefined): string | null => {
  if (!digest) return null
  const match = DIGEST_RE.exec(digest)
  return match?.[1] ? match[1].toLowerCase() : null
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

const throughProxy = (url: string): string =>
  `${FIRMWARE_PROXY_BASE}?url=${encodeURIComponent(url)}`

function toReleaseAsset(asset: GitHubAsset, sha256Asset: GitHubAsset | null): ReleaseAsset {
  return {
    url: throughProxy(asset.url),
    sizeBytes: asset.size,
    expectedSha256: extractSha256(asset.digest),
    // Sidecar manifest URL kept for releases that predate GitHub's `digest`
    // field. New releases skip the fetch entirely.
    sha256Url: sha256Asset
      ? throughProxy(sha256Asset.url)
      : `${asset.browser_download_url}.sha256`,
  }
}

function findSha256Sibling(
  assets: readonly GitHubAsset[],
  target: GitHubAsset,
): GitHubAsset | null {
  return assets.find((a) => a.name === `${target.name}.sha256`) ?? null
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
    prerelease: raw.prerelease,
    firmwareAsset: firmware ? toReleaseAsset(firmware, findSha256Sibling(validAssets, firmware)) : null,
    spiffsAsset: spiffs ? toReleaseAsset(spiffs, findSha256Sibling(validAssets, spiffs)) : null,
    htmlUrl: raw.html_url,
  }
}

/**
 * Module-level cache for the recent-releases fetch — `useLatestRelease` and
 * `useReleaseChannel` both need this list, and React Strict Mode in dev
 * double-invokes effects, so without dedup we burn 4× the GitHub anon
 * rate-limit budget (60 req/h) on every page load. Cleared on failure so
 * the next caller can retry.
 */
let cachedRecentPromise: Promise<RecentRelease[]> | null = null
let cachedFullPromise: Promise<Release[]> | null = null

/**
 * `localStorage` persistence layer on top of the in-memory cache. Survives page
 * reloads so a rate-limited browser still has fresh-enough release data to
 * render the UI. Stale-while-revalidate: a cached entry is returned immediately
 * even past its TTL, and a background refresh updates the cache for next time.
 */
// `v5` invalidates any caches written before SEC-001/SEC-002 hardening —
// entries persisted under earlier keys were never validated against the
// asset-host allowlist, so we drop them unconditionally on first load.
const LS_CACHE_KEY = 'canshift-flasher.releases.v5'
/** 10 minutes — short enough that a release ships quickly, long enough to
 *  shield casual reloads from the 60 req/h anon rate limit. */
const LS_CACHE_TTL_MS = 10 * 60 * 1000

interface PersistedCache {
  fetchedAt: number
  releases: Release[]
}

/**
 * SEC-001: every persisted asset URL must still resolve to an allowlisted
 * host. A hostile cache entry (XSS, shared machine, malicious extension) is
 * dropped wholesale rather than partially trusted.
 */
const isCachedAssetSafe = (asset: ReleaseAsset | null): boolean => {
  if (asset === null) return true
  if (typeof asset !== 'object') return false
  if (typeof asset.url !== 'string' || !isAllowedAssetUrl(asset.url)) return false
  if (typeof asset.sha256Url !== 'string' || !isAllowedAssetUrl(asset.sha256Url)) return false
  return true
}

const readPersistedCache = (): PersistedCache | null => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.fetchedAt !== 'number' || !Array.isArray(obj.releases)) return null
    const releases = obj.releases as Release[]
    for (const release of releases) {
      if (!isCachedAssetSafe(release.firmwareAsset) || !isCachedAssetSafe(release.spiffsAsset)) {
        // Single bad entry poisons the whole cache — drop it and let the
        // next call refetch from the network.
        try {
          localStorage.removeItem(LS_CACHE_KEY)
        } catch {
          /* ignore quota / private-mode failures */
        }
        return null
      }
    }
    return { fetchedAt: obj.fetchedAt, releases }
  } catch {
    return null
  }
}

const writePersistedCache = (releases: Release[]): void => {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: PersistedCache = { fetchedAt: Date.now(), releases }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Quota / private-mode failures are non-fatal — in-memory cache still works.
  }
}

/** Clears module-level + persistent fetch caches. Used by tests to start clean. */
export const __resetReleaseCacheForTests = (): void => {
  cachedRecentPromise = null
  cachedFullPromise = null
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LS_CACHE_KEY)
    } catch {
      /* ignore */
    }
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
const fetchFromNetwork = async (): Promise<Release[]> => {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`
  const payload = await fetchJsonWithTimeout(url)
  if (!Array.isArray(payload)) {
    throw new Error('GitHub API: expected an array of releases')
  }
  const releases = payload.filter(isRelease).map(toRelease)
  writePersistedCache(releases)
  return releases
}

const fetchAllReleases = (): Promise<Release[]> => {
  if (cachedFullPromise) return cachedFullPromise

  const persisted = readPersistedCache()
  const isFresh = persisted !== null && Date.now() - persisted.fetchedAt < LS_CACHE_TTL_MS

  if (persisted && isFresh) {
    // Fresh hit: skip the network entirely.
    cachedFullPromise = Promise.resolve(persisted.releases)
    return cachedFullPromise
  }

  const networkPromise = (async (): Promise<Release[]> => {
    try {
      return await fetchFromNetwork()
    } catch (err) {
      // Stale-while-revalidate: if the API is unreachable but we have any
      // cached data (even past TTL), fall back to it instead of bubbling
      // the error — the UI was rendering it anyway.
      if (persisted) return persisted.releases
      cachedFullPromise = null
      throw err
    }
  })()
  cachedFullPromise = networkPromise
  return networkPromise
}

export const fetchLatestRelease = async (): Promise<Release> => {
  const releases = await fetchAllReleases()
  // GitHub returns releases newest-first. Picking releases[0] surfaces the
  // most recent artifact regardless of channel — IdleView's auto-channel
  // logic does the same so the two views stay consistent.
  const candidate = INCLUDE_PRERELEASE
    ? (releases.find((r) => r.prerelease) ?? releases[0])
    : releases[0]
  if (!candidate) {
    throw new Error('GitHub API: no releases available')
  }
  return candidate
}

/**
 * Fetches the N most-recent releases (default 10) for the version-override
 * dropdown in the Advanced (recovery) panel.
 *
 * Best-effort by design: malformed entries are silently skipped so a single
 * bad release row doesn't blank out the whole picker. Network / HTTP failures
 * still throw — the UI handles them by falling back to the typed-text input.
 */
const toRecentRelease = (release: Release): RecentRelease => ({
  tag: release.tag,
  publishedAt: release.publishedAt,
  prerelease: release.prerelease,
})

/**
 * Filters the cached release list by channel — `stable` excludes pre-releases,
 * `beta` keeps only pre-releases. Drives the IdleView channel/version picker.
 */
export const fetchReleasesByChannel = async (
  channel: Channel,
  limit = 10,
): Promise<RecentRelease[]> => {
  const all = await fetchAllReleases()
  const filtered = all
    .filter((r) => (channel === 'beta' ? r.prerelease : !r.prerelease))
    .map(toRecentRelease)
  return filtered.slice(0, limit)
}

export const fetchRecentReleases = async (limit = 10): Promise<RecentRelease[]> => {
  if (!cachedRecentPromise) {
    cachedRecentPromise = (async (): Promise<RecentRelease[]> => {
      try {
        const releases = await fetchAllReleases()
        return releases.map(toRecentRelease)
      } catch (err) {
        cachedRecentPromise = null
        throw err
      }
    })()
  }
  const cached = await cachedRecentPromise
  return cached.slice(0, limit)
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
