// src/constants.ts

/**
 * USB-UART bridges shipped on supported CANShift boards.
 * Mirrors canshift-studio/main/index.ts allowlist (CH340 / CH9102 / CP210x).
 */
export const SUPPORTED_USB_FILTERS: SerialPortFilter[] = [
  { usbVendorId: 0x1a86, usbProductId: 0x7523 }, // CH340
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 }, // CH9102
  { usbVendorId: 0x10c4, usbProductId: 0xea60 }, // CP210x
]

/**
 * Canonical GitHub repository hosting CANShift firmware releases.
 * Used by `fetchLatestRelease` to pull release metadata + asset URLs.
 */
export const GITHUB_REPO = 'tburkhalterr/CANShift'

/** mDNS hostname the dash advertises on its AP after first boot. */
export const DASH_HOSTNAME = 'canshift.local'

/** WiFi access point SSID the dash broadcasts on first boot. */
export const DASH_AP_SSID = 'CANShift'

/**
 * @deprecated Static fallback URL used only when the GitHub Releases API is
 * unreachable. The default path is now `fetchLatestRelease()` → use the
 * release's `firmwareAsset.url`. Keep `VITE_FIRMWARE_URL` for back-compat
 * with deployments that pinned a self-hosted mirror — it gets the same
 * mandatory SHA-256 verification against a sibling `.sha256` file.
 */
export const FIRMWARE_URL: string =
  (import.meta.env.VITE_FIRMWARE_URL as string | undefined) ??
  'https://canshift.tmbk.ch/firmware/latest.bin'

/** ESP32 baud rate for esptool stub upload. Matches canshift-studio default. */
export const FLASH_BAUD = 921_600

/** Initial serial baud rate before stub negotiation. */
export const INITIAL_BAUD = 115_200

/**
 * Allowed esptool stub baud rates exposed via the Advanced (recovery) panel.
 * Ordered fastest-first so the default `FLASH_BAUD` reads naturally at the top
 * of the select. Dropping to 460800 or below is a common workaround for flaky
 * CH340 bridges on long USB cables / unpowered hubs.
 */
export const ADVANCED_BAUD_OPTIONS = [921_600, 460_800, 230_400, 115_200] as const
export type AdvancedBaudRate = (typeof ADVANCED_BAUD_OPTIONS)[number]

/** Default advanced options — same behaviour the flasher had before #22. */
export const DEFAULT_ADVANCED_OPTIONS: {
  fullErase: boolean
  baudRate: AdvancedBaudRate
  versionOverride: string | null
} = {
  fullErase: false,
  baudRate: FLASH_BAUD,
  versionOverride: null,
}

/**
 * Hard ceiling for firmware downloads.
 *
 * Current merged firmware images are ~1.5 MiB; 16 MiB gives ~10x headroom
 * while preventing a hostile mirror from streaming a multi-GB body and
 * OOMing the tab. Mirrors the cap used in
 * canshift-studio/main/services/firmware.service.ts.
 */
export const FIRMWARE_BINARY_MAX_BYTES = 16 * 1024 * 1024

/**
 * Flash offset for the merged firmware image.
 *
 * `latest.bin` MUST be the merged binary produced by
 * `esptool merge_bin 0x1000 bootloader 0x8000 partitions 0x10000 firmware` —
 * it embeds the bootloader at its own internal 0x1000 offset.
 *
 * Writing the merged image at 0x10000 (the app-only partition offset) would
 * shift every component by 0x10000 and brick boot with `flash read err, 1000`
 * from the ROM bootloader. Mirrors canshift-studio/src/hooks/useFirmwareFlash.ts
 * (the merged image is always written at 0x0).
 */
export const MERGED_FLASH_OFFSET = 0x0

/**
 * Flash offset for the SPIFFS partition.
 *
 * Pulled from canshift-firmware's `ota_4mb.csv` partition table — the SPIFFS
 * partition starts at 0x310000 on the supported 4 MB layout. Mirrors the
 * offset used by canshift-studio's useFirmwareFlash hook.
 */
export const SPIFFS_FLASH_OFFSET = 0x310000

/**
 * Build-time simulation flag.
 *
 * Set to `'1'` / `'success'` / `'fail'` by `npm run dev -- --mode sim`
 * (which loads `.env.sim` containing `VITE_SIM=1`) or by an ad-hoc
 * `VITE_SIM=success` in the shell. Empty / unset means the flasher talks to
 * real hardware. Read once at module load — toggling at runtime is not
 * supported. The query-string overrides (`?sim=success`, `?sim=fail`,
 * `?sim=1`) live in `lib/sim.ts` and take precedence over this value.
 */
export const VITE_SIM: string | undefined = import.meta.env.VITE_SIM as string | undefined

/**
 * Telemetry collection endpoint. Opt-in only — there is no default.
 *
 * When unset (the stock build), all telemetry calls are no-ops. When set
 * at build time, the flasher fires one tiny anonymous JSON blob per
 * flash attempt (outcome, chip family, error class, duration). See
 * `src/lib/telemetry.ts` for the exact shape and the per-user opt-out.
 */
export const TELEMETRY_URL: string | undefined = import.meta.env.VITE_TELEMETRY_URL as
  | string
  | undefined
