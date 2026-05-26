#!/usr/bin/env node
// scripts/inject-sw-version.mjs — replace `__BUILD_SHA__` in dist/sw.js with
// the current git short SHA so the SW cache name is tied to the build. Runs
// after `vite build` (see `package.json` → `build` script). Falls back to
// `unknown` when `.git` is missing (Docker layers, fresh tarballs).
//
// SEC-007: a stale SW with the previous CSP must not outlive a security
// deploy — bumping CACHE_VERSION per build forces `activate` to run, which
// then clears old caches and reloads open clients.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SW_PATH = resolve('dist', 'sw.js')
const PLACEHOLDER = '__BUILD_SHA__'

const resolveBuildSha = () => {
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA.trim()
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

const main = () => {
  const sha = resolveBuildSha()
  let source
  try {
    source = readFileSync(SW_PATH, 'utf8')
  } catch (err) {
    console.error(`[inject-sw-version] cannot read ${SW_PATH}: ${err.message}`)
    process.exit(1)
  }

  if (!source.includes(PLACEHOLDER)) {
    console.error(
      `[inject-sw-version] placeholder ${PLACEHOLDER} not found in ${SW_PATH} — refusing to write.`,
    )
    process.exit(1)
  }

  const next = source.split(PLACEHOLDER).join(sha)
  writeFileSync(SW_PATH, next)
  console.log(`[inject-sw-version] CACHE_VERSION → ${sha}`)
}

main()
