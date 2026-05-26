// src/lib/releases.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetReleaseCacheForTests,
  fetchLatestRelease,
  fetchRecentReleases,
  fetchReleaseByTag,
} from './releases'

const FIRMWARE_ASSET_NAME = 'canshift-firmware-v0.10.0-crowpanel_28-merged.bin'
const SPIFFS_ASSET_NAME = 'canshift-spiffs-v0.10.0-crowpanel_28.bin'
const FIRMWARE_URL = `https://example.test/${FIRMWARE_ASSET_NAME}`
const SPIFFS_URL = `https://example.test/${SPIFFS_ASSET_NAME}`

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
      browser_download_url: FIRMWARE_URL,
      size: 1_572_864,
    })
  }
  if (withSpiffs) {
    assets.push({
      name: SPIFFS_ASSET_NAME,
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
      url: FIRMWARE_URL,
      sizeBytes: 1_572_864,
      sha256Url: `${FIRMWARE_URL}.sha256`,
    })
    expect(release.spiffsAsset).toEqual({
      url: SPIFFS_URL,
      sizeBytes: 524_288,
      sha256Url: `${SPIFFS_URL}.sha256`,
    })
    // Always hits /releases, never /releases/latest — keeps the console clean
    // on prerelease-only repos.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall?.[0]).toMatch(/\/releases\?per_page=20$/)
  })

  it('prefers stable over prerelease when both exist', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        makeReleasePayload({ tag_name: 'v0.10.1', prerelease: true }),
        makeReleasePayload({ tag_name: 'v0.10.0', prerelease: false }),
      ]),
    )

    const release = await fetchLatestRelease()
    expect(release.tag).toBe('v0.10.0')
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
