#!/usr/bin/env node
// scripts/copy-docs.mjs — copy the VitePress build output from
// `docs/.vitepress/dist/` into the SPA's `dist/docs/` so a single Vercel
// deploy serves the flasher at `/` and the docs at `/docs/`. The Vercel
// rewrite in `vercel.json` keeps `/docs/*` out of the SPA fallback so the
// static files copied here are served as-is.

import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const DOCS_DIST = resolve('docs', '.vitepress', 'dist')
const TARGET = resolve('dist', 'docs')

const main = () => {
  if (!existsSync(DOCS_DIST)) {
    console.error(`[copy-docs] ${DOCS_DIST} does not exist — did vitepress build run?`)
    process.exit(1)
  }
  if (existsSync(TARGET)) {
    rmSync(TARGET, { recursive: true, force: true })
  }
  cpSync(DOCS_DIST, TARGET, { recursive: true })
  console.log(`[copy-docs] ${DOCS_DIST} -> ${TARGET}`)
}

main()
