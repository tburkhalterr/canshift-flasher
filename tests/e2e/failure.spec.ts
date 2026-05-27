// tests/e2e/failure.spec.ts
import { expect, test } from '@playwright/test'

// Stub GitHub so the test doesn't depend on the runner's IP rate-limit budget
// and the ReadyView "Flash" CTA always has a stable label suffix to match.
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

test.describe('sim failure flow', () => {
  test('lands in FailedView with retry / start-over / download-log', async ({ page }) => {
    await stubGitHubReleases(page)
    await page.goto('/?sim=fail')

    // useAutoConnect promotes idle → ready via microtask in sim mode.
    // Wait for ready, then trigger the flash.
    await expect(
      page.getByRole('img', { name: 'ESP32 connected, ready to flash' }),
    ).toBeVisible()

    await page.getByRole('main').getByRole('button', { name: /^Flash / }).click()

    // --- FailedView appears once sim throws (~1-2s after partial progress). ---

    await expect(
      page.getByRole('img', { name: 'ESP32 flash failed' }),
    ).toBeVisible({ timeout: 8_000 })

    // "Flash failed" heading + sim's hardcoded failure string. The same line
    // also lands in the LogStream below, so scope the error-string assertion
    // to the banner's <p> via the heading's adjacent layout.
    await expect(
      page.getByRole('heading', { name: 'Flash failed' }),
    ).toBeVisible()
    await expect(
      page.locator('p', { hasText: 'Simulated flash failure (sim mode).' }),
    ).toBeVisible()

    // Buttons for recovery.
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download log' })).toBeVisible()
  })
})
