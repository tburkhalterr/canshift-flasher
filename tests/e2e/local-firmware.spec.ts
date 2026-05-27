// tests/e2e/local-firmware.spec.ts
import { expect, test, type Page } from '@playwright/test'

// Stub GitHub so we don't burn the runner's IP rate-limit budget and the
// ReadyView "Flash <tag>" CTA always has a stable label suffix.
const stubGitHubReleases = async (page: Page): Promise<void> => {
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

// Deterministic 16-byte fixture: 0x00..0x0F. Small enough to keep tests fast,
// and the SHA-256 below is reproducible from `crypto.subtle.digest` for parity
// with the production read path. Verify with:
//   node -e "crypto.subtle.digest('SHA-256', new Uint8Array(16).map((_,i)=>i))
//     .then(d => console.log([...new Uint8Array(d)]
//       .map(b => b.toString(16).padStart(2,'0')).join('')))"
const FIXTURE_BYTES = Uint8Array.from(Array.from({ length: 16 }, (_, i) => i))
const FIXTURE_NAME = 'test-firmware.bin'
const FIXTURE_SHA256 =
  'be45cb2605bf36bebde684841a28f0fd43c69850a3dce5fedba69928ee3a8991'
// Any well-formed 64-hex string that does not equal FIXTURE_SHA256.
const WRONG_SHA256 =
  '0000000000000000000000000000000000000000000000000000000000000000'

const uploadFixture = async (page: Page): Promise<void> => {
  // The firmware <input type="file"> is `sr-only` (visually hidden but in the
  // DOM). Playwright's `setInputFiles` works on hidden inputs, so we don't
  // need to open the surrounding <details> first — the panel force-opens once
  // `value !== null` anyway (#116).
  const fileInput = page.locator('input[type="file"][accept*=".bin"]')
  await fileInput.setInputFiles({
    name: FIXTURE_NAME,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(FIXTURE_BYTES),
  })
}

// The primary action button: "Flash <filename>" in ReadyView once a local
// firmware is loaded. Sim mode auto-promotes idle → ready on first paint, so
// this is the natural state for the upload-gating assertions.
const primaryFlashButton = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('button', { name: new RegExp(`^Flash ${FIXTURE_NAME}$`) })

test.describe('local firmware upload + verification', () => {
  test.beforeEach(async ({ page }) => {
    await stubGitHubReleases(page)
    await page.goto('/?sim=success')
    // Wait for sim's auto-connect to land us in ReadyView so the file input
    // and its surrounding <details> are stably mounted.
    await expect(
      page.getByRole('img', { name: 'ESP32 connected, ready to flash' }),
    ).toBeVisible()
  })

  test('upload renders the computed SHA-256 digest', async ({ page }) => {
    await uploadFixture(page)

    // The filename appears in two spots after upload (the file readout's <p>
    // and the Flash button label), so anchor to the readout's <p> to keep the
    // assertion specific.
    await expect(
      page.locator('p', { hasText: new RegExp(`^${FIXTURE_NAME}$`) }),
    ).toBeVisible()
    await expect(page.getByText('Computed SHA-256')).toBeVisible()
    await expect(page.getByText(FIXTURE_SHA256)).toBeVisible()
  })

  test('a mismatching expected SHA blocks the Flash CTA', async ({ page }) => {
    await uploadFixture(page)

    const expectedInput = page.getByLabel(/expected SHA-256/i)
    await expectedInput.fill(WRONG_SHA256)

    // Mismatch banner + Flash button disabled.
    await expect(
      page.getByRole('alert').filter({ hasText: /Mismatch/ }),
    ).toBeVisible()
    const flashBtn = primaryFlashButton(page)
    await expect(flashBtn).toBeDisabled()

    // Clicking a disabled button must not transition into flashing. Force-click
    // bypasses Playwright's disabled-actionability guard so we exercise the
    // real DOM behaviour: a disabled <button> swallows the click.
    await flashBtn.click({ force: true })
    await expect(
      page.getByRole('img', { name: 'ESP32 being flashed' }),
    ).toHaveCount(0)
    await expect(flashBtn).toBeDisabled()
  })

  test('a matching expected SHA re-enables the Flash CTA', async ({ page }) => {
    await uploadFixture(page)

    const expectedInput = page.getByLabel(/expected SHA-256/i)
    await expectedInput.fill(FIXTURE_SHA256)

    await expect(page.getByRole('status')).toHaveText(/Verified/)
    await expect(primaryFlashButton(page)).toBeEnabled()
  })

  test('unverified upload requires the risk-acknowledgement checkbox', async ({
    page,
  }) => {
    await uploadFixture(page)

    // No expected SHA → confirmation checkbox is shown, Flash blocked.
    const confirmBox = page.getByRole('checkbox', {
      name: /I understand the firmware is unverified/i,
    })
    await expect(confirmBox).toBeVisible()
    await expect(confirmBox).not.toBeChecked()

    const flashBtn = primaryFlashButton(page)
    await expect(flashBtn).toBeDisabled()

    // Tick → unblocks.
    await confirmBox.check()
    await expect(confirmBox).toBeChecked()
    await expect(flashBtn).toBeEnabled()

    // Untick → re-blocks.
    await confirmBox.uncheck()
    await expect(confirmBox).not.toBeChecked()
    await expect(flashBtn).toBeDisabled()
  })

  test('a successful flash leaves the reuse pill on IdleView', async ({
    page,
  }) => {
    await uploadFixture(page)

    // Accept the unverified-risk gate so Flash enables.
    await page
      .getByRole('checkbox', {
        name: /I understand the firmware is unverified/i,
      })
      .check()

    const flashBtn = primaryFlashButton(page)
    await expect(flashBtn).toBeEnabled()
    await flashBtn.click()

    // Wait for the sim flash to land in SuccessView (~3-4s scripted timing).
    await expect(
      page.getByRole('heading', { name: /Flashed/ }),
    ).toBeVisible({ timeout: 8_000 })

    // Flash again → reset to idle. `useFlasher.reset()` preserves
    // `localFirmware`, so the reuse pill (#201, data-testid below) must
    // render on the next IdleView paint.
    await page.getByRole('button', { name: 'Flash again' }).click()

    await expect(
      page.getByRole('img', { name: 'ESP32 awaiting USB connection' }),
    ).toBeVisible()
    const reusePill = page.getByTestId('reuse-local-firmware-pill')
    await expect(reusePill).toBeVisible()
    await expect(reusePill).toContainText(FIXTURE_NAME)
    await expect(
      reusePill.getByRole('button', { name: 'Flash again with this file' }),
    ).toBeVisible()
  })
})
