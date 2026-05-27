// src/lib/dashboards/schema.ts
//
// Vendored copy of the `DashboardConfig` (dashboard.json) shape from
// canshift-core (`canshift-core/src/schemas/dashboard.ts`). The flasher does
// NOT depend on canshift-core at runtime — the monorepo rule keeps the
// flasher's runtime deps to Zod only. Keep this file aligned with
// canshift-core when the upstream schema evolves.
//
// Scope: covers the fields a `dashboard.json` catalog entry needs (root +
// pages + widgets + topBar). Cross-field gauge / bar invariants and the
// per-page widget cap are preserved so a catalog file is validated against
// the same rules the firmware enforces at boot.
//
// Differences from upstream:
//   - Root carries `_comment` (matches upstream) and we relax the root to
//     `.passthrough()` so catalog templates can carry author/source notes
//     mirroring the `_comment` pattern used by the profiles catalog.
//   - Inner objects (pages, widgets, topBar items, etc.) stay `.strict()`
//     so structural drift surfaces loudly.

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared limits — mirror canshift-core/src/constants/firmware-caps.ts
// ---------------------------------------------------------------------------

const CANVAS = { WIDTH: 320, HEIGHT: 240 } as const
const FIRMWARE_CAPS = {
  MAX_PAGES: 4,
  MAX_WIDGETS_PER_PAGE: 12,
  MAX_TOPBAR_ITEMS: 16,
  MAX_BUTTON_ACTIONS: 4,
} as const
const TOPBAR_HEIGHT = { MIN: 16, MAX: 60 } as const
const REV_LIMIT_RPM = { MIN: 1, MAX: 20_000 } as const
const DECIMAL_PLACES = { MIN: 0, MAX: 4 } as const

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/
const CAN_RAW_DATA_REGEX = /^([0-9a-fA-F]{2})*$/
const CAN_RAW_DATA_MAX_HEX_CHARS = 16

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const HexColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, 'must be a 6-digit hex color (e.g. "#FF4444")')

const SemVerSchema = z
  .string()
  .regex(SEMVER_REGEX, 'must be a semver string "MAJOR.MINOR.PATCH"')

// ---------------------------------------------------------------------------
// Layout & style
// ---------------------------------------------------------------------------

const WidgetLayoutSchema = z
  .object({
    x: z
      .number()
      .int()
      .min(0)
      .max(CANVAS.WIDTH - 1),
    y: z
      .number()
      .int()
      .min(0)
      .max(CANVAS.HEIGHT - 1),
    w: z.number().int().min(1).max(CANVAS.WIDTH),
    h: z.number().int().min(1).max(CANVAS.HEIGHT),
    zOrder: z.number(),
  })
  .strict()
  .refine((l) => l.x + l.w <= CANVAS.WIDTH, {
    message: `layout: x+w must be <= ${String(CANVAS.WIDTH)}`,
    path: ['w'],
  })
  .refine((l) => l.y + l.h <= CANVAS.HEIGHT, {
    message: `layout: y+h must be <= ${String(CANVAS.HEIGHT)}`,
    path: ['h'],
  })

const WidgetStyleSchema = z
  .object({
    primaryColor: HexColorSchema,
    secondaryColor: HexColorSchema,
    warningColor: HexColorSchema,
    criticalColor: HexColorSchema,
    textColor: HexColorSchema,
    fontSize: z.number(),
    borderColor: HexColorSchema.nullable().optional(),
    respectDayMode: z.boolean().optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// Label position & icons
// ---------------------------------------------------------------------------

const WidgetLabelPositionSchema = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
])

const SensorIconNameSchema = z.enum([
  'rpm',
  'speed',
  'coolant',
  'oil_pressure',
  'oil_temp',
  'battery',
  'fuel',
  'afr',
  'boost',
  'throttle',
  'iat',
  'gear',
  'timer',
  'warning',
  'flame',
  'turbo',
  'engine',
  'brake',
  'launch',
  'traction',
  'map_icon',
  'exhaust',
  'cog',
])

// ---------------------------------------------------------------------------
// Widget config variants
// ---------------------------------------------------------------------------

const GaugeDisplayStyleSchema = z.enum(['numeric', 'arc', 'bar'])
const GaugeArcFillStyleSchema = z.enum(['zones', 'gradient'])
const BarOrientationSchema = z.enum(['vertical', 'horizontal'])

const GaugeWidgetConfigSchema = z
  .object({
    type: z.literal('gauge'),
    displayStyle: GaugeDisplayStyleSchema,
    minValue: z.number(),
    maxValue: z.number(),
    dangerLevel: z.number(),
    decimalPlaces: z.number().int().min(DECIMAL_PLACES.MIN).max(DECIMAL_PLACES.MAX),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    hideWhenInvalid: z.boolean().optional(),
    showNeedle: z.boolean().optional(),
    arcFillStyle: GaugeArcFillStyleSchema.optional(),
    revFlash: z.boolean().optional(),
    alertThreshold: z.number().optional(),
    barOrientation: BarOrientationSchema.optional(),
    label: z.string().optional(),
    labelPosition: WidgetLabelPositionSchema.optional(),
    iconName: SensorIconNameSchema.optional(),
  })
  .strict()

const WarningWidgetConfigSchema = z
  .object({
    type: z.literal('warning'),
    invertLogic: z.boolean().optional(),
    threshold: z.number(),
    iconName: SensorIconNameSchema.optional(),
    label: z.string().optional(),
    labelPosition: WidgetLabelPositionSchema.optional(),
  })
  .strict()

// Button actions ------------------------------------------------------------

const NavigateActionSchema = z
  .object({
    category: z.literal('dashboard'),
    type: z.literal('navigate'),
    pageId: z.string(),
  })
  .strict()

const MapSwitchActionSchema = z
  .object({
    category: z.literal('ecu'),
    type: z.literal('map_switch'),
    mapIndex: z.number(),
  })
  .strict()

const CanRawDataSchema = z
  .string()
  .max(CAN_RAW_DATA_MAX_HEX_CHARS, {
    message: `data must be at most ${String(CAN_RAW_DATA_MAX_HEX_CHARS)} hex characters (8 bytes)`,
  })
  .regex(CAN_RAW_DATA_REGEX, 'data must be even-length hex (e.g. "DEADBEEF")')

const CanRawActionSchema = z
  .object({
    category: z.literal('ecu'),
    type: z.literal('can_raw'),
    frameId: z.number(),
    data: CanRawDataSchema,
    dataOff: CanRawDataSchema.optional(),
    extended: z.boolean().optional(),
  })
  .strict()

const CruiseControlOpSchema = z.enum([
  'on',
  'off',
  'toggle',
  'set',
  'resume',
  'increment',
  'decrement',
])

const CruiseControlActionSchema = z
  .object({
    category: z.literal('ecu'),
    type: z.literal('cruise_control'),
    op: CruiseControlOpSchema,
    stepKmh: z.number().int().min(1).max(20).optional(),
  })
  .strict()

const ButtonActionSchema = z.discriminatedUnion('type', [
  NavigateActionSchema,
  MapSwitchActionSchema,
  CanRawActionSchema,
  CruiseControlActionSchema,
])

const ButtonWidgetConfigSchema = z
  .object({
    type: z.literal('button'),
    label: z.string(),
    iconName: SensorIconNameSchema.optional(),
    iconPath: z.string().optional(),
    showIcon: z.boolean().optional(),
    showLabel: z.boolean().optional(),
    isToggle: z.boolean().optional(),
    colors: z
      .object({
        normal: HexColorSchema,
        active: HexColorSchema,
      })
      .strict()
      .optional(),
    actions: z
      .array(ButtonActionSchema)
      .min(1, 'actions must contain at least one entry')
      .max(
        FIRMWARE_CAPS.MAX_BUTTON_ACTIONS,
        `actions cannot exceed ${String(FIRMWARE_CAPS.MAX_BUTTON_ACTIONS)} entries (firmware cap)`,
      ),
  })
  .strict()

const TimerWidgetConfigSchema = z
  .object({
    type: z.literal('timer'),
    autoStart: z.boolean().optional(),
    format: z.enum(['mm:ss', 'ss.mmm']).optional(),
    label: z.string().optional(),
    labelPosition: WidgetLabelPositionSchema.optional(),
  })
  .strict()

const BarWidgetConfigSchema = z
  .object({
    type: z.literal('bar'),
    decimalPlaces: z.number().int().min(DECIMAL_PLACES.MIN).max(DECIMAL_PLACES.MAX),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    label: z.string().optional(),
    labelPosition: z.enum(['top-center', 'bottom-center']).optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    dangerLevel: z.number().optional(),
    alertThreshold: z.number().optional(),
    iconName: SensorIconNameSchema.optional(),
  })
  .strict()

const GearWidgetConfigSchema = z
  .object({
    type: z.literal('gear'),
    decimalPlaces: z.literal(0),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    hideWhenInvalid: z.boolean().optional(),
    label: z.string().optional(),
    labelPosition: WidgetLabelPositionSchema.optional(),
  })
  .strict()

const ImageWidgetConfigSchema = z
  .object({
    type: z.literal('image'),
    imagePath: z.string(),
    label: z.string().optional(),
    labelPosition: WidgetLabelPositionSchema.optional(),
  })
  .strict()

const WidgetConfigSchema = z.discriminatedUnion('type', [
  GaugeWidgetConfigSchema,
  WarningWidgetConfigSchema,
  ButtonWidgetConfigSchema,
  TimerWidgetConfigSchema,
  BarWidgetConfigSchema,
  GearWidgetConfigSchema,
  ImageWidgetConfigSchema,
])

type WidgetConfigValueType =
  (typeof WidgetConfigSchema)['options'][number]['shape']['type']['value']
const WidgetTypeSchema = z.enum(
  WidgetConfigSchema.options.map((o) => o.shape.type.value) as [
    WidgetConfigValueType,
    ...WidgetConfigValueType[],
  ],
)

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

const WidgetSchema = z
  .object({
    id: z.string().min(1, 'widget id must be a non-empty string'),
    type: WidgetTypeSchema,
    signal: z.string(),
    layout: WidgetLayoutSchema,
    style: WidgetStyleSchema,
    config: WidgetConfigSchema,
  })
  .strict()
  .superRefine((w, ctx) => {
    const cfg = w.config
    if (cfg.type === 'gauge') {
      if (cfg.minValue >= cfg.maxValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'gauge: minValue must be less than maxValue',
          path: ['config', 'maxValue'],
        })
      }
      if (cfg.dangerLevel < cfg.minValue || cfg.dangerLevel > cfg.maxValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'gauge: dangerLevel must be in [minValue, maxValue]',
          path: ['config', 'dangerLevel'],
        })
      }
    } else if (cfg.type === 'bar') {
      if (
        cfg.minValue !== undefined &&
        cfg.maxValue !== undefined &&
        cfg.minValue >= cfg.maxValue
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'bar: minValue must be less than maxValue',
          path: ['config', 'maxValue'],
        })
      }
      if (
        cfg.dangerLevel !== undefined &&
        cfg.minValue !== undefined &&
        cfg.maxValue !== undefined &&
        (cfg.dangerLevel < cfg.minValue || cfg.dangerLevel > cfg.maxValue)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'bar: dangerLevel must be in [minValue, maxValue]',
          path: ['config', 'dangerLevel'],
        })
      }
    }
  })

// ---------------------------------------------------------------------------
// Page palette + theme
// ---------------------------------------------------------------------------

const PagePaletteSchema = z
  .object({
    surface: HexColorSchema,
    primary: HexColorSchema,
    accent: HexColorSchema,
    text: HexColorSchema,
    textDim: HexColorSchema,
    warning: HexColorSchema,
    danger: HexColorSchema,
    success: HexColorSchema,
  })
  .strict()

const ThemePresetSchema = z
  .object({
    bgColor: HexColorSchema,
    palette: PagePaletteSchema.optional(),
  })
  .strict()

const PageTemplateSchema = z.enum(['custom', 'cruise_control'])

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PageConfigSchema = z
  .object({
    id: z.string().min(1, 'page id must be a non-empty string'),
    backgroundImage: z.string().nullable(),
    backgroundColor: HexColorSchema,
    palette: PagePaletteSchema.optional(),
    showTopBar: z.boolean(),
    visible: z.boolean().optional(),
    template: PageTemplateSchema.optional(),
    widgets: z
      .array(WidgetSchema)
      .max(
        FIRMWARE_CAPS.MAX_WIDGETS_PER_PAGE,
        `widgets cannot exceed ${String(FIRMWARE_CAPS.MAX_WIDGETS_PER_PAGE)} entries (firmware cap)`,
      ),
  })
  .strict()

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

const TopBarItemPositionSchema = z.enum(['left', 'center', 'right'])

const iconOnlyTopBarItemShape = z.object({ position: TopBarItemPositionSchema })
const signalBoundTopBarItemShape = z.object({
  signal: z.string(),
  position: TopBarItemPositionSchema,
})

const TopBarItemSchema = z.discriminatedUnion('type', [
  signalBoundTopBarItemShape.extend({ type: z.literal('statusDot') }).strict(),
  z
    .object({ type: z.literal('label'), text: z.string(), position: TopBarItemPositionSchema })
    .strict(),
  iconOnlyTopBarItemShape.extend({ type: z.literal('separator') }).strict(),
  signalBoundTopBarItemShape
    .extend({ type: z.literal('signal'), format: z.string().optional() })
    .strict(),
  iconOnlyTopBarItemShape.extend({ type: z.literal('usbIcon') }).strict(),
  iconOnlyTopBarItemShape.extend({ type: z.literal('bleIcon') }).strict(),
  iconOnlyTopBarItemShape.extend({ type: z.literal('themeToggle') }).strict(),
  signalBoundTopBarItemShape.extend({ type: z.literal('modeFlag'), text: z.string() }).strict(),
  iconOnlyTopBarItemShape.extend({ type: z.literal('trackBadge') }).strict(),
])

const TopBarConfigSchema = z
  .object({
    height: z.number().min(TOPBAR_HEIGHT.MIN).max(TOPBAR_HEIGHT.MAX),
    bgColor: HexColorSchema,
    textColor: HexColorSchema,
    layout: z
      .array(TopBarItemSchema)
      .max(
        FIRMWARE_CAPS.MAX_TOPBAR_ITEMS,
        `topBar.layout cannot exceed ${String(FIRMWARE_CAPS.MAX_TOPBAR_ITEMS)} entries (firmware cap)`,
      )
      .optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// Optional `targetProfile` / `fontFamily` — accept the firmware-shipped
// enums plus any future drift via a plain string. The flasher only ships
// the file verbatim; the firmware itself validates these at boot.
// ---------------------------------------------------------------------------

const ScreenProfileIdSchema = z.string().min(1)
const FontFamilyIdSchema = z.string().min(1)

// ---------------------------------------------------------------------------
// Dashboard root
// ---------------------------------------------------------------------------

// Root carries `_comment` and we relax to `.passthrough()` so catalog
// templates can carry author / source annotations (mirrors the profiles
// catalog's same treatment of `_comment`).
export const DashboardConfigSchema = z
  .object({
    _comment: z.string().optional(),
    version: SemVerSchema,
    name: z.string().min(1, 'name must be a non-empty string'),
    description: z.string().optional(),
    defaultPageId: z.string().min(1, 'defaultPageId must be a non-empty string'),
    revLimitRpm: z.number().min(REV_LIMIT_RPM.MIN).max(REV_LIMIT_RPM.MAX),
    topBar: TopBarConfigSchema,
    dayTheme: ThemePresetSchema.optional(),
    nightTheme: ThemePresetSchema.optional(),
    pages: z
      .array(PageConfigSchema)
      .min(1, 'pages must contain at least one entry')
      .max(
        FIRMWARE_CAPS.MAX_PAGES,
        `pages cannot exceed ${String(FIRMWARE_CAPS.MAX_PAGES)} entries (firmware cap)`,
      ),
    ecuProfileKey: z.string().optional(),
    targetProfile: ScreenProfileIdSchema.optional(),
    fontFamily: FontFamilyIdSchema.optional(),
  })
  .passthrough()

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>

// ---------------------------------------------------------------------------
// Catalog index entry
// ---------------------------------------------------------------------------

/** Entry shape for `public/dashboards/index.json`. */
export const DashboardIndexEntrySchema = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1),
    pagesCount: z.number().int().min(0),
    widgetCount: z.number().int().min(0),
    recommendedFor: z.string(),
    description: z.string(),
  })
  .strict()

export type DashboardIndexEntry = z.infer<typeof DashboardIndexEntrySchema>

export const DashboardIndexSchema = z.array(DashboardIndexEntrySchema)
