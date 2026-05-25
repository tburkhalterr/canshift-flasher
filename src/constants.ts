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
 * origin (canshift.tmbk.app/firmware/latest.bin). The user uploads a new
 * binary here on each firmware release (separate GHA workflow they maintain).
 */
export const FIRMWARE_URL: string =
  (import.meta.env.VITE_FIRMWARE_URL as string | undefined) ??
  'https://canshift.tmbk.app/firmware/latest.bin'

/** ESP32 baud rate for esptool stub upload. Matches canshift-studio default. */
export const FLASH_BAUD = 921_600

/** Initial serial baud rate before stub negotiation. */
export const INITIAL_BAUD = 115_200

/** ESP32 main firmware partition offset (CANShift partitions.csv). */
export const FIRMWARE_FLASH_OFFSET = 0x10000
