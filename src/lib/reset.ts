// src/lib/reset.ts
//
// ESP32 BOOT-mode reset sequences driven over Web Serial's
// `port.setSignals({ dataTerminalReady, requestToSend })`.
//
// Mirrors canshift-studio/main/services/firmware.service.ts (#482) — the
// studio runs this in the Node main process via the `serialport` library,
// which is far more reliable on macOS CH340 drivers than Web Serial. The
// flasher cannot do that (no Node), so we issue the same sequences over
// Web Serial and retry through three variants before giving up.
//
// Widened timings (120 / 80 ms) match the studio: slow CH340 boards on
// macOS need extra latch time on the boot pin compared to esptool's
// default 100 / 50 ms.

/** Strategy for driving DTR/RTS to enter the ESP32 ROM bootloader. */
export type ResetVariant = 'classic' | 'inverted' | 'usb-jtag'

interface ResetStep {
  readonly signals: { dtr: boolean; rts: boolean }
  /** Wait after asserting these signals before the next step. */
  readonly waitMs: number
}

// D0 R1 → release boot, hold reset.
// D1 R0 → pull boot LOW, release reset (chip enters bootloader).
// D0 R0 → release boot pin (chip stays in bootloader).
const CLASSIC_RESET_STEPS: readonly ResetStep[] = [
  { signals: { dtr: false, rts: true }, waitMs: 120 },
  { signals: { dtr: true, rts: false }, waitMs: 80 },
  { signals: { dtr: false, rts: false }, waitMs: 0 },
]

// Inverted variant — RTS toggles the boot pin, DTR toggles reset. Some
// FTDI/PL2303 wirings differ from the canonical CH340 layout.
const INVERTED_RESET_STEPS: readonly ResetStep[] = [
  { signals: { dtr: true, rts: false }, waitMs: 120 },
  { signals: { dtr: false, rts: true }, waitMs: 80 },
  { signals: { dtr: false, rts: false }, waitMs: 0 },
]

// USB-JTAG (ESP32-S3 native USB) — a single brief reset pulse, no boot pin.
const USB_JTAG_RESET_STEPS: readonly ResetStep[] = [
  { signals: { dtr: false, rts: true }, waitMs: 100 },
  { signals: { dtr: false, rts: false }, waitMs: 0 },
]

function resetSequenceFor(variant: ResetVariant): readonly ResetStep[] {
  switch (variant) {
    case 'classic':
      return CLASSIC_RESET_STEPS
    case 'inverted':
      return INVERTED_RESET_STEPS
    case 'usb-jtag':
      return USB_JTAG_RESET_STEPS
    default: {
      const _exhaustive: never = variant
      return _exhaustive
    }
  }
}

/** Settle window between two consecutive reset attempts. */
export const RESET_PASS_GAP_MS = 250

/** Ordered list of variants the flasher tries on each fresh flash attempt. */
export const RESET_VARIANT_ORDER: readonly ResetVariant[] = [
  'classic',
  'inverted',
  'usb-jtag',
]

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Drive the DTR/RTS lines through the chosen sequence. Best-effort: if the
 * port is closed or the underlying transport throws, the caller will see the
 * failure as its own loader.main() error and retry the next variant.
 */
export async function runResetSequence(
  port: SerialPort,
  variant: ResetVariant,
): Promise<void> {
  // Skip silently if the port has no writable surface (closed / detached).
  if (!port.writable) return

  const steps = resetSequenceFor(variant)
  for (const step of steps) {
    try {
      await port.setSignals({
        dataTerminalReady: step.signals.dtr,
        requestToSend: step.signals.rts,
      })
    } catch {
      // setSignals can transiently fail when the port closes between checks
      // ("The port is closed") or while esptool is mid-handshake. Swallowing
      // is safer than aborting the whole sequence — the next variant (or
      // esptool's own internal reset) often recovers from here.
      return
    }
    if (step.waitMs > 0) await sleepMs(step.waitMs)
  }
}
