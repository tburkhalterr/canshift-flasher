// vitest.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Match `vite.config.ts`'s build-provenance defines so modules that read
// `__BUILD_SHA__` / `__BUILD_DATE__` keep type-checking and resolve to a
// stable mock value under Vitest (no git shell-out during unit tests).
const TEST_BUILD_SHA = 'testsha1'
const TEST_BUILD_DATE = '2026-01-01T00:00:00.000Z'

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(TEST_BUILD_SHA),
    __BUILD_DATE__: JSON.stringify(TEST_BUILD_DATE),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Exclude Claude tooling worktrees so parallel work doesn't double-count
    // tests at the project root.
    exclude: ['node_modules', 'dist', '.claude/**'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts', 'src/hooks/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      // Thresholds reflect current realistic coverage, not aspirations. Each
      // floor is the lowest current per-metric value rounded down — raise
      // these only when the coverage actually rises. Gaming the gate hides
      // drift. The `hooks/` rollup is held back by `useFlasher.ts`; the three
      // small hooks added in Wave 5 are individually at 100% / near-100%.
      thresholds: {
        'src/lib/**/*.ts': {
          lines: 80,
          functions: 75,
          branches: 69,
          statements: 80,
        },
        'src/hooks/**/*.ts': {
          lines: 75,
          functions: 50,
          branches: 65,
          statements: 70,
        },
      },
    },
  },
})
