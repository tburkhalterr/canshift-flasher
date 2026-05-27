// tests/e2e/channel-switch.spec.ts
//
// E2E coverage for the auto-pick logic in `useReleaseChannel` (#151 / TST-12).
// The hook compares the heads of stable + beta on first load and flips to
// whichever ships a newer release. `?prerelease=1` pins beta hard; a manual
// click locks the channel against any later auto-flip.
//
// Discovery: `useReleaseChannel` does NOT persist `userPicked` to
// localStorage. The manual-lock scenario therefore exercises the in-session
// guarantee (effect re-runs after the click must not override the choice).
// A hard reload would reset `userPicked` to false — out of scope for #151.
import { expect, test, type Page, type Route } from '@playwright/test'

const OLDER_DATE = '2026-05-01T00:00:00Z'
const NEWER_DATE = '2026-05-15T00:00:00Z'

interface ReleaseStub {
  tag_name: string
  prerelease: boolean
  published_at: string
}

const buildReleasePayload = (release: ReleaseStub): Record<string, unknown> => ({
  tag_name: release.tag_name,
  prerelease: release.prerelease,
  published_at: release.published_at,
  body: 'Stubbed test release.',
  html_url: `https://example.test/${release.tag_name}`,
  assets: [],
})

/**
 * Stub `api.github.com/.../releases?per_page=20` with a deterministic list.
 * GitHub returns releases newest-first; we order the stub the same way so
 * `fetchAllReleases` sees what it would see in production.
 */
const stubReleases = async (
  page: Page,
  releases: readonly ReleaseStub[],
): Promise<void> => {
  await page.route('**/api.github.com/repos/**/releases**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(releases.map(buildReleasePayload)),
    })
  })
}

const STABLE_NEWER: readonly ReleaseStub[] = [
  { tag_name: 'v1.2.0', prerelease: false, published_at: NEWER_DATE },
  { tag_name: 'v1.1.0-beta.1', prerelease: true, published_at: OLDER_DATE },
]

const BETA_NEWER: readonly ReleaseStub[] = [
  { tag_name: 'v1.2.0-beta.1', prerelease: true, published_at: NEWER_DATE },
  { tag_name: 'v1.1.0', prerelease: false, published_at: OLDER_DATE },
]

const channelSelect = (page: Page) => page.getByLabel('Release channel')

test.describe('release channel auto-pick (#151)', () => {
  test('newer beta auto-picks Beta on first load', async ({ page }) => {
    await stubReleases(page, BETA_NEWER)
    await page.goto('/')

    // Picker must paint before we assert the channel value — the auto-flip
    // happens after the first fetch resolves, so wait for the select to
    // settle out of its loading state.
    await expect(channelSelect(page)).toBeVisible()
    await expect(channelSelect(page)).toBeEnabled()
    await expect(channelSelect(page)).toHaveValue('beta')
  })

  test('newer stable does NOT flip', async ({ page }) => {
    await stubReleases(page, STABLE_NEWER)
    await page.goto('/')

    await expect(channelSelect(page)).toBeVisible()
    await expect(channelSelect(page)).toBeEnabled()
    await expect(channelSelect(page)).toHaveValue('stable')
  })

  test('?prerelease=1 pins Beta even when stable is newer', async ({ page }) => {
    await stubReleases(page, STABLE_NEWER)
    await page.goto('/?prerelease=1')

    await expect(channelSelect(page)).toBeVisible()
    await expect(channelSelect(page)).toBeEnabled()
    await expect(channelSelect(page)).toHaveValue('beta')

    // Guard against a late flip: re-check after the picker has had time to
    // run a second effect cycle. The URL flag sets `userPicked=true`, so
    // the auto-flip code path is skipped entirely on subsequent renders.
    await page.waitForTimeout(250)
    await expect(channelSelect(page)).toHaveValue('beta')
  })

  test('manual switch locks against auto-flip', async ({ page }) => {
    // Stable is newest in the stub — without a manual click, the picker
    // would stay on Stable. We click Beta and assert the choice survives
    // the post-click effect re-run (which would otherwise re-evaluate
    // auto-flip against the same stub).
    await stubReleases(page, STABLE_NEWER)
    await page.goto('/')

    await expect(channelSelect(page)).toBeVisible()
    await expect(channelSelect(page)).toBeEnabled()
    await expect(channelSelect(page)).toHaveValue('stable')

    await channelSelect(page).selectOption('beta')
    await expect(channelSelect(page)).toHaveValue('beta')

    // The effect re-fires whenever `state.channel` changes; allow it a
    // moment to settle so a regression that re-evaluated auto-flip would
    // have time to revert the user's choice.
    await page.waitForTimeout(250)
    await expect(channelSelect(page)).toHaveValue('beta')
  })
})
