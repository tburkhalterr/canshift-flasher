// src/lib/profiles/schema.ts
//
// Vendored copy of the `RuntimeSignalConfig` (signals.json) shape from
// canshift-core (`canshift-core/src/schemas/signal.ts`). The flasher does
// NOT depend on canshift-core at runtime — the monorepo rule keeps the
// flasher's runtime deps to Zod only. Keep this file aligned with
// canshift-core when the upstream schema evolves.
//
// Scope: this vendored slice covers exactly the fields a `signals.json`
// catalog entry needs. Threshold-zone invariants and the full OBD-II polling
// schema are kept here so a catalog file is validated against the same rules
// the firmware enforces at boot.

import { z } from 'zod'

const CAN_FRAME_ID_REGEX = /^0[xX][0-9a-fA-F]{1,3}$/
const BIT_MASK_REGEX = /^0[xX][0-9a-fA-F]+$/
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

const MAX_RAMP_STOPS = 8

const SemVerSchema = z
  .string()
  .regex(SEMVER_REGEX, 'must be a semver string "MAJOR.MINOR.PATCH"')

const HexColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, 'must be a 6-digit hex color (e.g. "#FF4444")')

const Obd2PollingSchema = z
  .object({
    mode: z.literal(0x01),
    pid: z.number().int().min(0).max(0xff),
    intervalMs: z.number().int().min(100).max(60_000),
  })
  .strict()

const ColorRampStopSchema = z
  .object({
    value: z.number(),
    color: HexColorSchema,
  })
  .strict()

const ColorRampSchema = z
  .object({
    stops: z
      .array(ColorRampStopSchema)
      .min(2, 'colorRamp.stops must contain at least 2 stops')
      .max(MAX_RAMP_STOPS, `colorRamp.stops cannot exceed ${String(MAX_RAMP_STOPS)} entries`)
      .refine(
        (stops) =>
          stops.every((stop, idx) => {
            if (idx === 0) return true
            const prev = stops[idx - 1]
            return prev !== undefined && prev.value < stop.value
          }),
        { message: 'colorRamp.stops must be sorted strictly ascending by value' },
      ),
    interpolate: z.enum(['linear', 'step']),
  })
  .strict()

export const SignalDefSchema = z
  .object({
    name: z.string(),
    canFrameId: z
      .string()
      .regex(CAN_FRAME_ID_REGEX, 'canFrameId must be hex like 0x123 (1-3 hex chars)'),
    startByte: z.number(),
    byteLength: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    bigEndian: z.boolean(),
    signed: z.boolean(),
    bitMask: z
      .string()
      .regex(BIT_MASK_REGEX, 'bitMask must be a hex literal like 0xFF')
      .optional(),
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
  .refine((s) => s.min < s.max, {
    message: 'min must be less than max',
    path: ['min'],
  })

export type SignalDef = z.infer<typeof SignalDefSchema>

const CanSpeedKbpsSchema = z.union([
  z.literal(125),
  z.literal(250),
  z.literal(500),
  z.literal(1000),
])

// Catalog files mirror the firmware's signals.json. The upstream schema is
// `.strict()` — we relax to passthrough so the example files can carry
// `_comment` / `_warning` / `out` annotations the firmware also accepts.
export const RuntimeSignalConfigSchema = z
  .object({
    version: SemVerSchema,
    protocol: z.string(),
    canSpeedKbps: CanSpeedKbpsSchema,
    signals: z.array(SignalDefSchema),
  })
  .passthrough()

export type RuntimeSignalConfig = z.infer<typeof RuntimeSignalConfigSchema>

/** Entry shape for `public/profiles/index.json`. */
export const ProfileIndexEntrySchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    vendor: z.string().min(1),
    canSpeedKbps: CanSpeedKbpsSchema,
    signalCount: z.number().int().min(0),
    description: z.string(),
  })
  .strict()

export type ProfileIndexEntry = z.infer<typeof ProfileIndexEntrySchema>

export const ProfileIndexSchema = z.array(ProfileIndexEntrySchema)
