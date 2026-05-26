// src/lib/local-firmware.test.ts
// @vitest-environment node
//
// jsdom's `ArrayBuffer` constructor lives in a different realm than Node's
// `crypto.subtle.digest`, which performs a strict `instanceof ArrayBuffer`
// check. `readFirmwareFile` calls `computeSha256Hex` on the loaded bytes, so
// we mirror `integrity.test.ts` and run under the `node` environment where
// `File`, `crypto.subtle`, and `ArrayBuffer` all share one realm.
import { describe, expect, it } from 'vitest'

import { computeSha256Hex } from './integrity'
import { LocalFirmwareError, readFirmwareFile, readSha256File } from './local-firmware'

const FIRMWARE_MAX_BYTES = 16 * 1024 * 1024
const MANIFEST_MAX_BYTES = 64 * 1024
const ABC_DIGEST = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

const makeBinaryFile = (bytes: Uint8Array, name = 'firmware.bin'): File => {
  // Copy into a fresh ArrayBuffer to give File a definite (non-Shared) buffer
  // — matches the pattern used in computeSha256Hex for the same reason.
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return new File([buf], name, { type: 'application/octet-stream' })
}

const makeTextFile = (body: string, name = 'firmware.bin.sha256'): File =>
  new File([body], name, { type: 'text/plain' })

describe('readFirmwareFile', () => {
  it('throws LocalFirmwareError with kind="empty" for a zero-byte file', async () => {
    const file = makeBinaryFile(new Uint8Array(0))
    const err = await readFirmwareFile(file).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LocalFirmwareError)
    expect((err as LocalFirmwareError).kind).toBe('empty')
  })

  it('throws LocalFirmwareError with kind="too-large" when File.size exceeds the cap', async () => {
    // Build a small payload but fake a `size` over the cap so we don't allocate
    // 16 MiB in the test. `readFirmwareFile` reads `file.size` before touching
    // bytes, so a getter override is sufficient.
    const file = makeBinaryFile(new Uint8Array([0x00]))
    Object.defineProperty(file, 'size', { value: FIRMWARE_MAX_BYTES + 1 })
    const err = await readFirmwareFile(file).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LocalFirmwareError)
    expect((err as LocalFirmwareError).kind).toBe('too-large')
  })

  it('returns name, bytes, computed sha256 and a null expectedSha256 for a valid file', async () => {
    const payload = new TextEncoder().encode('abc')
    const file = makeBinaryFile(payload, 'esp32-firmware.bin')
    const result = await readFirmwareFile(file)
    expect(result.name).toBe('esp32-firmware.bin')
    expect(result.bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(result.bytes)).toEqual(Array.from(payload))
    expect(result.sha256).toBe(ABC_DIGEST)
    expect(result.expectedSha256).toBeNull()
  })

  it('computes a SHA-256 digest that matches computeSha256Hex of the same bytes', async () => {
    // Pseudorandom-but-deterministic fixture so we don't hardcode another digest.
    const bytes = new Uint8Array(2048)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31 + 7) & 0xff
    const expected = await computeSha256Hex(bytes)
    const result = await readFirmwareFile(makeBinaryFile(bytes))
    expect(result.sha256).toBe(expected)
  })
})

describe('readSha256File', () => {
  it('returns the lowercased hex digest for a coreutils-format sidecar', async () => {
    const file = makeTextFile(`${ABC_DIGEST}  firmware.bin\n`)
    await expect(readSha256File(file)).resolves.toBe(ABC_DIGEST)
  })

  it('parses a file containing only the bare 64 hex chars', async () => {
    const file = makeTextFile(ABC_DIGEST)
    await expect(readSha256File(file)).resolves.toBe(ABC_DIGEST)
  })

  it('tolerates leading BOM, leading whitespace, and trailing newlines', async () => {
    const bom = String.fromCharCode(0xfeff)
    const file = makeTextFile(`${bom}   ${ABC_DIGEST.toUpperCase()}   \n\n`)
    await expect(readSha256File(file)).resolves.toBe(ABC_DIGEST)
  })

  it('throws LocalFirmwareError with kind="manifest-malformed" for body without a digest', async () => {
    const file = makeTextFile('this is not a sha256 manifest at all\n')
    const err = await readSha256File(file).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LocalFirmwareError)
    expect((err as LocalFirmwareError).kind).toBe('manifest-malformed')
  })

  it('throws LocalFirmwareError with kind="manifest-malformed" when the file exceeds 64 KiB', async () => {
    const file = makeTextFile('x')
    Object.defineProperty(file, 'size', { value: MANIFEST_MAX_BYTES + 1 })
    const err = await readSha256File(file).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LocalFirmwareError)
    expect((err as LocalFirmwareError).kind).toBe('manifest-malformed')
  })
})
