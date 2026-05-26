// src/lib/format.ts

/** Format a byte count as a human-readable string (e.g. "1.23 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Format a SerialPort info object as a short "VID:PID" string. */
export function formatPortInfo(port: SerialPort): string {
  const info = port.getInfo()
  if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
    const vid = info.usbVendorId.toString(16).padStart(4, '0')
    const pid = info.usbProductId.toString(16).padStart(4, '0')
    return `USB ${vid}:${pid}`
  }
  return 'Serial port'
}

export interface LogReportInput {
  log: string
  chipInfo: string | null
  portInfo: string | null
  userAgent: string
  timestamp: Date
  /** Resolved firmware version (e.g. "1.2.3") — included when known. */
  firmwareVersion?: string | null
}

/** Build a downloadable plain-text support report from the flash session. */
export function buildLogBlob(input: LogReportInput): Blob {
  const lines = [
    'CANShift Flasher log',
    `Timestamp: ${input.timestamp.toISOString()}`,
    `User-Agent: ${input.userAgent}`,
    `Chip: ${input.chipInfo ?? 'unknown'}`,
    `Port: ${input.portInfo ?? 'unknown'}`,
  ]
  if (input.firmwareVersion) {
    lines.push(`Firmware version: v${input.firmwareVersion}`)
  }
  lines.push('', '---', input.log)
  return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
}

/** Build a filesystem-safe filename derived from an ISO timestamp. */
export function buildLogFilename(timestamp: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, '0')
  const yyyy = timestamp.getUTCFullYear().toString()
  const mm = pad(timestamp.getUTCMonth() + 1)
  const dd = pad(timestamp.getUTCDate())
  const hh = pad(timestamp.getUTCHours())
  const mi = pad(timestamp.getUTCMinutes())
  const ss = pad(timestamp.getUTCSeconds())
  return `canshift-flasher-${yyyy}${mm}${dd}-${hh}${mi}${ss}.txt`
}
