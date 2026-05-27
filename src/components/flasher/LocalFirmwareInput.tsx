// src/components/flasher/LocalFirmwareInput.tsx
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type SyntheticEvent,
} from 'react'

import {
  LocalFirmwareError,
  readFirmwareFile,
  readSha256File,
  type LocalFirmware,
} from '../../lib/local-firmware'

interface LocalFirmwareInputProps {
  value: LocalFirmware | null
  onChange: (firmware: LocalFirmware | null) => void
  /**
   * Notifies the parent whether a flash is allowed given the current local-
   * firmware verification state. Always `true` when no local firmware is
   * loaded. When a local firmware is loaded:
   *   - mismatch → false (no override)
   *   - unverified + unconfirmed → false
   *   - unverified + confirmed → true
   *   - verified → true
   *
   * #96 (SEC-004): the parent uses this to disable the Connect/Flash CTA.
   * The `useFlasher.flash()` SHA-mismatch throw is kept as defence-in-depth.
   */
  onReadinessChange?: (ready: boolean) => void
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

export const LocalFirmwareInput = ({
  value,
  onChange,
  onReadinessChange,
}: LocalFirmwareInputProps): ReactElement => {
  const firmwareInputId = useId()
  const checksumInputId = useId()
  const confirmId = useId()
  const firmwareInputRef = useRef<HTMLInputElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // The unverified-confirmation checkbox state. Resets to false whenever the
  // user clears the firmware (Remove button) — see the effect below.
  const [confirmedUnverified, setConfirmedUnverified] = useState(false)
  // Track whether the user has manually expanded `<details>`. Combined with
  // `value !== null`, this keeps the panel open once a firmware loads (#116)
  // while still letting the user re-toggle.
  const [userToggledOpen, setUserToggledOpen] = useState(false)

  // Reset the confirmation whenever the firmware is removed. React's
  // documented "adjust state during render" pattern (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // — track the previous value in state and compare. This avoids both the
  // cascading-effect lint rule and the refs-during-render rule.
  const [prevValueIdentity, setPrevValueIdentity] = useState<LocalFirmware | null>(value)
  if (prevValueIdentity !== value) {
    setPrevValueIdentity(value)
    if (value === null && confirmedUnverified) {
      setConfirmedUnverified(false)
    }
  }

  const state = value ? verificationState(value.sha256, value.expectedSha256) : 'unverified'
  const expectedInvalid =
    value?.expectedSha256 !== null &&
    value?.expectedSha256 !== undefined &&
    !SHA256_HEX_RE.test(value.expectedSha256)

  // Derived: is a flash safe to start given the current local-firmware state?
  const ready =
    value === null
      ? true
      : state === 'verified'
        ? true
        : state === 'unverified'
          ? confirmedUnverified
          : false

  // Notify the parent whenever readiness changes. Store the callback in a
  // ref so we re-fire only when `ready` flips, not on every parent re-render.
  const onReadinessChangeRef = useRef(onReadinessChange)
  useEffect(() => {
    onReadinessChangeRef.current = onReadinessChange
  })
  useEffect(() => {
    onReadinessChangeRef.current?.(ready)
  }, [ready])

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

  // `<details>` fires `toggle` after the user clicks `<summary>`. We mirror
  // the open state into React so we can force-open it when a firmware is
  // loaded (#116) while still respecting manual close attempts.
  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    setUserToggledOpen(event.currentTarget.open)
  }

  const detailsOpen = value !== null || userToggledOpen

  return (
    <details
      open={detailsOpen}
      onToggle={handleToggle}
      className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim"
    >
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
          // #117 (UX-10): the file input is visually hidden but keyboard-
          // focusable. Tailwind's `peer` modifier on the sibling input gives
          // the dropzone a visible focus ring when the input is focused via
          // keyboard. Mouse clicks still toggle the input via `htmlFor`.
          <>
            <input
              ref={firmwareInputRef}
              id={firmwareInputId}
              type="file"
              accept=".bin,application/octet-stream"
              className="peer sr-only"
              onChange={(e) => {
                void handleFirmwareFile(e)
              }}
            />
            <label
              htmlFor={firmwareInputId}
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border bg-surface px-3 py-4 text-center text-text-dim hover:border-status-danger hover:text-text peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg"
            >
              <span>Click to choose a .bin firmware file</span>
              <span className="text-xs text-text-muted">Max 16 MiB</span>
            </label>
          </>
        )}

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
              <div className="space-y-2">
                <p className="text-xs text-text-muted">
                  No checksum provided — flashing unverified bytes is your responsibility.
                </p>
                <label
                  htmlFor={confirmId}
                  className="inline-flex cursor-pointer items-start gap-2 text-xs text-text-dim hover:text-text"
                >
                  <input
                    id={confirmId}
                    type="checkbox"
                    checked={confirmedUnverified}
                    onChange={(e) => {
                      setConfirmedUnverified(e.target.checked)
                    }}
                    className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-border bg-surface focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span>
                    I understand the firmware is unverified and accept the risk.
                  </span>
                </label>
              </div>
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
