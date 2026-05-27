// tests/e2e/profile-picker.spec.ts
import { expect, test } from '@playwright/test'

const stubGitHubReleases = async (
  page: import('@playwright/test').Page,
): Promise<void> => {
  await page.route('**/api.github.com/repos/**/releases**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          tag_name: 'v9.9.9',
          prerelease: false,
          published_at: '2026-01-01T00:00:00Z',
          body: 'Stubbed test release.',
          html_url: 'https://example.test/release',
          assets: [],
        },
      ]),
    })
  })
}

test.describe('ECU profile picker', () => {
  test('picks MaxxECU and surfaces both download CTAs on SuccessView', async ({ page }) => {
    await stubGitHubReleases(page)
    await page.goto('/?sim=success')

    // Sim mode auto-picks `blank` for the ECU picker and the first non-blank
    // entry (`track-day`) for the dashboard picker, so IdleView immediately
    // promotes to ready (via useAutoConnect). The auto-pick fetches race the
    // promotion — assume neither has resolved by the time the user clicks
    // Flash, so the first SuccessView shows no download CTAs. The interesting
    // assertions happen after Flash again → manual pick.

    await expect(
      page.getByRole('img', { name: 'ESP32 connected, ready to flash' }),
    ).toBeVisible()

    await page.getByRole('button', { name: /^Flash / }).click()
    await expect(
      page.getByRole('heading', { name: /Flashed/ }),
    ).toBeVisible({ timeout: 8_000 })

    await page.getByRole('button', { name: 'Flash again' }).click()

    // We are back on IdleView — both pickers visible.
    const ecuPicker = page.getByLabel(/ECU profile/i)
    const dashboardPicker = page.getByLabel(/Dashboard layout/i)
    await expect(ecuPicker).toBeVisible()
    await expect(dashboardPicker).toBeVisible()

    // Both pickers must have a value before Connect enables. The sim auto-pick
    // already populated both on first mount and `reset()` preserves both, so
    // Connect is already enabled — clearing the dashboard re-disables it.
    const connect = page.getByRole('button', { name: 'Connect' })
    await expect(connect).toBeEnabled()
    await dashboardPicker.selectOption('')
    await expect(connect).toBeDisabled()
    await dashboardPicker.selectOption('track-day')
    await expect(connect).toBeEnabled()

    // Now pick a real ECU profile so the second success offers BOTH downloads.
    await expect(
      page.getByRole('option', { name: /MaxxECU MTune/ }),
    ).toBeAttached()
    await ecuPicker.selectOption('maxxecu')

    await expect(connect).toBeEnabled()
    await connect.click()

    await expect(
      page.getByRole('img', { name: 'ESP32 connected, ready to flash' }),
    ).toBeVisible()

    await page.getByRole('button', { name: /^Flash / }).click()

    await expect(
      page.getByRole('heading', { name: /Flashed/ }),
    ).toBeVisible({ timeout: 8_000 })

    // Both download CTAs reference the picked names.
    await expect(
      page.getByRole('button', {
        name: /Download signals\.json for MaxxECU MTune/,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: /Download dashboard\.json for Track Day/,
      }),
    ).toBeVisible()

    // The post-flash instruction mentions both Studio targets.
    await expect(page.getByText(/\/config\/signals\.json/)).toBeVisible()
    await expect(page.getByText(/\/config\/dashboard\.json/)).toBeVisible()
  })

  test('Connect stays disabled until both pickers have a value', async ({ page }) => {
    await stubGitHubReleases(page)
    await page.goto('/?sim=success')

    // The sim auto-picks fire on first mount; we want to assert the
    // pre-pick state, so reach the idle-after-reset path where the
    // pickers are interactive and useAutoConnect is dormant.
    await expect(
      page.getByRole('img', { name: 'ESP32 connected, ready to flash' }),
    ).toBeVisible()
    await page.getByRole('button', { name: /^Flash / }).click()
    await expect(
      page.getByRole('heading', { name: /Flashed/ }),
    ).toBeVisible({ timeout: 8_000 })
    await page.getByRole('button', { name: 'Flash again' }).click()

    const ecuPicker = page.getByLabel(/ECU profile/i)
    const dashboardPicker = page.getByLabel(/Dashboard layout/i)
    const connect = page.getByRole('button', { name: 'Connect' })

    // Clear both — Connect must disable.
    await ecuPicker.selectOption('')
    await dashboardPicker.selectOption('')
    await expect(connect).toBeDisabled()

    // Only ECU picked: still disabled.
    await ecuPicker.selectOption('blank')
    await expect(connect).toBeDisabled()

    // Both picked: enabled.
    await dashboardPicker.selectOption('blank')
    await expect(connect).toBeEnabled()
  })
})
