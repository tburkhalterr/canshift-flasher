// src/components/flasher/log-report.ts
import { LOG_BUFFER_CAP_BYTES } from '../../hooks/useFlasher'
import { buildLogBlob, buildLogFilename, formatPortInfo } from '../../lib/format'
import type { Release } from '../../lib/releases'

export interface LogContext {
  log: string
  chipInfo: string | null
  port: SerialPort | null
  release: Release | null
  logTruncated: boolean
}

export function downloadLogReport({
  log,
  chipInfo,
  port,
  release,
  logTruncated,
}: LogContext): void {
  const timestamp = new Date()
  const blob = buildLogBlob({
    log,
    chipInfo,
    portInfo: port ? formatPortInfo(port) : null,
    userAgent: navigator.userAgent,
    timestamp,
    firmwareVersion: release?.version ?? null,
    truncated: logTruncated,
    ...(logTruncated ? { truncatedAtBytes: LOG_BUFFER_CAP_BYTES } : {}),
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = buildLogFilename(timestamp)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  queueMicrotask(() => URL.revokeObjectURL(url))
}
