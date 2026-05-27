// src/lib/dashboards/catalog.test.ts
//
// Catalog integrity: every entry listed in `public/dashboards/index.json`
// must resolve to a `<slug>.json` file that parses against the vendored
// schema. Runs against the on-disk catalog so a malformed entry fails CI
// before it ever reaches a user's dash.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DashboardConfigSchema,
  DashboardIndexSchema,
  type DashboardIndexEntry,
} from './schema'

const DASHBOARDS_DIR = join(process.cwd(), 'public', 'dashboards')

const readJson = (filename: string): unknown => {
  const raw = readFileSync(join(DASHBOARDS_DIR, filename), 'utf-8')
  return JSON.parse(raw) as unknown
}

const loadIndex = (): DashboardIndexEntry[] => {
  const raw = readJson('index.json')
  return DashboardIndexSchema.parse(raw)
}

const countWidgets = (parsed: ReturnType<typeof DashboardConfigSchema.parse>): number =>
  parsed.pages.reduce((sum, page) => sum + page.widgets.length, 0)

describe('dashboard catalog', () => {
  it('index.json parses against DashboardIndexSchema', () => {
    expect(() => loadIndex()).not.toThrow()
  })

  it('index.json has at least one entry', () => {
    expect(loadIndex().length).toBeGreaterThan(0)
  })

  it('index.json contains the blank entry as an always-available escape hatch', () => {
    const index = loadIndex()
    expect(index.some((e) => e.slug === 'blank')).toBe(true)
  })

  it('every index entry has a matching <slug>.json file that parses', () => {
    const index = loadIndex()
    for (const entry of index) {
      const file = `${entry.slug}.json`
      const raw = readJson(file)
      const parsed = DashboardConfigSchema.parse(raw)
      // Sanity: the index's pagesCount must match the file's actual page count
      // so the picker doesn't lie about coverage.
      expect(
        parsed.pages.length,
        `index entry "${entry.slug}" declares ${String(entry.pagesCount)} pages but ${file} has ${String(parsed.pages.length)}`,
      ).toBe(entry.pagesCount)
      // The index's widgetCount must match the sum of widgets across pages.
      const actualWidgets = countWidgets(parsed)
      expect(
        actualWidgets,
        `index entry "${entry.slug}" declares ${String(entry.widgetCount)} widgets but ${file} has ${String(actualWidgets)}`,
      ).toBe(entry.widgetCount)
    }
  })

  it('every <slug>.json on disk is referenced by the index (no orphans)', () => {
    const index = loadIndex()
    const slugs = new Set(index.map((e) => e.slug))
    const files = readdirSync(DASHBOARDS_DIR).filter(
      (f) => f.endsWith('.json') && f !== 'index.json',
    )
    for (const file of files) {
      const slug = file.replace(/\.json$/, '')
      expect(slugs.has(slug), `dashboard file "${file}" exists but is not in index.json`).toBe(true)
    }
  })
})
