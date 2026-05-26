// src/lib/esptool.ts
import type {
  ESPLoader,
  Transport,
  FlashOptions,
  IEspLoaderTerminal,
  LoaderOptions,
} from 'esptool-js'

import { FLASH_BAUD, MERGED_FLASH_OFFSET, SPIFFS_FLASH_OFFSET } from '../constants'

import {
  RESET_PASS_GAP_MS,
  RESET_VARIANT_ORDER,
  runResetSequence,
  type ResetVariant,
} from './reset'

let esptoolModulePromise: Promise<typeof import('esptool-js')> | null = null

/**
 * Memoised dynamic import of `esptool-js`. Keeps the ~150 kB module out of the
 * initial bundle — Vite/rolldown splits it into its own chunk fetched on the
 * first flash. Subsequent flash attempts (or reset variants) reuse the same
 * promise so the chunk is only fetched once per page.
 */
function loadEsptool(): Promise<typeof import('esptool-js')> {
  if (!esptoolModulePromise) {
    esptoolModulePromise = import('esptool-js')
  }
  return esptoolModulePromise
}

export interface FlashProgress {
  written: number
  total: number
}

export interface FlashRunOptions {
  port: SerialPort
  firmware: Uint8Array
  /** Optional SPIFFS image — flashed at SPIFFS_FLASH_OFFSET when present. */
  spiffs?: Uint8Array
  onLog: (line: string) => void
  onProgress: (progress: FlashProgress) => void
  onChipInfo?: (chip: string) => void
  /**
   * Override the esptool stub baud rate. Defaults to `FLASH_BAUD` (921_600).
   * Exposed as a recovery escape hatch via the Advanced panel — dropping to
   * 460_800 / 230_400 / 115_200 helps flaky CH340 boards on macOS.
   */
  baudRate?: number
  /**
   * When true, request a full chip erase before flashing. Defaults to false.
   * Mirrors `eraseAll` on `FlashOptions`. Recovery-only — a normal update
   * leaves untouched regions alone.
   */
  fullErase?: boolean
}

const BOOTLOADER_GIVE_UP_MESSAGE =
  'Could not enter ESP32 bootloader automatically after 3 attempts. Hold the BOOT button on the device, press RESET (or unplug/replug USB while holding BOOT), then click Retry.'

/**
 * Thrown when the bootloader reports `Flash ID: ffffff` — the chip can't
 * reach its own SPI flash. Almost always cable / hub / GPIO 6-11 pulldown.
 */
export class FlashIdError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlashIdError'
  }
}

/**
 * Thrown when every reset variant fails to enter the ROM bootloader. The
 * original esptool error is preserved as `.cause` for diagnostics; the
 * `.message` is the user-facing BOOT-button instruction.
 */
export class BootloaderEntryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'BootloaderEntryError'
    if (cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = cause
    }
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** State the bad-flash-id sniffer toggles when esptool logs `Flash ID: ffffff`. */
interface FlashIdState {
  bad: boolean
}

/**
 * Try a single connect attempt with the given reset variant: drive DTR/RTS,
 * build a fresh transport + loader, and call `loader.main()`. The transport
 * is returned to the caller so it can drive `writeFlash` against the same
 * instance — or `disconnect()` if this attempt is being discarded.
 */
async function attemptBootloaderEntry(
  port: SerialPort,
  variant: ResetVariant,
  onLog: (line: string) => void,
  flashIdState: FlashIdState,
  baudRate: number,
): Promise<{ transport: Transport; loader: ESPLoader; chip: string }> {
  onLog(`Trying reset sequence: ${variant}...\n`)
  await runResetSequence(port, variant)

  const terminal: IEspLoaderTerminal = {
    clean: () => {},
    write: (data) => {
      if (!flashIdState.bad && /Flash ID:\s*ffffff/i.test(data)) {
        flashIdState.bad = true
      }
      onLog(data)
    },
    writeLine: (data) => {
      if (!flashIdState.bad && /Flash ID:\s*ffffff/i.test(data)) {
        flashIdState.bad = true
      }
      onLog(`${data}\n`)
    },
  }

  const { ESPLoader, Transport } = await loadEsptool()
  const transport = new Transport(port, /* tracing */ false)
  const loaderOptions: LoaderOptions = {
    transport,
    baudrate: baudRate,
    terminal,
    enableTracing: false,
    debugLogging: false,
  }
  const loader = new ESPLoader(loaderOptions)
  try {
    const chip = await loader.main()
    return { transport, loader, chip }
  } catch (err) {
    // Always release the port before letting the next variant try its luck.
    // Without this the second/third pass sees "The port is already open"
    // because the failed Transport never relinquished its handle.
    try {
      await transport.disconnect()
    } catch {
      /* best-effort */
    }
    throw err
  }
}

/**
 * Baud-rate ladder used by `flashFirmware` when the initial rate trips on
 * serial noise. Cheap CH340 cables / USB hubs that work at 115_200 routinely
 * corrupt packets at 921_600; the ladder is "try the user's preferred rate,
 * then progressively safer ones." Duplicates are filtered at runtime so
 * `baudRate=460_800` still only attempts {460_800, 115_200}.
 */
const BAUD_FALLBACK_LADDER: readonly number[] = [460_800, 115_200]

/** True when the bootloader-entry error looks baud-related — i.e. lowering
 *  the rate is likely to help. Other errors (port closed, USB unplug, BOOT
 *  required, flash chip dead) should fail fast.
 *
 *  `No serial data received` is what esptool-js emits when the post-baud-change
 *  read times out — typically because the chip switched to a rate the cable
 *  can't sustain. Same root cause as the explicit "noise" wording. */
const isSerialNoiseError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false
  return /Invalid head of packet|Serial data stream stopped|No serial data received|noise or corruption/i.test(
    err.message,
  )
}

/**
 * Run a full erase + flash cycle against an ESP32 bridged over Web Serial.
 *
 * Attempts up to three reset variants (classic → inverted → usb-jtag) at
 * `baudRate`, then retries the whole pass at progressively lower rates from
 * `BAUD_FALLBACK_LADDER` when the only failures look serial-noise-related.
 * Mirrors the studio's main-process reset sequences (#482) — Web Serial's
 * setSignals is flakier than Node's serialport, so multiple passes are needed
 * to cover stubborn CH340 boards on macOS.
 */
export async function flashFirmware(options: FlashRunOptions): Promise<void> {
  const {
    port,
    firmware,
    spiffs,
    onLog,
    onProgress,
    onChipInfo,
    baudRate = FLASH_BAUD,
    fullErase = false,
  } = options

  // The ROM bootloader prints `Flash ID: ffffff` when the chip can't talk to
  // its own flash chip (usually a damaged USB cable, an unpowered hub, or a
  // peripheral pulling on GPIO 6-11 — the SPI flash bus). Detect it in the
  // terminal stream so we can abort before the 60s writeFlash timeout.
  // Mirrors canshift-studio/src/hooks/useFirmwareFlash.ts.
  const flashIdState: FlashIdState = { bad: false }

  let transport: Transport | null = null
  let loader: ESPLoader | null = null
  let chip: string | null = null
  let lastError: unknown = null

  // De-dup the ladder against the requested rate, preserve order, drop higher
  // rates than the user explicitly asked for (e.g. they pinned 115_200 — don't
  // silently try anything faster).
  const baudLadder: number[] = [baudRate]
  for (const rung of BAUD_FALLBACK_LADDER) {
    if (rung < baudRate && !baudLadder.includes(rung)) baudLadder.push(rung)
  }

  baudLadder: for (const currentBaud of baudLadder) {
    if (currentBaud !== baudLadder[0]) {
      onLog(`Retrying at lower baud rate ${String(currentBaud)}...\n`)
    }
    // Track noise across the whole pass: a single variant tripping on noise
    // is enough signal that lowering the rate may help. We were previously
    // only checking the LAST variant's error and missing mixed traces where
    // classic="noise" but usb-jtag="no data" — both baud-related, but the
    // tail-error check would bail out before retry.
    let passSawNoise = false

    for (let i = 0; i < RESET_VARIANT_ORDER.length; i++) {
      const variant = RESET_VARIANT_ORDER[i]
      if (!variant) continue
      try {
        const attempt = await attemptBootloaderEntry(
          port,
          variant,
          onLog,
          flashIdState,
          currentBaud,
        )
        transport = attempt.transport
        loader = attempt.loader
        chip = attempt.chip
        onLog(`Bootloader entered via ${variant} reset at ${String(currentBaud)} baud.\n`)
        break baudLadder
      } catch (err) {
        lastError = err
        if (isSerialNoiseError(err)) passSawNoise = true
        const message = err instanceof Error ? err.message : String(err)
        onLog(`Reset variant ${variant} failed: ${message}\n`)
        // Inner cleanup is now redundant (attemptBootloaderEntry disconnects
        // on failure) but kept as a belt-and-braces safety net.
        try {
          await transport?.disconnect()
        } catch {
          /* swallow */
        }
        transport = null
        loader = null
        if (i < RESET_VARIANT_ORDER.length - 1) {
          await sleepMs(RESET_PASS_GAP_MS)
        }
      }
    }

    // If no variant tripped on noise during this pass, lowering baud won't
    // help — the failure is somewhere else (BOOT required, USB unplug, dead
    // flash chip, etc.).
    if (!passSawNoise) break
  }

  if (!loader || !transport || chip === null) {
    onLog(`\n${BOOTLOADER_GIVE_UP_MESSAGE}\n`)
    // Preserve the original error as the cause for diagnostics, but surface
    // the clear user-facing message at .message level.
    throw new BootloaderEntryError(
      BOOTLOADER_GIVE_UP_MESSAGE,
      lastError instanceof Error ? lastError : undefined,
    )
  }

  try {
    if (onChipInfo) onChipInfo(chip)

    // Abort before writeFlash if the bootloader reported a bad Flash ID —
    // continuing would just hang for the full 60s flash-command timeout.
    if (flashIdState.bad) {
      throw new FlashIdError(
        "Flash ID is ffffff — the chip can't reach its own flash. Try: another USB cable, a powered hub, no peripherals on GPIO 6-11.",
      )
    }

    const fileArray: FlashOptions['fileArray'] = [
      { data: firmware, address: MERGED_FLASH_OFFSET },
    ]
    if (spiffs) {
      fileArray.push({ data: spiffs, address: SPIFFS_FLASH_OFFSET })
    }

    const flashOptions: FlashOptions = {
      fileArray,
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: fullErase,
      compress: true,
      reportProgress: (_fileIndex, written, total) => {
        onProgress({ written, total })
      },
    }

    await loader.writeFlash(flashOptions)
    await loader.after('hard_reset')
  } finally {
    try {
      await transport.disconnect()
    } catch {
      /* swallow: device may already be detached after hard reset */
    }
  }
}

/**
 * Best-effort chip-family probe. Runs a single `loader.main` against a fresh
 * transport, returns the chip name (e.g. `"ESP32-S3"`), then disconnects.
 * Never throws — returns `null` on any failure so the caller can decide
 * whether to surface "unknown" or fall through silently.
 *
 * Used after port selection to show the detected chip in `ReadyView` so the
 * user gets immediate confirmation that the dash is actually responding
 * before kicking off the flash.
 */
export const probeChip = async (port: SerialPort): Promise<string | null> => {
  let transport: Transport | null = null
  try {
    const variant = RESET_VARIANT_ORDER[0]
    if (!variant) return null
    await runResetSequence(port, variant)

    const terminal: IEspLoaderTerminal = {
      clean: () => {},
      write: () => {},
      writeLine: () => {},
    }

    const { ESPLoader, Transport: TransportCtor } = await loadEsptool()
    transport = new TransportCtor(port, /* tracing */ false)
    const loaderOptions: LoaderOptions = {
      transport,
      baudrate: FLASH_BAUD,
      terminal,
      enableTracing: false,
      debugLogging: false,
    }
    const loader = new ESPLoader(loaderOptions)
    const chip = await loader.main()
    return chip
  } catch {
    return null
  } finally {
    try {
      await transport?.disconnect()
    } catch {
      /* swallow: best-effort cleanup */
    }
  }
}
