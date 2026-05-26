// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

const PREVIEW_PORT = 4173

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PREVIEW_PORT}`,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
  },
  // Web Serial is Chromium-only — match the production browser surface.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    port: PREVIEW_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
