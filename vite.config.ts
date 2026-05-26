// vite.config.ts
import { execSync } from 'node:child_process'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Build provenance — embedded into the bundle via `define` so the deployed
// footer can show which commit users are running. `git rev-parse` is wrapped
// in try/catch to keep CI / Docker layers without `.git` working: they fall
// back to 'unknown' rather than failing the build. The timestamp is captured
// at config evaluation time, which Vite re-runs per build.
const resolveBuildSha = (): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

const buildSha = resolveBuildSha()
const buildDate = new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 250,
  },
  server: {
    port: 5180,
    strictPort: false,
  },
})
