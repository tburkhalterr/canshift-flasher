// src/lib/releases.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchLatestRelease, fetchReleaseByTag } from './releases'

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

function makeReleasePayload(overrides: ReleasePayloadOverrides = {}): unknown {
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

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : status === 500 ? 'Server Error' : 'OK',
    json: () => Promise.resolve(payload),
  } as unknown as Response
}

describe('fetchLatestRelease', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses a well-formed /releases/latest response and maps firmware + SPIFFS assets', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeReleasePayload()))

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
    // First call must hit /releases/latest, not the list endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall?.[0]).toMatch(/\/releases\/latest$/)
  })

  it('falls back to /releases when /releases/latest returns 404', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404))
    fetchMock.mockResolvedValueOnce(
      jsonResponse([makeReleasePayload({ tag_name: 'v0.9.5' }), makeReleasePayload()]),
    )

    const release = await fetchLatestRelease()

    expect(release.tag).toBe('v0.9.5')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondCall = fetchMock.mock.calls[1]
    expect(secondCall?.[0]).toMatch(/\/releases\?per_page=20$/)
  })

  it('throws when /releases/latest returns 200 with a malformed payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }))

    await expect(fetchLatestRelease()).rejects.toThrow(/malformed/i)
  })

  it('bubbles up non-404 HTTP errors without falling back', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))

    await expect(fetchLatestRelease()).rejects.toThrow(/HTTP 500/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('omits firmware/SPIFFS when the release has no matching assets', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(makeReleasePayload({ withFirmware: false, withSpiffs: false })),
    )

    const release = await fetchLatestRelease()
    expect(release.firmwareAsset).toBeNull()
    expect(release.spiffsAsset).toBeNull()
  })

  it('renders an empty notes string when body is null', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(makeReleasePayload({ body: null })))

    const release = await fetchLatestRelease()
    expect(release.notes).toBe('')
  })
})

describe('fetchReleaseByTag', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
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
