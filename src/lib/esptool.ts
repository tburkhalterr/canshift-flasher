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
  const chip = await loader.main()
  return { transport, loader, chip }
}

/**
 * Run a full erase + flash cycle against an ESP32 bridged over Web Serial.
 *
 * Attempts up to three reset variants (classic → inverted → usb-jtag) before
 * giving up. Mirrors the studio's main-process reset sequences (#482) — Web
 * Serial's setSignals is flakier than Node's serialport, so multiple passes
 * are needed to cover stubborn CH340 boards on macOS.
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

  for (let i = 0; i < RESET_VARIANT_ORDER.length; i++) {
    const variant = RESET_VARIANT_ORDER[i]
    if (!variant) continue
    try {
      const attempt = await attemptBootloaderEntry(port, variant, onLog, flashIdState, baudRate)
      transport = attempt.transport
      loader = attempt.loader
      chip = attempt.chip
      onLog(`Bootloader entered via ${variant} reset.\n`)
      break
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : String(err)
      onLog(`Reset variant ${variant} failed: ${message}\n`)
      // Discard the failed transport before trying the next variant.
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

  if (!loader || !transport || chip === null) {
    onLog(`\n${BOOTLOADER_GIVE_UP_MESSAGE}\n`)
    // Preserve the original error as the cause for diagnostics, but surface
    // the clear user-facing message at .message level.
    const wrapped = new Error(BOOTLOADER_GIVE_UP_MESSAGE)
    if (lastError instanceof Error) {
      ;(wrapped as Error & { cause?: unknown }).cause = lastError
    }
    throw wrapped
  }

  try {
    if (onChipInfo) onChipInfo(chip)

    // Abort before writeFlash if the bootloader reported a bad Flash ID —
    // continuing would just hang for the full 60s flash-command timeout.
    if (flashIdState.bad) {
      throw new Error(
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
