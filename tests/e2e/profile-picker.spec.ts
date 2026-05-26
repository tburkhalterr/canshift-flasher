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
  test('picks MaxxECU and surfaces the download CTA on SuccessView', async ({ page }) => {
    await stubGitHubReleases(page)
    await page.goto('/?sim=success')

    // Sim mode auto-picks `blank` so IdleView immediately promotes to ready
    // (via useAutoConnect). Run one flash to get to SuccessView, then click
    // "Flash again" to land back in idle — useAutoConnect is mount-only and
    // doesn't re-promote on reset, so the picker is interactive there.

    await expect(
      page.getByRole('img', { name: 'ESP32 connected, ready to flash' }),
    ).toBeVisible()

    await page.getByRole('button', { name: /^Flash / }).click()
    await expect(
      page.getByRole('heading', { name: /Flashed/ }),
    ).toBeVisible({ timeout: 8_000 })

    // First success uses the auto-picked `blank` profile so no download CTA.
    await expect(
      page.getByRole('button', { name: /Download signals\.json/ }),
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Flash again' }).click()

    // We are back on IdleView — the picker is visible.
    const picker = page.getByLabel(/ECU profile/i)
    await expect(picker).toBeVisible()
    await expect(
      page.getByRole('option', { name: /MaxxECU MTune/ }),
    ).toBeAttached()

    await picker.selectOption('maxxecu')

    // Connect is enabled now (a profile is picked).
    const connect = page.getByRole('button', { name: 'Connect' })
    await expect(connect).toBeEnabled()
    await connect.click()

    await expect(
      page.getByRole('img', { name: 'ESP32 connected, ready to flash' }),
    ).toBeVisible()

    await page.getByRole('button', { name: /^Flash / }).click()

    await expect(
      page.getByRole('heading', { name: /Flashed/ }),
    ).toBeVisible({ timeout: 8_000 })

    // The download CTA references the picked profile by name.
    await expect(
      page.getByRole('button', {
        name: /Download signals\.json for MaxxECU MTune/,
      }),
    ).toBeVisible()

    // The post-flash instruction mentioning Studio is present.
    await expect(page.getByText(/upload it via Studio/i)).toBeVisible()
  })
})
