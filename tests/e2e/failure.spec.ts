// tests/e2e/failure.spec.ts
import { expect, test } from '@playwright/test'

test.describe('sim failure flow', () => {
  test('lands in FailedView with retry / start-over / download-log', async ({ page }) => {
    await page.goto('/?sim=fail')

    // useAutoConnect promotes idle → ready via microtask in sim mode.
    // Wait for ready, then trigger the flash.
    await expect(
      page.getByRole('img', { name: 'CANShift dash connected, ready to flash' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Flash latest' }).click()

    // --- FailedView appears once sim throws (~1-2s after partial progress). ---

    await expect(
      page.getByRole('img', { name: 'CANShift dash flash failed' }),
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
