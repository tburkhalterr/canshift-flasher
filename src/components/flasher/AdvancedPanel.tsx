// src/components/flasher/AdvancedPanel.tsx
import type { ChangeEvent, ReactElement } from 'react'

import type { AdvancedOptions } from '../../hooks/useFlasher'

interface AdvancedPanelProps {
  value: AdvancedOptions
  onChange: (opts: AdvancedOptions) => void
}

export const AdvancedPanel = ({ value, onChange }: AdvancedPanelProps): ReactElement => {
  const handleErase = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange({ ...value, fullErase: e.target.checked })
  }

  return (
    <details className="rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
      <summary className="cursor-pointer select-none font-display text-sm font-semibold tracking-wide text-text">
        Advanced (recovery)
      </summary>
      <div className="mt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm text-text-dim">
          <input
            type="checkbox"
            checked={value.fullErase}
            onChange={handleErase}
            className="h-4 w-4 rounded border-border bg-surface text-status-danger focus:ring-ring"
          />
          <span>Full erase before flash</span>
        </label>
        <p className="text-xs text-text-muted">
          Recovery option — leave unchecked for normal updates.
        </p>
      </div>
    </details>
  )
}
