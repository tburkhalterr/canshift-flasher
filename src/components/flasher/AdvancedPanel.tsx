// src/components/flasher/AdvancedPanel.tsx
import { useEffect, useState, type ChangeEvent, type ReactElement } from 'react'

import { ADVANCED_BAUD_OPTIONS, type AdvancedBaudRate } from '../../constants'
import type { AdvancedOptions } from '../../hooks/useFlasher'
import { fetchRecentReleases, type RecentRelease } from '../../lib/releases'

interface AdvancedPanelProps {
  value: AdvancedOptions
  onChange: (opts: AdvancedOptions) => void
}

/** Sentinel value for the `Other tag…` option — toggles the free-form input. */
const OTHER_TAG_SENTINEL = '__other__'

/** Number of recent releases to surface in the dropdown. */
const RECENT_RELEASES_LIMIT = 10

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; releases: RecentRelease[] }
  | { kind: 'error' }

const formatReleaseLabel = (release: RecentRelease): string => {
  const date = release.publishedAt.slice(0, 10)
  const suffix = release.prerelease ? ' (pre-release)' : ''
  return `${release.tag} (${date})${suffix}`
}

const SELECT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-60'

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring'

export const AdvancedPanel = ({ value, onChange }: AdvancedPanelProps): ReactElement => {
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'loading' })
  // Sticky toggle: once the user picks `Other tag…`, keep showing the
  // text input even if they later clear the value.
  const [useFallbackInput, setUseFallbackInput] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchRecentReleases(RECENT_RELEASES_LIMIT)
      .then((releases) => {
        if (cancelled) return
        setFetchState({ kind: 'ready', releases })
      })
      .catch(() => {
        if (cancelled) return
        setFetchState({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleErase = (e: ChangeEvent<HTMLInputElement>): void => {
    onChange({ ...value, fullErase: e.target.checked })
  }
  const handleBaud = (e: ChangeEvent<HTMLSelectElement>): void => {
    const parsed = Number.parseInt(e.target.value, 10) as AdvancedBaudRate
    onChange({ ...value, baudRate: parsed })
  }

  const handleVersionSelect = (e: ChangeEvent<HTMLSelectElement>): void => {
    const next = e.target.value
    if (next === OTHER_TAG_SENTINEL) {
      setUseFallbackInput(true)
      onChange({ ...value, versionOverride: null })
      return
    }
    setUseFallbackInput(false)
    onChange({ ...value, versionOverride: next === '' ? null : next })
  }

  const handleVersionInput = (e: ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value
    const trimmed = raw.trim()
    onChange({ ...value, versionOverride: trimmed.length === 0 ? null : raw })
  }

  const renderVersionControl = (): ReactElement => {
    if (fetchState.kind === 'loading') {
      return (
        <select disabled className={SELECT_CLASSES} aria-label="Version override">
          <option>Loading…</option>
        </select>
      )
    }

    if (fetchState.kind === 'error') {
      return (
        <input
          type="text"
          value={value.versionOverride ?? ''}
          onChange={handleVersionInput}
          placeholder="Couldn't load tags — type one"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Version override"
          className={INPUT_CLASSES}
        />
      )
    }

    const { releases } = fetchState
    const currentTag = value.versionOverride ?? ''
    const tagIsInList = releases.some((r) => r.tag === currentTag)
    // Show the text input when the user explicitly chose `Other tag…`, or
    // when the active override doesn't match a tag in the recent list
    // (e.g. carry-over from a previous session, older version).
    const showFallback = useFallbackInput || (currentTag !== '' && !tagIsInList)

    const selectValue = showFallback ? OTHER_TAG_SENTINEL : currentTag

    return (
      <div className="flex flex-col gap-2">
        <select
          value={selectValue}
          onChange={handleVersionSelect}
          aria-label="Version override"
          className={SELECT_CLASSES}
        >
          <option value="">(latest stable)</option>
          {releases.map((r) => (
            <option key={r.tag} value={r.tag}>
              {formatReleaseLabel(r)}
            </option>
          ))}
          <option value={OTHER_TAG_SENTINEL}>Other tag…</option>
        </select>
        {showFallback ? (
          <input
            type="text"
            value={value.versionOverride ?? ''}
            onChange={handleVersionInput}
            placeholder="e.g. v0.8.0"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Custom version tag"
            className={INPUT_CLASSES}
          />
        ) : null}
      </div>
    )
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

        <div className="flex flex-col gap-1 text-sm text-text-dim">
          <span>Version override</span>
          {renderVersionControl()}
          <span className="text-xs text-text-muted">Leave on (latest stable) for normal flashing.</span>
        </div>

        <p className="text-xs text-text-muted">
          These are recovery tools. Leave defaults for normal flashing.
        </p>
      </div>
    </details>
  )
}
