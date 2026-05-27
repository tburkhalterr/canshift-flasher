// src/lib/profiles/parse-realdash-xml.test.ts
//
// Round-trip fixture test — feeds a real RealDash CAN XML (MaxxECU default,
// also vendored in `tests/fixtures/realdash/`) through the parser and asserts
// the signal count + a couple of shape invariants. The fixture lives in the
// flasher's own tests directory so the test does not require the sibling
// canshift-studio repo to be checked out (the build script handles that).
//
// The threshold is intentionally loose ("ballpark") — the goal is to flag a
// parser regression that halves the import, not to lock in an exact count.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseRealDashXML } from './parse-realdash-xml'

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'realdash')

describe('parseRealDashXML', () => {
  it('imports MaxxECU default CAN XML and yields a reasonable signal count', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'maxxecu_default_can.xml'), 'utf-8')
    const { signals, warnings } = parseRealDashXML(xml)

    // The MaxxECU descriptor ships ~100 value rows; allow some slack below as
    // a regression buffer but flag if we ever drop below half that.
    expect(signals.length).toBeGreaterThan(50)
    expect(warnings.length).toBeLessThan(10)

    // Each emitted signal must already conform to the schema (the parser
    // validates internally) — just spot-check a frame id is in 11-bit hex.
    for (const s of signals.slice(0, 5)) {
      expect(s.canFrameId).toMatch(/^0[xX][0-9a-fA-F]{1,3}$/)
      expect([1, 2, 4]).toContain(s.byteLength)
    }
  })

  it('returns a single warning when the input is not a RealDash XML', () => {
    const { signals, warnings } = parseRealDashXML('<unrelated>not realdash</unrelated>')
    expect(signals).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/Not a RealDash CAN XML/)
  })

  it('rejects malformed signal rows with a warning instead of throwing', () => {
    // length="3" violates the byteLength enum (1/2/4 only).
    const xml = `<RealDashCAN version="2">
      <frames>
        <frame id="0x100">
          <value name="bad" offset="0" length="3"></value>
        </frame>
      </frames>
    </RealDashCAN>`
    const { signals, warnings } = parseRealDashXML(xml)
    expect(signals).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toMatch(/Rejected signal/)
  })

  it('applies frame-level signed default but lets a per-value attr override it', () => {
    const xml = `<RealDashCAN version="2">
      <frames>
        <frame id="0x200" signed="true">
          <value name="inherits_signed" offset="0" length="2"></value>
          <value name="overrides_unsigned" offset="2" length="2" signed="false"></value>
        </frame>
      </frames>
    </RealDashCAN>`
    const { signals } = parseRealDashXML(xml)
    expect(signals).toHaveLength(2)
    expect(signals[0]?.signed).toBe(true)
    expect(signals[1]?.signed).toBe(false)
  })
})
