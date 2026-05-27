#!/usr/bin/env node
// scripts/build-profiles.mjs — Convert RealDash CAN XML descriptors from the
// sibling `canshift-studio` repo into runtime signals.json profiles that ship
// in `public/profiles/`.
//
// Mode: defaults to writing (regenerate-on-demand). `--check` runs the same
// pipeline but only diffs against the committed output — used by CI to catch
// "XML changed but JSON not regenerated" bugs.
//
// The build script intentionally re-implements the parser logic so this file
// can run on Node 20 without `tsx`/strip-types. The TS counterpart at
// `src/lib/profiles/parse-realdash-xml.ts` is the runtime/test version; the
// vitest fixture test and the catalog validation test together guarantee both
// stay in sync.

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  existsSync,
  statSync,
} from 'node:fs'
import { join, resolve, dirname, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const PROFILES_OUT_DIR = join(REPO_ROOT, 'public', 'profiles')
const CHECK_MODE = process.argv.includes('--check')

/**
 * Resolve the sibling canshift-studio's RealDash XML directory.
 *
 * Resolution order:
 *   1. $CANSHIFT_STUDIO_DIR — explicit override (CI uses this).
 *   2. `../canshift-studio/src/assets/realdash` relative to REPO_ROOT — the
 *      monorepo layout the user docs recommend.
 *   3. Walk up at most 5 directories looking for a `canshift-studio` sibling
 *      so the script works from worktrees nested under `.claude/worktrees/`.
 *
 * Returns null if the directory cannot be located; the caller emits a
 * descriptive error in that case.
 */
function resolveStudioXmlDir() {
  const TAIL = ['canshift-studio', 'src', 'assets', 'realdash']

  if (process.env.CANSHIFT_STUDIO_DIR) {
    const explicit = resolve(process.env.CANSHIFT_STUDIO_DIR, 'src', 'assets', 'realdash')
    if (existsSync(explicit)) return explicit
  }

  let dir = REPO_ROOT
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '..', ...TAIL)
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

const STUDIO_XML_DIR = resolveStudioXmlDir()

// ---------------------------------------------------------------------------
// Schema (mirrors `src/lib/profiles/schema.ts`)
// ---------------------------------------------------------------------------

const CAN_FRAME_ID_REGEX = /^0[xX][0-9a-fA-F]{1,3}$/
const BIT_MASK_REGEX = /^0[xX][0-9a-fA-F]+$/
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

const SemVerSchema = z.string().regex(SEMVER_REGEX)
const HexColorSchema = z.string().regex(HEX_COLOR_REGEX)

const Obd2PollingSchema = z
  .object({
    mode: z.literal(0x01),
    pid: z.number().int().min(0).max(0xff),
    intervalMs: z.number().int().min(100).max(60_000),
  })
  .strict()

const ColorRampStopSchema = z.object({ value: z.number(), color: HexColorSchema }).strict()

const ColorRampSchema = z
  .object({
    stops: z.array(ColorRampStopSchema).min(2).max(8),
    interpolate: z.enum(['linear', 'step']),
  })
  .strict()

const SignalDefSchema = z
  .object({
    name: z.string(),
    canFrameId: z.string().regex(CAN_FRAME_ID_REGEX),
    startByte: z.number(),
    byteLength: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    bigEndian: z.boolean(),
    signed: z.boolean(),
    bitMask: z.string().regex(BIT_MASK_REGEX).optional(),
    scale: z.number(),
    offset: z.number(),
    unit: z.string(),
    min: z.number(),
    max: z.number(),
    warningLevel: z.number().optional(),
    dangerLevel: z.number().optional(),
    highWarningLevel: z.number().optional(),
    highDangerLevel: z.number().optional(),
    timeoutMs: z.number(),
    colorRamp: ColorRampSchema.optional(),
    polling: Obd2PollingSchema.optional(),
  })
  .strict()
  .refine((s) => s.min < s.max, { message: 'min must be less than max', path: ['min'] })

const CanSpeedKbpsSchema = z.union([z.literal(125), z.literal(250), z.literal(500), z.literal(1000)])

const RuntimeSignalConfigSchema = z
  .object({
    version: SemVerSchema,
    protocol: z.string(),
    canSpeedKbps: CanSpeedKbpsSchema,
    signals: z.array(SignalDefSchema),
  })
  .passthrough()

const ProfileIndexEntrySchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    vendor: z.string().min(1),
    canSpeedKbps: CanSpeedKbpsSchema,
    signalCount: z.number().int().min(0),
    description: z.string(),
  })
  .strict()

// ---------------------------------------------------------------------------
// Parser (mirrors `src/lib/profiles/parse-realdash-xml.ts`)
// ---------------------------------------------------------------------------

// U+E001 is in the Private Use Area; we use it to stand in for `>` inside
// quoted XML attribute values so the outer [^>] regex doesn't terminate
// early on V>>N conversion strings.
const GT_PUA = String.fromCharCode(0xe001)
const GT_PUA_RE = new RegExp(GT_PUA, 'g')

function escapeAttribGT(xml) {
  return xml.replace(/"[^"]*"/g, (match) => match.replace(/>/g, GT_PUA))
}

function decodeAttrValue(s) {
  return s
    .replace(GT_PUA_RE, '>')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function getAttrs(tag) {
  const attrs = {}
  const re = /(\w+)="([^"]*)"/g
  let m
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1]] = decodeAttrValue(m[2])
  }
  return attrs
}

function toSnakeCase(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseHexOrDec(s) {
  const t = s.trim()
  return t.toLowerCase().startsWith('0x') ? parseInt(t, 16) : parseInt(t, 10)
}

function resolveEndian(raw) {
  if (!raw) return null
  return raw.toLowerCase() === 'big'
}

function parseConversion(expr) {
  if (!expr || expr.trim() === '') return { scale: 1, offset: 0, bitShift: null }
  const s = expr.trim()

  const shiftMatch = /^V\s*>>\s*(\d+)$/.exec(s)
  if (shiftMatch) return { scale: 1, offset: 0, bitShift: parseInt(shiftMatch[1], 10) }

  const mulDivMatch = /^V\s*\*\s*(-?\d+\.?\d*)\s*\/\s*(-?\d+\.?\d*)$/.exec(s)
  if (mulDivMatch) {
    const divisor = parseFloat(mulDivMatch[2])
    if (divisor === 0) return 'complex'
    return { scale: parseFloat(mulDivMatch[1]) / divisor, offset: 0, bitShift: null }
  }

  const divMatch = /^V\s*\/\s*(-?\d+\.?\d*)$/.exec(s)
  if (divMatch) {
    const divisor = parseFloat(divMatch[1])
    if (divisor === 0) return 'complex'
    return { scale: 1 / divisor, offset: 0, bitShift: null }
  }

  const mulMatch = /^V\s*\*\s*(-?\d+\.?\d*)\s*([+-]\s*\d+\.?\d*)?$/.exec(s)
  if (mulMatch) {
    const scale = parseFloat(mulMatch[1])
    const offset = mulMatch[2] ? parseFloat(mulMatch[2].replace(/\s+/g, '')) : 0
    return { scale, offset, bitShift: null }
  }

  const addMatch = /^V\s*([+-]\s*\d+\.?\d*)$/.exec(s)
  if (addMatch) return { scale: 1, offset: parseFloat(addMatch[1].replace(/\s+/g, '')), bitShift: null }

  return 'complex'
}

function computeRange(byteLength, signed, scale, offset) {
  const bits = byteLength * 8
  const rawMax = signed ? Math.pow(2, bits - 1) - 1 : Math.pow(2, bits) - 1
  const rawMin = signed ? -Math.pow(2, bits - 1) : 0
  const lo = Math.round((scale * rawMin + offset) * 100) / 100
  const hi = Math.round((scale * rawMax + offset) * 100) / 100
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) }
}

function parseRealDashXML(xml) {
  const signals = []
  const warnings = []

  if (!xml.includes('<RealDashCAN')) {
    return { signals, warnings: ['Not a RealDash CAN XML file (missing <RealDashCAN> root)'] }
  }

  const safe = escapeAttribGT(xml)

  let baseId = 0
  const framesTagMatch = /<frames\b([^>]*)>/.exec(safe)
  if (framesTagMatch) {
    const fa = getAttrs(framesTagMatch[1])
    if (fa.baseId) baseId = parseHexOrDec(fa.baseId)
  }

  const frameRe = /<frame\b([^>]*)>([\s\S]*?)<\/frame>/g
  let frameMatch

  while ((frameMatch = frameRe.exec(safe)) !== null) {
    const frameAttrs = getAttrs(frameMatch[1])
    const frameBody = frameMatch[2]

    const rawId = (frameAttrs.id ?? '').split(':')[0] ?? ''
    const frameIdNum = parseHexOrDec(rawId) + baseId
    const canFrameId = `0x${frameIdNum.toString(16)}`

    const frameBigEndian = resolveEndian(frameAttrs.endianess ?? frameAttrs.endianness) ?? false
    const frameSignedDefault = frameAttrs.signed === 'true'
    const timeoutMs = parseInt(frameAttrs.timeout ?? '2000', 10) || 2000

    const valueRe = /<value\b([^>]*?)(?:\s*\/>|>\s*<\/value>)/g
    let valueMatch
    let valueIndex = 0

    while ((valueMatch = valueRe.exec(frameBody)) !== null) {
      const va = getAttrs(valueMatch[1])

      let name
      if (va.name) name = toSnakeCase(va.name)
      else if (va.targetId) name = `channel_${va.targetId}`
      else name = `signal_${rawId.replace(/^0x/i, '')}_${String(valueIndex)}`

      const startByte = parseInt(va.offset ?? '0', 10)
      const byteLength = parseInt(va.length ?? '1', 10)

      const signed = va.signed !== undefined ? va.signed === 'true' : frameSignedDefault
      const valueEndian = resolveEndian(va.endianess ?? va.endianness)
      const bigEndian = valueEndian ?? frameBigEndian

      const unit = va.units ?? ''

      const conv = parseConversion(va.conversion)
      if (conv === 'complex') {
        warnings.push(
          `Skipped unsupported conversion "${va.conversion ?? ''}" on "${name}" (frame ${canFrameId})`,
        )
        valueIndex++
        continue
      }

      const { scale, offset, bitShift } = conv

      let bitMask
      if (bitShift !== null) {
        bitMask = `0x${(1 << bitShift).toString(16).padStart(2, '0')}`
      } else if (unit === 'bit' && !va.conversion) {
        bitMask = '0x01'
      }

      const isBit = bitMask !== undefined

      let min, max
      if (isBit) {
        min = 0
        max = 1
      } else if (va.rangeMin !== undefined && va.rangeMax !== undefined) {
        min = parseFloat(va.rangeMin)
        max = parseFloat(va.rangeMax)
      } else {
        ;({ min, max } = computeRange(byteLength, signed, scale, offset))
      }

      const candidate = {
        name,
        canFrameId,
        startByte,
        byteLength,
        bigEndian,
        signed,
        scale,
        offset,
        unit: isBit ? '' : unit,
        min,
        max,
        timeoutMs,
        ...(bitMask !== undefined ? { bitMask } : {}),
      }

      const parsed = SignalDefSchema.safeParse(candidate)
      if (parsed.success) {
        signals.push(parsed.data)
      } else {
        const reasons = parsed.error.issues
          .map((iss) => {
            const dotPath = iss.path.join('.')
            return dotPath ? `${dotPath}: ${iss.message}` : iss.message
          })
          .join('; ')
        warnings.push(`Rejected signal "${name}" (frame ${canFrameId}): ${reasons}`)
      }
      valueIndex++
    }
  }

  return { signals, warnings }
}

// ---------------------------------------------------------------------------
// Manufacturer mapping
// ---------------------------------------------------------------------------

const VENDOR_MAP = {
  Adaptronic: 'Adaptronic',
  AEM: 'AEM',
  BMW: 'BMW',
  Ecumaster: 'Ecumaster',
  Edelbrock: 'Edelbrock',
  Emerald: 'Emerald',
  Emtron: 'Emtron',
  Flagtronics: 'Flagtronics',
  GM: 'GM',
  Grayhill: 'Grayhill',
  Haltech: 'Haltech',
  Holley: 'Holley',
  'Life Racing': 'Life Racing',
  Link: 'Link',
  MaxxECU: 'MaxxECU',
  Megasquirt: 'Megasquirt',
  OBR: 'OBR',
  'SCS-Delta': 'SCS-Delta',
  syvecs: 'Syvecs',
  toyota: 'Toyota',
  tpms: 'TPMS Sensors',
  turbolamik: 'Turbolamik',
}

// Slugs reserved by the hand-curated entries from #182. The MaxxECU RealDash
// XML imports next to these without overwriting them — see the README section
// on Phase 1a.
const RESERVED_SLUGS = new Set(['blank', 'maxxecu', 'obd2-mode01'])

// Top-of-list "promoted" slugs that should appear before the alphabetical
// vendor list (skip + generic OBD-II).
const PROMOTED_SLUGS = ['blank', 'obd2-mode01']

// XML files that the studio repo serves at a non-default CAN speed. Add
// overrides here when the manufacturer doc explicitly calls out a non-500
// kbps bus. None of the current 37 XMLs document a bus speed, so the table
// is empty and every import lands on the standard 500 kbps.
const CAN_SPEED_OVERRIDES = {}

const DEFAULT_CAN_SPEED_KBPS = 500

// ---------------------------------------------------------------------------
// Slug / name derivation
// ---------------------------------------------------------------------------

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function profileNameFromFile(vendor, vendorDir, fileBase) {
  // Strip vendor prefix when the filename already includes it (e.g.
  // `maxxecu_default_can`, `aem_22_unit1`) so the visible name is just the
  // distinguishing suffix. Strip both the canonical vendor name AND the raw
  // directory name (lowercased) since they often differ (e.g. `tpms` dir
  // vs. `TPMS Sensors` vendor).
  const lower = fileBase.toLowerCase()
  const stripTokens = new Set([
    ...vendor.toLowerCase().split(/\s+/).filter(Boolean),
    vendorDir.toLowerCase(),
  ])
  let stripped = lower
  for (const tok of stripTokens) {
    stripped = stripped.replace(new RegExp(`^${tok}[_\\-]?`), '')
    // Also strip when the vendor token appears as a standalone word inside
    // the basename (e.g. `tiremagic_tpms` → strip the trailing `tpms`).
    stripped = stripped.replace(new RegExp(`[_\\-]${tok}([_\\-]|$)`, 'g'), '$1')
  }
  // Replace separators and trim noise words for legibility.
  const pretty = stripped
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\bcan\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!pretty) return vendor
  // Title-case each word, preserving the original vendor casing.
  const title = pretty
    .split(' ')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
  return `${vendor} ${title}`
}

// ---------------------------------------------------------------------------
// XML discovery + processing
// ---------------------------------------------------------------------------

function listXmlFiles(rootDir) {
  if (!existsSync(rootDir)) {
    return null
  }
  const out = []
  for (const entry of readdirSync(rootDir)) {
    const full = join(rootDir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      // Each top-level subdir is a manufacturer.
      for (const inner of readdirSync(full)) {
        if (inner.toLowerCase().endsWith('.xml')) {
          out.push({ vendorDir: entry, filename: inner, fullPath: join(full, inner) })
        }
      }
    }
  }
  return out
}

function buildSlug(vendorDir, filename) {
  const base = basename(filename, '.xml')
  const raw = `${vendorDir} ${base}`
  let slug = slugify(raw)
  // Reserved-slug collision (e.g. `maxxecu/maxxecu_default_can.xml` →
  // `maxxecu-default-can` which is fine, but a hypothetical
  // `maxxecu/maxxecu.xml` would collide). Suffix with `-realdash` to clarify
  // the RealDash-import origin and avoid clobbering the hand-curated entry.
  if (RESERVED_SLUGS.has(slug)) {
    slug = `${slug}-realdash`
  }
  return slug
}

function buildName(vendorDir, filename, isRealDashSuffix) {
  const vendor = VENDOR_MAP[vendorDir] ?? vendorDir
  const base = basename(filename, '.xml')
  const name = profileNameFromFile(vendor, vendorDir, base)
  return isRealDashSuffix ? `${name} (RealDash)` : name
}

function buildDescription(vendor, vendorDir, signalCount, warningCount) {
  const vendorNote =
    vendorDir === 'tpms'
      ? ' TPMS pressure/temperature sensor broadcasts — not an ECU; pair this with another profile for engine data.'
      : ''
  return `Imported from RealDash CAN descriptor — ${String(signalCount)} signals, ${String(warningCount)} warnings.${vendorNote}`
}

// ---------------------------------------------------------------------------
// Diff helper (for --check)
// ---------------------------------------------------------------------------

function readJsonIfExists(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function stableStringify(obj) {
  // Stable JSON output to keep diffs minimal across re-runs. JSON.stringify
  // already preserves insertion order, but we normalize trailing newline.
  return JSON.stringify(obj, null, 2) + '\n'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
  if (STUDIO_XML_DIR === null) {
    console.error(
      `error: canshift-studio's RealDash XML directory not found.\n` +
        `       This script reads RealDash descriptors from the sibling\n` +
        `       canshift-studio repo at build time. Either:\n` +
        `         - set CANSHIFT_STUDIO_DIR to the canshift-studio repo root, or\n` +
        `         - check out the CANShift monorepo so canshift-flasher and\n` +
        `           canshift-studio sit side by side, e.g.:\n` +
        `             CANShift/\n` +
        `               canshift-flasher/\n` +
        `               canshift-studio/\n`,
    )
    process.exit(1)
  }

  const xmls = listXmlFiles(STUDIO_XML_DIR)
  if (xmls === null) {
    console.error(`error: studio XML directory disappeared at ${STUDIO_XML_DIR}`)
    process.exit(1)
  }

  if (xmls.length === 0) {
    console.error(`error: no XML files found under ${STUDIO_XML_DIR}`)
    process.exit(1)
  }

  console.log(`build-profiles: discovered ${String(xmls.length)} RealDash XML descriptors`)

  // Preserve the hand-curated profiles from #182 — read them straight from
  // disk and merge into the catalog.
  const handCurated = []
  for (const slug of ['blank', 'obd2-mode01', 'maxxecu']) {
    const path = join(PROFILES_OUT_DIR, `${slug}.json`)
    const raw = readJsonIfExists(path)
    if (raw === null) continue
    const parsed = RuntimeSignalConfigSchema.parse(raw)
    const indexEntry = preservedIndexEntry(slug, parsed)
    if (indexEntry !== null) {
      handCurated.push({ slug, entry: indexEntry })
    }
  }

  // Process every XML.
  const generated = []
  const zeroSignalSlugs = []
  let totalWarnings = 0

  for (const xml of xmls) {
    const slug = buildSlug(xml.vendorDir, xml.filename)
    // Distinguish RealDash-imported MaxxECU from the hand-curated `maxxecu`
    // entry so a user can pick either without confusion.
    const isRealDashSuffix = slug.startsWith('maxxecu')

    if (RESERVED_SLUGS.has(slug) || handCurated.some((h) => h.slug === slug)) {
      // Should not happen because buildSlug suffixes with `-realdash`, but
      // belt + suspenders.
      console.error(`error: generated slug "${slug}" collides with a reserved entry`)
      process.exit(1)
    }

    const vendor = VENDOR_MAP[xml.vendorDir] ?? xml.vendorDir
    const name = buildName(xml.vendorDir, xml.filename, isRealDashSuffix)
    const canSpeedKbps = CAN_SPEED_OVERRIDES[slug] ?? DEFAULT_CAN_SPEED_KBPS

    const xmlText = readFileSync(xml.fullPath, 'utf-8')
    const { signals, warnings } = parseRealDashXML(xmlText)

    totalWarnings += warnings.length

    if (signals.length === 0) {
      zeroSignalSlugs.push(slug)
      console.warn(
        `  zero signals (skipped): ${slug} (${relative(REPO_ROOT, xml.fullPath)}) ` +
          `— most likely 29-bit extended CAN IDs which the firmware does not support yet.`,
      )
      // Skip emitting a profile JSON for zero-signal imports. The picker
      // would otherwise list a profile that decodes nothing — confusing.
      continue
    }

    for (const w of warnings) {
      console.warn(`  warn [${slug}]: ${w}`)
    }

    const config = {
      _comment: `Generated from RealDash CAN XML — do not edit by hand. Source: canshift-studio/${relative(STUDIO_XML_DIR, xml.fullPath)}`,
      version: '1.0.0',
      protocol: 'realdash-xml-import',
      canSpeedKbps,
      signals,
    }

    const validated = RuntimeSignalConfigSchema.safeParse(config)
    if (!validated.success) {
      const issues = validated.error.issues
        .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
        .join('; ')
      console.error(`error: generated config for ${slug} fails schema: ${issues}`)
      process.exit(1)
    }

    const description = buildDescription(vendor, xml.vendorDir, signals.length, warnings.length)

    generated.push({
      slug,
      config,
      entry: {
        slug,
        name,
        vendor,
        canSpeedKbps,
        signalCount: signals.length,
        description,
      },
    })
  }

  // Fail if more than 30% of XMLs yield zero signals — parser regression.
  const zeroRatio = zeroSignalSlugs.length / xmls.length
  if (zeroRatio > 0.3) {
    console.error(
      `error: ${String(zeroSignalSlugs.length)}/${String(xmls.length)} XMLs produced zero signals (${(zeroRatio * 100).toFixed(1)}%) — parser regression?`,
    )
    process.exit(1)
  }

  // Validate every entry against the index schema.
  for (const g of generated) {
    const parsed = ProfileIndexEntrySchema.safeParse(g.entry)
    if (!parsed.success) {
      console.error(`error: index entry for ${g.slug} fails schema: ${JSON.stringify(parsed.error.issues)}`)
      process.exit(1)
    }
  }

  // Build the sorted index. Promoted slugs first (in declared order), then
  // remaining entries sorted by vendor, then by name.
  const allEntries = [...handCurated.map((h) => h.entry), ...generated.map((g) => g.entry)]
  const byVendorThenName = (a, b) =>
    a.vendor.toLowerCase().localeCompare(b.vendor.toLowerCase()) ||
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())

  const promoted = []
  const remaining = []
  for (const e of allEntries) {
    if (PROMOTED_SLUGS.includes(e.slug)) promoted.push(e)
    else remaining.push(e)
  }
  promoted.sort((a, b) => PROMOTED_SLUGS.indexOf(a.slug) - PROMOTED_SLUGS.indexOf(b.slug))
  remaining.sort(byVendorThenName)

  const index = [...promoted, ...remaining]

  // Emit.
  mkdirSync(PROFILES_OUT_DIR, { recursive: true })

  const writes = []
  for (const g of generated) {
    writes.push({
      path: join(PROFILES_OUT_DIR, `${g.slug}.json`),
      body: stableStringify(g.config),
    })
  }
  writes.push({ path: join(PROFILES_OUT_DIR, 'index.json'), body: stableStringify(index) })

  // Identify stale .json files in the output dir — anything that isn't
  // (a) about to be written and (b) not a hand-curated entry. Those get
  // removed (or reported as drift in --check mode).
  const expectedFiles = new Set(writes.map((w) => basename(w.path)))
  for (const slug of ['blank', 'obd2-mode01', 'maxxecu']) {
    expectedFiles.add(`${slug}.json`)
  }
  const stale = []
  for (const file of readdirSync(PROFILES_OUT_DIR)) {
    if (!file.endsWith('.json')) continue
    if (!expectedFiles.has(file)) stale.push(file)
  }

  if (CHECK_MODE) {
    let drift = 0
    for (const w of writes) {
      const onDisk = existsSync(w.path) ? readFileSync(w.path, 'utf-8') : null
      if (onDisk !== w.body) {
        drift++
        console.error(`drift: ${relative(REPO_ROOT, w.path)}`)
      }
    }
    for (const file of stale) {
      drift++
      console.error(`stale: ${file} should not exist`)
    }
    if (drift > 0) {
      console.error(
        `\n${String(drift)} profile file(s) drifted from the generated output.\n` +
          `Run \`npm run build-profiles\` and commit the result.`,
      )
      process.exit(1)
    }
    console.log(`check: ${String(writes.length)} files in sync.`)
    return
  }

  for (const w of writes) {
    writeFileSync(w.path, w.body)
  }
  for (const file of stale) {
    unlinkSync(join(PROFILES_OUT_DIR, file))
    console.log(`  removed stale: ${file}`)
  }

  console.log(
    `build-profiles: wrote ${String(generated.length)} generated profiles + index.json ` +
      `(${String(index.length)} total entries, ${String(totalWarnings)} parser warnings, ${String(zeroSignalSlugs.length)} zero-signal XMLs).`,
  )
}

function preservedIndexEntry(slug, parsedConfig) {
  // Re-derive the hand-curated entries' index rows from their committed JSON.
  // The vendor + display name + description are pinned by slug — we don't
  // try to mine them from the JSON itself.
  const META = {
    maxxecu: {
      name: 'MaxxECU MTune',
      vendor: 'MaxxECU',
      description:
        'MaxxECU MTune baseline broadcast at 0x370-0x375. Verify frame IDs and byte positions against your MTune CAN output config before relying on this in anger.',
    },
    'obd2-mode01': {
      name: 'OBD-II (Mode 01, polled)',
      vendor: 'Generic',
      description:
        'Minimal OBD-II Mode 01 profile — RPM, speed, throttle, coolant/IAT temps, battery voltage. Request/response polling on 0x7DF/0x7E8. Works on most production ECUs that expose OBD-II.',
    },
    blank: {
      name: 'Skip — push my own profile via Studio',
      vendor: '—',
      description:
        "Empty signals.json — no signals decoded out of the box. Pick this if your ECU isn't in the catalog yet; configure signals in Studio after the dash boots.",
    },
  }
  const meta = META[slug]
  if (!meta) return null
  return {
    slug,
    name: meta.name,
    vendor: meta.vendor,
    canSpeedKbps: parsedConfig.canSpeedKbps,
    signalCount: parsedConfig.signals.length,
    description: meta.description,
  }
}

run()
