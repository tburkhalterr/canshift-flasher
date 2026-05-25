// src/lib/esptool.ts
import {
  ESPLoader,
  Transport,
  type FlashOptions,
  type IEspLoaderTerminal,
  type LoaderOptions,
} from 'esptool-js'

import { FLASH_BAUD, MERGED_FLASH_OFFSET } from '../constants'

export interface FlashProgress {
  written: number
  total: number
}

export interface FlashRunOptions {
  port: SerialPort
  firmware: Uint8Array
  onLog: (line: string) => void
  onProgress: (progress: FlashProgress) => void
  onChipInfo?: (chip: string) => void
}

/**
 * Run a full erase + flash cycle against an ESP32 bridged over Web Serial.
 *
 * The function is intentionally chunky (single ~60-line block) because each
 * step depends on the previous transport state — splitting it into helpers
 * would obscure the linear lifecycle without buying isolation.
 */
export async function flashFirmware(options: FlashRunOptions): Promise<void> {
  const { port, firmware, onLog, onProgress, onChipInfo } = options

  // The ROM bootloader prints `Flash ID: ffffff` when the chip can't talk to
  // its own flash chip (usually a damaged USB cable, an unpowered hub, or a
  // peripheral pulling on GPIO 6-11 — the SPI flash bus). Detect it in the
  // terminal stream so we can abort before the 60s writeFlash timeout.
  // Mirrors canshift-studio/src/hooks/useFirmwareFlash.ts.
  const flashIdState = { bad: false }
  const checkForBadFlashId = (text: string): void => {
    if (flashIdState.bad) return
    if (/Flash ID:\s*ffffff/i.test(text)) {
      flashIdState.bad = true
    }
  }

  const terminal: IEspLoaderTerminal = {
    clean: () => {},
    write: (data) => {
      checkForBadFlashId(data)
      onLog(data)
    },
    writeLine: (data) => {
      checkForBadFlashId(data)
      onLog(`${data}\n`)
    },
  }

  const transport = new Transport(port, /* tracing */ false)
  const loaderOptions: LoaderOptions = {
    transport,
    baudrate: FLASH_BAUD,
    terminal,
    enableTracing: false,
    debugLogging: false,
  }
  const loader = new ESPLoader(loaderOptions)

  try {
    const chip = await loader.main()
    if (onChipInfo) onChipInfo(chip)

    // Abort before writeFlash if the bootloader reported a bad Flash ID —
    // continuing would just hang for the full 60s flash-command timeout.
    if (flashIdState.bad) {
      throw new Error(
        "Flash ID is ffffff — the chip can't reach its own flash. Try: another USB cable, a powered hub, no peripherals on GPIO 6-11.",
      )
    }

    const flashOptions: FlashOptions = {
      fileArray: [{ data: firmware, address: MERGED_FLASH_OFFSET }],
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: false,
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
