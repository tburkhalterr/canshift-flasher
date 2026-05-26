// src/components/flasher/AdvancedPanel.tsx
import type { ChangeEvent, ReactElement } from 'react'

import { ADVANCED_BAUD_OPTIONS, type AdvancedBaudRate } from '../../constants'
import type { AdvancedOptions } from '../../hooks/useFlasher'

interface AdvancedPanelProps {
  value: AdvancedOptions
  onChange: (opts: AdvancedOptions) => void
}

export const AdvancedPanel = ({ value, onChange }: AdvancedPanelProps): ReactElement => {
  const handleErase = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange({ ...value, fullErase: e.target.checked })
  }
  const handleBaud = (e: ChangeEvent<HTMLSelectElement>): void => {
    const parsed = Number.parseInt(e.target.value, 10) as AdvancedBaudRate
    onChange({ ...value, baudRate: parsed })
  }
  const handleVersion = (e: ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value
    const trimmed = raw.trim()
    onChange({ ...value, versionOverride: trimmed.length === 0 ? null : raw })
  }
  return (
    <details className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
      <summary className="cursor-pointer select-none font-display text-sm font-semibold tracking-wide text-text">
        Advanced (recovery)
      </summary>
      <div className="mt-3 space-y-4">
        <label className="flex items-center gap-2 text-sm text-text-dim">
          <input
            type="checkbox"
            checked={value.fullErase}
            onChange={handleErase}
            className="h-4 w-4 rounded border-border bg-surface text-status-danger focus:ring-ring"
          />
          <span>Full erase before flash</span>
        </label>

        <label className="flex flex-col gap-1 text-sm text-text-dim">
          <span>Baud rate</span>
          <select
            value={value.baudRate}
            onChange={handleBaud}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ADVANCED_BAUD_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b.toLocaleString('en-US')}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-text-dim">
          <span>Version override</span>
          <input
            type="text"
            value={value.versionOverride ?? ''}
            onChange={handleVersion}
            placeholder="e.g. v0.10.0"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-text-muted">Leave blank to use latest.</span>
        </label>

        <p className="text-xs text-text-muted">
          These are recovery tools. Leave defaults for normal flashing.
        </p>
      </div>
    </details>
  )
}
