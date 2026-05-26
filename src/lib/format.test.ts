// src/lib/format.test.ts
import { describe, expect, it } from 'vitest'

import {
  buildLogBlob,
  buildLogFilename,
  formatBytes,
  formatPortInfo,
  formatPublishedDate,
  type LogReportInput,
} from './format'

const ONE_KIB = 1024
const ONE_MIB = ONE_KIB * 1024
const ONE_GIB = ONE_MIB * 1024

describe('formatBytes', () => {
  it('renders 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('renders sub-KB values in bytes', () => {
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('renders exactly 1 KiB', () => {
    expect(formatBytes(ONE_KIB)).toBe('1.0 KB')
  })

  it('renders just under 1 MiB in KB', () => {
    expect(formatBytes(ONE_MIB - 1)).toBe('1024.0 KB')
  })

  it('renders exactly 1 MiB', () => {
    expect(formatBytes(ONE_MIB)).toBe('1.00 MB')
  })

  it('renders 1 GiB as MB', () => {
    expect(formatBytes(ONE_GIB)).toBe('1024.00 MB')
  })
})

function makePort(info: { usbVendorId?: number; usbProductId?: number }): SerialPort {
  return {
    getInfo: () => info,
  } as unknown as SerialPort
}

describe('formatPortInfo', () => {
  it('returns "USB vid:pid" when both IDs are present', () => {
    const port = makePort({ usbVendorId: 0x1a86, usbProductId: 0x7523 })
    expect(formatPortInfo(port)).toBe('USB 1a86:7523')
  })

  it('pads short hex IDs to 4 digits', () => {
    const port = makePort({ usbVendorId: 0x10, usbProductId: 0x2 })
    expect(formatPortInfo(port)).toBe('USB 0010:0002')
  })

  it('falls back to "Serial port" when VID is missing', () => {
    const port = makePort({ usbProductId: 0x7523 })
    expect(formatPortInfo(port)).toBe('Serial port')
  })

  it('falls back to "Serial port" when PID is missing', () => {
    const port = makePort({ usbVendorId: 0x1a86 })
    expect(formatPortInfo(port)).toBe('Serial port')
  })

  it('falls back when both IDs are missing', () => {
    const port = makePort({})
    expect(formatPortInfo(port)).toBe('Serial port')
  })
})

describe('buildLogBlob', () => {
  const baseInput: LogReportInput = {
    log: 'flash log line 1\nflash log line 2',
    chipInfo: 'ESP32',
    portInfo: 'USB 1a86:7523',
    userAgent: 'Mozilla/5.0 (CI)',
    timestamp: new Date('2026-01-15T10:20:30Z'),
  }

  it('produces a text/plain blob with header lines and the log body', async () => {
    const blob = buildLogBlob(baseInput)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/plain;charset=utf-8')

    const text = await blob.text()
    expect(text).toContain('CANShift Flasher log')
    expect(text).toContain('Timestamp: 2026-01-15T10:20:30.000Z')
    expect(text).toContain('User-Agent: Mozilla/5.0 (CI)')
    expect(text).toContain('Chip: ESP32')
    expect(text).toContain('Port: USB 1a86:7523')
    expect(text).toContain('flash log line 1')
    expect(text).toContain('flash log line 2')
  })

  it('falls back to "unknown" for missing chip and port info', async () => {
    const blob = buildLogBlob({ ...baseInput, chipInfo: null, portInfo: null })
    const text = await blob.text()
    expect(text).toContain('Chip: unknown')
    expect(text).toContain('Port: unknown')
  })
})

describe('formatPublishedDate', () => {
  it('formats a valid ISO timestamp as YYYY-MM-DD in UTC', () => {
    expect(formatPublishedDate('2026-05-20T07:20:41Z')).toBe('2026-05-20')
  })

  it('returns the input verbatim when the string is not a date', () => {
    expect(formatPublishedDate('not-a-date')).toBe('not-a-date')
  })

  it('returns an empty string for empty input', () => {
    expect(formatPublishedDate('')).toBe('')
  })

  it('handles a date-only ISO string', () => {
    expect(formatPublishedDate('2026-05-20')).toBe('2026-05-20')
  })

  it('normalises an offset timezone to UTC', () => {
    expect(formatPublishedDate('2026-05-20T23:30:00+02:00')).toBe('2026-05-20')
  })

  it('rolls the date forward when the UTC equivalent is the next day', () => {
    expect(formatPublishedDate('2026-05-20T23:30:00-05:00')).toBe('2026-05-21')
  })
})

describe('buildLogFilename', () => {
  it('produces a zero-padded UTC-timestamped filename', () => {
    const ts = new Date(Date.UTC(2026, 0, 5, 7, 8, 9))
    expect(buildLogFilename(ts)).toBe('canshift-flasher-20260105-070809.txt')
  })

  it('is filesystem-safe (only alphanumerics, dashes, and the extension)', () => {
    const ts = new Date(Date.UTC(2026, 11, 31, 23, 59, 59))
    const name = buildLogFilename(ts)
    expect(name).toMatch(/^canshift-flasher-\d{8}-\d{6}\.txt$/)
  })
})
