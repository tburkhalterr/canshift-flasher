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
  test('renders all 6 topic titles plus issues link', async ({ page }) => {
    // No sim mode needed — HelpZone is always rendered under the flasher card.
    await page.goto('/')

    const helpZone = page.getByRole('region', { name: 'Troubleshooting' })
    await expect(helpZone).toBeVisible()

    for (const title of TOPIC_TITLES) {
      await expect(
        helpZone.getByRole('heading', { name: title, level: 3 }),
      ).toBeVisible()
    }

    // "Need more help?" link → tburkhalterr/canshift-flasher issues.
    const issuesLink = helpZone.getByRole('link', { name: 'tburkhalterr/canshift-flasher' })
    await expect(issuesLink).toBeVisible()
    await expect(issuesLink).toHaveAttribute(
      'href',
      'https://github.com/tburkhalterr/canshift-flasher/issues',
    )
  })
})
