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
    // `vite preview` serves the production build, so `import.meta.env.DEV` is
    // false. SEC-006 (#98) gates `?sim=*` to dev builds OR builds with
    // `VITE_SIM` set — we set `VITE_SIM=1` here so the e2e suite's
    // `?sim=success` / `?sim=fail` navigations continue to activate sim mode
    // against the production bundle without re-opening the phishing surface
    // on the deployed flasher.
    //
    // Note: this re-builds the bundle with `VITE_SIM=1` baked in, so we
    // invoke `npm run build` before `vite preview` to make sure the
    // environment is read at build time (Vite inlines `import.meta.env.*`).
    command: `VITE_SIM=1 npm run build && VITE_SIM=1 npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    port: PREVIEW_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
