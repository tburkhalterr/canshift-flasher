// tests/e2e/flow.spec.ts
import { expect, test } from '@playwright/test'

test.describe('sim happy-path flow', () => {
  test('idle → ready → flashing → success → restart', async ({ page }) => {
    await page.goto('/?sim=success')

    // --- Initial paint: idle, then auto-connect promotes to ready. ---
    //
    // The first synchronous paint is `idle` — StepGuide step 1 (Plug) active,
    // DashIllustration in idle variant, Latest line visible. `useAutoConnect`
    // then promotes idle → ready via a microtask in sim mode (see
    // `src/hooks/useAutoConnect.ts`), so by the time Playwright's auto-retry
    // resolves we land in `ready`. We assert the stable `ready` paint here
    // and re-check the idle paint after "Flash again" below — that path
    // returns to idle reliably because useAutoConnect is mount-only.

    await expect(
      page.getByRole('img', { name: 'ESP32 connected, ready to flash' }),
    ).toBeVisible()
    await expect(
      page.getByRole('listitem', { name: /Step 2 of 3: Connect/ }),
    ).toHaveAttribute('aria-current', 'step')
    // "Detected:" line is best-effort (chip probe). Sim mode skips probeChip
    // entirely, so the line is absent — accept either presence or absence.

    // --- Click Flash latest → FlashingView. ---

    await page.getByRole('button', { name: 'Flash latest' }).click()

    await expect(
      page.getByRole('img', { name: 'ESP32 being flashed' }),
    ).toBeVisible()
    await expect(
      page.getByRole('listitem', { name: /Step 3 of 3: Flash/ }),
    ).toHaveAttribute('aria-current', 'step')
    await expect(
      page.getByText('Do not unplug the ESP32 while flashing.'),
    ).toBeVisible()

    // --- Wait for SuccessView (sim's scripted timing is ~3-4s). ---

    await expect(
      page.getByRole('heading', { name: /Flashed/ }),
    ).toBeVisible({ timeout: 8_000 })

    // Three StepCard titles from SuccessView.
    await expect(
      page.getByRole('heading', { name: 'Disconnect from your home WiFi' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Connect to the .* access point/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Open .* in your browser/ }),
    ).toBeVisible()

    // Flash again button visible.
    const flashAgain = page.getByRole('button', { name: 'Flash again' })
    await expect(flashAgain).toBeVisible()

    // --- Click Flash again → reset to idle; click Connect to return to ready. ---
    //
    // `reset()` lands us back in `idle` (autoConnect is a mount-only effect, so
    // it doesn't re-promote on reset). The user re-clicks Connect — which in
    // sim mode synthesises a port and lands ready immediately.

    await flashAgain.click()

    // Idle paint after reset — assertions the initial paint was too racy for.
    await expect(
      page.getByRole('img', { name: 'ESP32 awaiting USB connection' }),
    ).toBeVisible()
    await expect(
      page.getByRole('listitem', { name: /Step 1 of 3: Plug/ }),
    ).toHaveAttribute('aria-current', 'step')
    await expect(page.locator('text=/Latest( version)?:/')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible()

    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(
      page.getByRole('button', { name: 'Flash latest' }),
    ).toBeVisible()
  })
})
