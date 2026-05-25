// src/lib/esptool.ts
import {
  ESPLoader,
  Transport,
  type FlashOptions,
  type IEspLoaderTerminal,
  type LoaderOptions,
} from 'esptool-js'

import { FIRMWARE_FLASH_OFFSET, FLASH_BAUD } from '../constants'

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

  const terminal: IEspLoaderTerminal = {
    clean: () => {},
    write: (data) => onLog(data),
    writeLine: (data) => onLog(`${data}\n`),
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

    const flashOptions: FlashOptions = {
      fileArray: [{ data: firmware, address: FIRMWARE_FLASH_OFFSET }],
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
