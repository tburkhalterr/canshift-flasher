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
 * Where the flasher fetches the latest firmware binary.
 * Configurable via VITE_FIRMWARE_URL — defaults to the canonical hosting
 * origin (canshift.tmbk.ch/firmware/latest.bin). The user uploads a new
 * binary here on each firmware release (separate GHA workflow they maintain).
 */
export const FIRMWARE_URL: string =
  (import.meta.env.VITE_FIRMWARE_URL as string | undefined) ??
  'https://canshift.tmbk.ch/firmware/latest.bin'

/** ESP32 baud rate for esptool stub upload. Matches canshift-studio default. */
export const FLASH_BAUD = 921_600

/** Initial serial baud rate before stub negotiation. */
export const INITIAL_BAUD = 115_200

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
