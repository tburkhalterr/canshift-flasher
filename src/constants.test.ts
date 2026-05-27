// src/constants.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * SEC-003 (#95): the firmware URL validator runs at module load. To assert
 * its behaviour we have to (a) stub `import.meta.env.VITE_FIRMWARE_URL`,
 * (b) reset the module registry so the next `import('../constants')` runs
 * the top-level code again, and (c) re-import. `vi.stubEnv` is the
 * supported way to mutate `import.meta.env` under Vitest.
 */
async function loadConstantsWithFirmwareUrl(
  value: string | undefined,
): Promise<typeof import('./constants')> {
  vi.resetModules()
  if (value === undefined) {
    vi.unstubAllEnvs()
  } else {
    vi.stubEnv('VITE_FIRMWARE_URL', value)
  }
  return await import('./constants')
}

describe('FIRMWARE_URL validation (SEC-003 / #95)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses the default canshift.tmbk.ch URL when VITE_FIRMWARE_URL is unset', async () => {
    const mod = await loadConstantsWithFirmwareUrl(undefined)
    expect(mod.FIRMWARE_URL).toBe('https://canshift.tmbk.ch/firmware/latest.bin')
  })

  it('accepts an https URL on the allowlisted host', async () => {
    const mod = await loadConstantsWithFirmwareUrl(
      'https://canshift.tmbk.ch/firmware/v1.bin',
    )
    expect(mod.FIRMWARE_URL).toBe('https://canshift.tmbk.ch/firmware/v1.bin')
  })

  it('throws at module load on an http (non-https) URL', async () => {
    await expect(
      loadConstantsWithFirmwareUrl('http://canshift.tmbk.ch/firmware/latest.bin'),
    ).rejects.toThrow(/protocol must be https/)
  })

  it('throws at module load on an off-allowlist host', async () => {
    await expect(
      loadConstantsWithFirmwareUrl('https://evil.example.com/latest.bin'),
    ).rejects.toThrow(/not in the allowlist/)
  })

  it('throws at module load on a malformed URL', async () => {
    await expect(loadConstantsWithFirmwareUrl('not a url')).rejects.toThrow(
      /must be a well-formed absolute URL/,
    )
  })
})
