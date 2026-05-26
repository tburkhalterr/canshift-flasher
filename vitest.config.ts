// vitest.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
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
      // Thresholds reflect current realistic coverage, not aspirations. The
      // `lib/` floor is the lowest current per-metric value rounded down; the
      // `hooks/` floor is intentionally permissive until #64 backs
      // `useFlasher` with proper test coverage. Raise these only when the
      // coverage actually rises — gaming the gate hides drift.
      thresholds: {
        'src/lib/**/*.ts': {
          lines: 80,
          functions: 75,
          branches: 70,
          statements: 80,
        },
        'src/hooks/**/*.ts': {
          lines: 50,
          functions: 35,
          branches: 40,
          statements: 50,
        },
      },
    },
  },
})
