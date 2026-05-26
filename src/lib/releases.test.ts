// src/lib/releases.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetReleaseCacheForTests,
  fetchLatestRelease,
  fetchRecentReleases,
  fetchReleaseByTag,
  isAllowedAssetUrl,
  type Release,
} from './releases'

const LS_CACHE_KEY = 'canshift-flasher.releases.v5'

const FIRMWARE_ASSET_NAME = 'canshift-firmware-v0.10.0-crowpanel_28-merged.bin'
const SPIFFS_ASSET_NAME = 'canshift-spiffs-v0.10.0-crowpanel_28.bin'
// `browser_download_url` is the user-facing CDN URL — production traffic
// resolves to `objects.githubusercontent.com` after the 302 from github.com,
// which is on the asset-host allowlist (see `ALLOWED_ASSET_HOSTS`).
const FIRMWARE_URL = `https://objects.githubusercontent.com/github-production-release-asset/${FIRMWARE_ASSET_NAME}`
const FIRMWARE_API_URL = 'https://api.github.com/repos/x/y/releases/assets/1'
const FIRMWARE_SHA_API_URL = 'https://api.github.com/repos/x/y/releases/assets/2'
const SPIFFS_URL = `https://objects.githubusercontent.com/github-production-release-asset/${SPIFFS_ASSET_NAME}`
const SPIFFS_API_URL = 'https://api.github.com/repos/x/y/releases/assets/3'

interface ReleasePayloadOverrides {
  tag_name?: string
  prerelease?: boolean
  body?: string | null
  withFirmware?: boolean
  withSpiffs?: boolean
}

const makeReleasePayload = (overrides: ReleasePayloadOverrides = {}): unknown => {
  const {
    tag_name = 'v0.10.0',
    prerelease = false,
    body = 'Release notes here.',
    withFirmware = true,
    withSpiffs = true,
  } = overrides
  const assets: unknown[] = []
  if (withFirmware) {
    assets.push({
      name: FIRMWARE_ASSET_NAME,
      url: FIRMWARE_API_URL,
      browser_download_url: FIRMWARE_URL,
      size: 1_572_864,
    })
    assets.push({
      name: `${FIRMWARE_ASSET_NAME}.sha256`,
      url: FIRMWARE_SHA_API_URL,
      browser_download_url: `${FIRMWARE_URL}.sha256`,
      size: 65,
    })
  }
  if (withSpiffs) {
    assets.push({
      name: SPIFFS_ASSET_NAME,
      url: SPIFFS_API_URL,
      browser_download_url: SPIFFS_URL,
      size: 524_288,
    })
  }
  return {
    tag_name,
    prerelease,
    published_at: '2026-04-01T12:00:00Z',
    body,
    html_url: `https://github.com/tburkhalterr/CANShift/releases/tag/${tag_name}`,
    assets,
  }
}

const jsonResponse = (payload: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : status === 500 ? 'Server Error' : 'OK',
    json: () => Promise.resolve(payload),
  }) as unknown as Response

describe('fetchLatestRelease', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    __resetReleaseCacheForTests()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses /releases and maps firmware + SPIFFS assets from the first stable entry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([makeReleasePayload()]))

    const release = await fetchLatestRelease()

    expect(release.version).toBe('0.10.0')
    expect(release.tag).toBe('v0.10.0')
    expect(release.publishedAt).toBe('2026-04-01T12:00:00Z')
    expect(release.notes).toBe('Release notes here.')
    expect(release.firmwareAsset).toEqual({
      url: `/api/firmware-proxy?url=${encodeURIComponent(FIRMWARE_API_URL)}`,
      sizeBytes: 1_572_864,
      expectedSha256: null, // fixture omits `digest` — exercised in another test
      sha256Url: `/api/firmware-proxy?url=${encodeURIComponent(FIRMWARE_SHA_API_URL)}`,
    })
    expect(release.spiffsAsset).toEqual({
      // No `.sha256` sibling asset for SPIFFS in this fixture — falls back to
      // the legacy `${browser_download_url}.sha256` convention (not proxied —
      // canshift.tmbk.ch serves it directly with CORS).
      url: `/api/firmware-proxy?url=${encodeURIComponent(SPIFFS_API_URL)}`,
      sizeBytes: 524_288,
      expectedSha256: null,
      sha256Url: `${SPIFFS_URL}.sha256`,
    })
    // Always hits /releases, never /releases/latest — keeps the console clean
    // on prerelease-only repos.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall?.[0]).toMatch(/\/releases\?per_page=20$/)
  })

  it('returns the newest release regardless of channel', async () => {
    // GitHub returns newest-first; surfacing the head matches the IdleView
    // auto-channel logic so the standalone "Latest" view stays consistent
    // with whatever channel the picker auto-selects.
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        makeReleasePayload({ tag_name: 'v0.10.1', prerelease: true }),
        makeReleasePayload({ tag_name: 'v0.10.0', prerelease: false }),
      ]),
    )

    const release = await fetchLatestRelease()
    expect(release.tag).toBe('v0.10.1')
  })

  it('falls back to the first item when no stable release exists', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        makeReleasePayload({ tag_name: 'v0.10.0', prerelease: true }),
        makeReleasePayload({ tag_name: 'v0.9.5', prerelease: true }),
      ]),
    )

    const release = await fetchLatestRelease()
    expect(release.tag).toBe('v0.10.0')
  })

  it('throws when /releases returns 200 with a non-array payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }))

    await expect(fetchLatestRelease()).rejects.toThrow(/expected an array/i)
  })

  it('throws on non-2xx HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))

    await expect(fetchLatestRelease()).rejects.toThrow(/HTTP 500/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws when the array is empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]))

    await expect(fetchLatestRelease()).rejects.toThrow(/no releases available/i)
  })

  it('omits firmware/SPIFFS when the release has no matching assets', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([makeReleasePayload({ withFirmware: false, withSpiffs: false })]),
    )

    const release = await fetchLatestRelease()
    expect(release.firmwareAsset).toBeNull()
    expect(release.spiffsAsset).toBeNull()
  })

  it('renders an empty notes string when body is null', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([makeReleasePayload({ body: null })]))

    const release = await fetchLatestRelease()
    expect(release.notes).toBe('')
  })
})

describe('fetchReleaseByTag', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    __resetReleaseCacheForTests()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the parsed release for an existing tag', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeReleasePayload({ tag_name: 'v0.9.1' })))

    const release = await fetchReleaseByTag('v0.9.1')
    expect(release.tag).toBe('v0.9.1')
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toMatch(/\/releases\/tags\/v0\.9\.1$/)
  })

  it('throws a friendly error mentioning the tag on 404', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404))

    await expect(fetchReleaseByTag('v9.9.9')).rejects.toThrow(/v9\.9\.9/)
  })

  it('rejects an empty tag without calling fetch', async () => {
    await expect(fetchReleaseByTag('   ')).rejects.toThrow(/empty/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on non-404 HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))

    await expect(fetchReleaseByTag('v0.9.1')).rejects.toThrow(/HTTP 500/)
  })

  it('throws on malformed payloads with the tag mentioned', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }))

    await expect(fetchReleaseByTag('v0.9.1')).rejects.toThrow(/v0\.9\.1/)
  })
})

describe('fetchRecentReleases', () => {
  const fetchMock = vi.fn<typeof fetch>()

  const makeRecentRaw = (
    tag: string,
    publishedAt: string,
    prerelease = false,
  ): Record<string, unknown> => ({
    tag_name: tag,
    published_at: publishedAt,
    prerelease,
    body: null,
    html_url: `https://github.com/tburkhalterr/CANShift/releases/tag/${tag}`,
    assets: [],
  })

  beforeEach(() => {
    fetchMock.mockReset()
    __resetReleaseCacheForTests()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns mapped entries with tag, publishedAt and prerelease', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        makeRecentRaw('v0.10.0', '2026-04-01T12:00:00Z'),
        makeRecentRaw('v0.9.1', '2026-03-15T09:00:00Z', true),
        makeRecentRaw('v0.9.0', '2026-02-01T08:00:00Z'),
      ]),
    )

    const releases = await fetchRecentReleases()

    expect(releases).toHaveLength(3)
    expect(releases[0]).toEqual({
      tag: 'v0.10.0',
      publishedAt: '2026-04-01T12:00:00Z',
      prerelease: false,
    })
    expect(releases[1]).toEqual({
      tag: 'v0.9.1',
      publishedAt: '2026-03-15T09:00:00Z',
      prerelease: true,
    })
    expect(releases[2]?.tag).toBe('v0.9.0')
  })

  it('throws on HTTP 500 instead of returning an empty array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))

    await expect(fetchRecentReleases()).rejects.toThrow(/HTTP 500/)
  })

  it('silently skips malformed entries and keeps the valid ones', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        makeRecentRaw('v0.10.0', '2026-04-01T12:00:00Z'),
        { tag_name: 'v0.9.1' }, // missing published_at + prerelease
        null,
        'not-a-release',
        makeRecentRaw('v0.9.0', '2026-02-01T08:00:00Z'),
      ]),
    )

    const releases = await fetchRecentReleases()

    expect(releases).toHaveLength(2)
    expect(releases.map((r) => r.tag)).toEqual(['v0.10.0', 'v0.9.0'])
  })

  it('trims the result to the requested limit', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        makeRecentRaw('v0.10.0', '2026-04-01T12:00:00Z'),
        makeRecentRaw('v0.9.1', '2026-03-15T09:00:00Z'),
        makeRecentRaw('v0.9.0', '2026-02-01T08:00:00Z'),
      ]),
    )

    const releases = await fetchRecentReleases(2)

    expect(releases).toHaveLength(2)
    expect(releases.map((r) => r.tag)).toEqual(['v0.10.0', 'v0.9.1'])
  })

  it('throws when the payload is not an array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }))

    await expect(fetchRecentReleases()).rejects.toThrow(/expected an array/i)
  })
})

describe('isAllowedAssetUrl', () => {
  it('accepts every host on the production allowlist', () => {
    expect(isAllowedAssetUrl('https://api.github.com/repos/x/y/releases/assets/1')).toBe(true)
    expect(isAllowedAssetUrl('https://objects.githubusercontent.com/foo.bin')).toBe(true)
    expect(isAllowedAssetUrl('https://release-assets.githubusercontent.com/foo.bin')).toBe(true)
    expect(isAllowedAssetUrl('https://canshift.tmbk.ch/firmware.bin.sha256')).toBe(true)
  })

  it('accepts a firmware-proxy URL whose embedded target is allowlisted', () => {
    const inner = 'https://api.github.com/repos/x/y/releases/assets/1'
    expect(isAllowedAssetUrl(`/api/firmware-proxy?url=${encodeURIComponent(inner)}`)).toBe(true)
  })

  it('rejects a firmware-proxy URL whose embedded target is hostile', () => {
    const inner = 'https://evil.example/firmware.bin'
    expect(isAllowedAssetUrl(`/api/firmware-proxy?url=${encodeURIComponent(inner)}`)).toBe(false)
  })

  it('rejects http URLs even on allowlisted hosts', () => {
    expect(isAllowedAssetUrl('http://api.github.com/repos/x/y/releases/assets/1')).toBe(false)
  })

  it('rejects hosts that are not on the allowlist', () => {
    expect(isAllowedAssetUrl('https://evil.example/firmware.bin')).toBe(false)
    expect(isAllowedAssetUrl('https://example.test/firmware.bin')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isAllowedAssetUrl('not-a-url')).toBe(false)
    expect(isAllowedAssetUrl('')).toBe(false)
  })

  it('rejects a firmware-proxy URL with no `url` query parameter', () => {
    expect(isAllowedAssetUrl('/api/firmware-proxy')).toBe(false)
    expect(isAllowedAssetUrl('/api/firmware-proxy?foo=bar')).toBe(false)
  })
})

describe('localStorage cache hardening (SEC-001)', () => {
  const fetchMock = vi.fn<typeof fetch>()

  const makeCachedRelease = (firmwareUrl: string, sha256Url: string): Release => ({
    version: '0.10.0',
    tag: 'v0.10.0',
    publishedAt: '2026-04-01T12:00:00Z',
    notes: '',
    prerelease: false,
    firmwareAsset: {
      url: firmwareUrl,
      sizeBytes: 1_572_864,
      expectedSha256: 'a'.repeat(64),
      sha256Url,
    },
    spiffsAsset: null,
    htmlUrl: 'https://github.com/x/y/releases/tag/v0.10.0',
  })

  beforeEach(() => {
    fetchMock.mockReset()
    __resetReleaseCacheForTests()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('drops a cache entry whose firmwareAsset.url falls outside the allowlist', async () => {
    const hostileProxyUrl = `/api/firmware-proxy?url=${encodeURIComponent('https://evil.example/firmware.bin')}`
    const cached = makeCachedRelease(
      hostileProxyUrl,
      `/api/firmware-proxy?url=${encodeURIComponent('https://api.github.com/repos/x/y/releases/assets/2')}`,
    )
    localStorage.setItem(
      LS_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), releases: [cached] }),
    )

    // Cache must be discarded → the fetch falls through to the network.
    fetchMock.mockResolvedValueOnce(jsonResponse([makeReleasePayload()]))
    const release = await fetchLatestRelease()
    expect(release.firmwareAsset?.url).toContain(encodeURIComponent(FIRMWARE_API_URL))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(LS_CACHE_KEY)).not.toBeNull()
  })

  it('drops a cache entry whose firmwareAsset.sha256Url falls outside the allowlist', async () => {
    const cached = makeCachedRelease(
      `/api/firmware-proxy?url=${encodeURIComponent('https://api.github.com/repos/x/y/releases/assets/1')}`,
      'https://evil.example/firmware.bin.sha256',
    )
    localStorage.setItem(
      LS_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), releases: [cached] }),
    )

    fetchMock.mockResolvedValueOnce(jsonResponse([makeReleasePayload()]))
    await fetchLatestRelease()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps a cache entry whose URLs are all on the allowlist', async () => {
    const safeUrl = `/api/firmware-proxy?url=${encodeURIComponent('https://api.github.com/repos/x/y/releases/assets/1')}`
    const safeShaUrl = `/api/firmware-proxy?url=${encodeURIComponent('https://api.github.com/repos/x/y/releases/assets/2')}`
    const cached = makeCachedRelease(safeUrl, safeShaUrl)
    localStorage.setItem(
      LS_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), releases: [cached] }),
    )

    // Fresh cache hit → no network call.
    const release = await fetchLatestRelease()
    expect(release.firmwareAsset?.url).toBe(safeUrl)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('asset URL allowlist (SEC-002)', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    __resetReleaseCacheForTests()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('filters out assets whose GitHub-supplied url is off the allowlist', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          tag_name: 'v0.10.0',
          prerelease: false,
          published_at: '2026-04-01T12:00:00Z',
          body: null,
          html_url: 'https://github.com/x/y/releases/tag/v0.10.0',
          assets: [
            {
              name: FIRMWARE_ASSET_NAME,
              url: 'https://evil.example/forged-asset-url',
              browser_download_url: FIRMWARE_URL,
              size: 1_572_864,
            },
          ],
        },
      ]),
    )

    const release = await fetchLatestRelease()
    expect(release.firmwareAsset).toBeNull()
  })

  it('filters out assets whose browser_download_url is off the allowlist', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          tag_name: 'v0.10.0',
          prerelease: false,
          published_at: '2026-04-01T12:00:00Z',
          body: null,
          html_url: 'https://github.com/x/y/releases/tag/v0.10.0',
          assets: [
            {
              name: FIRMWARE_ASSET_NAME,
              url: FIRMWARE_API_URL,
              browser_download_url: 'https://evil.example/forged.bin',
              size: 1_572_864,
            },
          ],
        },
      ]),
    )

    const release = await fetchLatestRelease()
    expect(release.firmwareAsset).toBeNull()
  })
})
