// src/lib/profiles/catalog.test.ts
//
// Catalog integrity: every entry listed in `public/profiles/index.json` must
// resolve to a `signals.json` file that parses against the vendored schema.
// Runs against the on-disk catalog so a malformed entry fails CI before it
// ever reaches a user's dash.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ProfileIndexSchema,
  RuntimeSignalConfigSchema,
  type ProfileIndexEntry,
} from './schema'

const PROFILES_DIR = join(process.cwd(), 'public', 'profiles')

const readJson = (filename: string): unknown => {
  const raw = readFileSync(join(PROFILES_DIR, filename), 'utf-8')
  return JSON.parse(raw) as unknown
}

const loadIndex = (): ProfileIndexEntry[] => {
  const raw = readJson('index.json')
  return ProfileIndexSchema.parse(raw)
}

describe('profile catalog', () => {
  it('index.json parses against ProfileIndexSchema', () => {
    expect(() => loadIndex()).not.toThrow()
  })

  it('index.json has at least one entry', () => {
    expect(loadIndex().length).toBeGreaterThan(0)
  })

  it('every index entry has a matching <slug>.json file that parses', () => {
    const index = loadIndex()
    for (const entry of index) {
      const file = `${entry.slug}.json`
      const raw = readJson(file)
      const parsed = RuntimeSignalConfigSchema.parse(raw)
      // Sanity: the index's signalCount must match the file's actual count
      // so the picker doesn't lie about coverage.
      expect(
        parsed.signals.length,
        `index entry "${entry.slug}" declares ${String(entry.signalCount)} signals but ${file} has ${String(parsed.signals.length)}`,
      ).toBe(entry.signalCount)
      // The index's canSpeedKbps must match the profile's canSpeedKbps.
      expect(parsed.canSpeedKbps).toBe(entry.canSpeedKbps)
    }
  })

  it('every <slug>.json on disk is referenced by the index (no orphans)', () => {
    const index = loadIndex()
    const slugs = new Set(index.map((e) => e.slug))
    const files = readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json')
    for (const file of files) {
      const slug = file.replace(/\.json$/, '')
      expect(
        slugs.has(slug),
        `profile file "${file}" exists but is not in index.json`,
      ).toBe(true)
    }
  })
})
