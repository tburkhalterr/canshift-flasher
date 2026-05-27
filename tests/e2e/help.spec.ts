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
  test('opens from the side drawer and reveals content on click', async ({ page }) => {
    await page.goto('/')

    // Drawer is closed by default — only the "Open help" handle is shown.
    await page.getByRole('button', { name: 'Open troubleshooting help' }).click()

    const helpZone = page.getByRole('region', { name: 'Troubleshooting' })
    await expect(helpZone).toBeVisible()

    // Buttons are grouped under role="group" with aria-label "Troubleshooting
    // topics" so AT announces them as a related set. Chromium's a11y tree
    // collapses bare role="group" into the generic role, so we assert the
    // grouping via the attribute and use a locator anchor instead of
    // getByRole.
    const topicsGroup = helpZone.locator('[role="group"][aria-label="Troubleshooting topics"]')
    await expect(topicsGroup).toBeVisible()

    for (const title of TOPIC_TITLES) {
      const button = topicsGroup.getByRole('button', { name: title })
      await expect(button).toBeVisible()
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      // Panels are collapsed by default — keeps the zone short.
      await expect(helpZone.getByRole('heading', { name: title, level: 3 })).toHaveCount(0)
    }

    const firstButton = topicsGroup.getByRole('button', { name: TOPIC_TITLES[0] })
    await firstButton.click()
    await expect(firstButton).toHaveAttribute('aria-expanded', 'true')
    await expect(helpZone.getByRole('heading', { name: TOPIC_TITLES[0], level: 3 })).toBeVisible()

    // Clicking the same disclosure button again collapses the panel.
    await firstButton.click()
    await expect(firstButton).toHaveAttribute('aria-expanded', 'false')
    await expect(helpZone.getByRole('heading', { name: TOPIC_TITLES[0], level: 3 })).toHaveCount(0)

    const issuesLink = helpZone.getByRole('link', { name: 'tburkhalterr/canshift-flasher' })
    await expect(issuesLink).toBeVisible()
    await expect(issuesLink).toHaveAttribute(
      'href',
      'https://github.com/tburkhalterr/canshift-flasher/issues',
    )
  })
})
