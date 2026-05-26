// tests/e2e/help.spec.ts
import { expect, test } from '@playwright/test'

const TOPIC_TITLES: readonly string[] = [
  'No port shown when I click Connect',
  '"Flash ID is ffffff"',
  '"Could not enter ESP32 bootloader"',
  "Flash succeeds but ESP32 doesn't boot",
  'Browser says "not supported"',
  '"SHA-256 mismatch"',
]

test.describe('HelpZone troubleshooting section', () => {
  test('exposes 6 topic tabs and reveals content on click', async ({ page }) => {
    await page.goto('/')

    const helpZone = page.getByRole('region', { name: 'Troubleshooting' })
    await expect(helpZone).toBeVisible()

    for (const title of TOPIC_TITLES) {
      await expect(helpZone.getByRole('tab', { name: title })).toBeVisible()
      // Panels are collapsed by default — keeps the zone short.
      await expect(helpZone.getByRole('heading', { name: title, level: 3 })).toHaveCount(0)
    }

    const firstTab = helpZone.getByRole('tab', { name: TOPIC_TITLES[0] })
    await firstTab.click()
    await expect(firstTab).toHaveAttribute('aria-selected', 'true')
    await expect(helpZone.getByRole('heading', { name: TOPIC_TITLES[0], level: 3 })).toBeVisible()

    // Clicking the same tab again collapses the panel.
    await firstTab.click()
    await expect(firstTab).toHaveAttribute('aria-selected', 'false')
    await expect(helpZone.getByRole('heading', { name: TOPIC_TITLES[0], level: 3 })).toHaveCount(0)

    const issuesLink = helpZone.getByRole('link', { name: 'tburkhalterr/canshift-flasher' })
    await expect(issuesLink).toBeVisible()
    await expect(issuesLink).toHaveAttribute(
      'href',
      'https://github.com/tburkhalterr/canshift-flasher/issues',
    )
  })
})
