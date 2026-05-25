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
