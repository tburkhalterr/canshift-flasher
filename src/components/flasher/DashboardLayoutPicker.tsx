// src/components/flasher/DashboardLayoutPicker.tsx
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react'

import {
  loadDashboardConfig,
  loadDashboardIndex,
  type SelectedDashboardLayout,
} from '../../lib/dashboards/catalog'
import { type DashboardIndexEntry } from '../../lib/dashboards/schema'
import { isSimEnabled } from '../../lib/sim'

interface DashboardLayoutPickerProps {
  selectedSlug: string | null
  onChange: (layout: SelectedDashboardLayout | null) => void
}

const SELECT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-60'

/**
 * In sim mode, auto-pick the first non-`blank` entry so the Playwright suite
 * (and `?sim=success` exploration) doesn't need manual interaction before the
 * flash flow proceeds. Falls back to whatever the index lists first.
 */
const pickSimDefaultSlug = (entries: DashboardIndexEntry[]): string | null => {
  const nonBlank = entries.find((e) => e.slug !== 'blank')
  return nonBlank?.slug ?? entries[0]?.slug ?? null
}

export const DashboardLayoutPicker = ({
  selectedSlug,
  onChange,
}: DashboardLayoutPickerProps): ReactElement => {
  const [entries, setEntries] = useState<DashboardIndexEntry[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [configLoading, setConfigLoading] = useState<boolean>(false)
  // Track whether the sim-mode auto-pick has already fired so a re-render
  // doesn't loop forever.
  const autoPickedRef = useRef<boolean>(false)

  useEffect(() => {
    const controller = new AbortController()
    loadDashboardIndex(controller.signal)
      .then((list) => {
        setEntries(list)
        setError(null)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
      })
      .finally(() => {
        setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [])

  const selectSlug = useCallback(
    async (slug: string, entriesSnapshot: DashboardIndexEntry[]): Promise<void> => {
      const entry = entriesSnapshot.find((e) => e.slug === slug)
      if (!entry) {
        onChange(null)
        return
      }
      setConfigLoading(true)
      try {
        const config = await loadDashboardConfig(slug)
        onChange({ slug: entry.slug, name: entry.name, config })
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        onChange(null)
      } finally {
        setConfigLoading(false)
      }
    },
    [onChange],
  )

  // Sim mode: auto-pick a sensible default once the index has loaded.
  useEffect(() => {
    if (!isSimEnabled()) return
    if (autoPickedRef.current) return
    if (loading || entries.length === 0) return
    if (selectedSlug !== null) {
      autoPickedRef.current = true
      return
    }
    const slug = pickSimDefaultSlug(entries)
    if (!slug) return
    autoPickedRef.current = true
    queueMicrotask(() => {
      void selectSlug(slug, entries)
    })
  }, [loading, entries, selectedSlug, selectSlug])

  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const slug = event.target.value
    if (slug === '') {
      onChange(null)
      return
    }
    void selectSlug(slug, entries)
  }

  const selectedEntry = selectedSlug
    ? entries.find((e) => e.slug === selectedSlug) ?? null
    : null

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-2 px-4 py-3">
      <label htmlFor="dashboard-layout-picker" className="flex flex-col gap-1 text-sm text-text-dim">
        <span className="font-medium text-text">Dashboard layout</span>
        <span className="text-xs text-text-muted">
          Picks the starting dashboard.json the dash boots with. You can redesign it later in
          Studio.
        </span>
        <select
          id="dashboard-layout-picker"
          value={selectedSlug ?? ''}
          onChange={handleChange}
          className={SELECT_CLASSES}
          disabled={loading || configLoading}
          aria-label="Dashboard layout"
        >
          <option value="">
            {loading ? 'Loading layouts…' : 'Choose your dashboard…'}
          </option>
          {entries.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.name} · {String(entry.widgetCount)} widgets
            </option>
          ))}
        </select>
      </label>

      {selectedEntry ? (
        <p className="text-xs text-text-muted">{selectedEntry.description}</p>
      ) : null}

      {error ? (
        <p className="text-xs text-status-danger" role="alert">
          {`Couldn't load dashboard catalog — ${error}`}
        </p>
      ) : null}
    </div>
  )
}
