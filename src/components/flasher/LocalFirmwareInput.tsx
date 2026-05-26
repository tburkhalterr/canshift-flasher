// src/components/flasher/LocalFirmwareInput.tsx
import { useId, useRef, useState, type ChangeEvent, type ReactElement } from 'react'

import {
  LocalFirmwareError,
  readFirmwareFile,
  readSha256File,
  type LocalFirmware,
} from '../../lib/local-firmware'

interface LocalFirmwareInputProps {
  value: LocalFirmware | null
  onChange: (firmware: LocalFirmware | null) => void
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${String(bytes)} B`
}

const verificationState = (
  computed: string,
  expected: string | null,
): 'unverified' | 'verified' | 'mismatch' => {
  if (expected === null) return 'unverified'
  return computed.toLowerCase() === expected.toLowerCase() ? 'verified' : 'mismatch'
}

export const LocalFirmwareInput = ({ value, onChange }: LocalFirmwareInputProps): ReactElement => {
  const firmwareInputId = useId()
  const checksumInputId = useId()
  const firmwareInputRef = useRef<HTMLInputElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const handleFirmwareFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoadError(null)
    try {
      const firmware = await readFirmwareFile(file)
      // Preserve expectedSha256 if the user already entered one.
      onChange({ ...firmware, expectedSha256: value?.expectedSha256 ?? null })
    } catch (err) {
      const message = err instanceof LocalFirmwareError ? err.message : 'Failed to read file.'
      setLoadError(message)
      onChange(null)
    } finally {
      // Reset the input so picking the same file again still triggers onChange.
      event.target.value = ''
    }
  }

  const handleChecksumFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file || !value) return
    setLoadError(null)
    try {
      const expected = await readSha256File(file)
      onChange({ ...value, expectedSha256: expected })
    } catch (err) {
      const message = err instanceof LocalFirmwareError ? err.message : 'Failed to read file.'
      setLoadError(message)
    } finally {
      event.target.value = ''
    }
  }

  const handleChecksumText = (event: ChangeEvent<HTMLInputElement>): void => {
    if (!value) return
    const raw = event.target.value.trim()
    if (raw.length === 0) {
      onChange({ ...value, expectedSha256: null })
      return
    }
    onChange({ ...value, expectedSha256: raw })
  }

  const handleClear = (): void => {
    setLoadError(null)
    onChange(null)
  }

  const state = value ? verificationState(value.sha256, value.expectedSha256) : 'unverified'
  const expectedInvalid =
    value?.expectedSha256 !== null &&
    value?.expectedSha256 !== undefined &&
    !SHA256_HEX_RE.test(value.expectedSha256)

  return (
    <details className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
      <summary className="cursor-pointer select-none font-display text-sm font-semibold tracking-wide text-text">
        Or flash a local file
      </summary>

      <div className="mt-3 space-y-3">
        {value ? (
          <div className="space-y-2 rounded-sm border border-border bg-surface px-3 py-3 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-text">{value.name}</p>
                <p className="text-text-muted">{formatBytes(value.bytes.byteLength)}</p>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-sm border border-border px-2 py-1 text-text-muted hover:text-text"
              >
                Remove
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-text-muted">Computed SHA-256</p>
              <p className="break-all font-mono text-text">{value.sha256}</p>
            </div>
          </div>
        ) : (
          <label
            htmlFor={firmwareInputId}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border bg-surface px-3 py-4 text-center text-text-dim hover:border-status-danger hover:text-text"
          >
            <span>Click to choose a .bin firmware file</span>
            <span className="text-xs text-text-muted">Max 16 MiB</span>
          </label>
        )}
        <input
          ref={firmwareInputRef}
          id={firmwareInputId}
          type="file"
          accept=".bin,application/octet-stream"
          className="sr-only"
          onChange={(e) => {
            void handleFirmwareFile(e)
          }}
        />

        {value ? (
          <div className="space-y-2">
            <label htmlFor={checksumInputId} className="block text-xs text-text-muted">
              Expected SHA-256 (paste or load a .sha256 file)
            </label>
            <input
              id={checksumInputId}
              type="text"
              value={value.expectedSha256 ?? ''}
              onChange={handleChecksumText}
              placeholder="64 hex chars"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={`w-full rounded-md border bg-surface px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring ${
                expectedInvalid ? 'border-status-danger text-status-danger' : 'border-border text-text'
              }`}
            />
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-muted hover:text-text">
              <span className="underline-offset-4 hover:underline">…or pick a .sha256 file</span>
              <input
                type="file"
                accept=".sha256,.txt,text/plain"
                className="sr-only"
                onChange={(e) => {
                  void handleChecksumFile(e)
                }}
              />
            </label>

            {state === 'verified' ? (
              <p className="text-xs text-success" role="status">
                Verified — checksum matches.
              </p>
            ) : null}
            {state === 'mismatch' && !expectedInvalid ? (
              <p className="text-xs text-status-danger" role="alert">
                Mismatch — the file does not match the expected SHA-256. Refusing to flash.
              </p>
            ) : null}
            {state === 'unverified' && !expectedInvalid ? (
              <p className="text-xs text-text-muted">
                No checksum provided — flashing unverified bytes is your responsibility.
              </p>
            ) : null}
          </div>
        ) : null}

        {loadError ? (
          <p className="text-xs text-status-danger" role="alert">
            {loadError}
          </p>
        ) : null}
      </div>
    </details>
  )
}
