// src/components/flasher/EcuProfilePicker.tsx
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react'

import {
  loadProfileIndex,
  loadProfileSignals,
  type SelectedEcuProfile,
} from '../../lib/profiles/catalog'
import { type ProfileIndexEntry } from '../../lib/profiles/schema'
import { isSimEnabled } from '../../lib/sim'

interface EcuProfilePickerProps {
  selectedSlug: string | null
  onChange: (profile: SelectedEcuProfile | null) => void
}

const SELECT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-wait disabled:opacity-60'

/**
 * Default slug auto-selected in sim mode so the Playwright suite (and
 * `?sim=success` exploration) doesn't have to interact with the picker
 * before the flash flow proceeds. Picks the empty profile so it's a no-op
 * for any signal-aware assertions.
 */
const SIM_DEFAULT_SLUG = 'blank'

export const EcuProfilePicker = ({
  selectedSlug,
  onChange,
}: EcuProfilePickerProps): ReactElement => {
  const [entries, setEntries] = useState<ProfileIndexEntry[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState<boolean>(false)
  // Track whether the sim-mode auto-pick has already fired so a re-render
  // (e.g. after the parent state update) doesn't loop forever.
  const autoPickedRef = useRef<boolean>(false)

  useEffect(() => {
    const controller = new AbortController()
    loadProfileIndex(controller.signal)
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
    async (slug: string, entriesSnapshot: ProfileIndexEntry[]): Promise<void> => {
      const entry = entriesSnapshot.find((e) => e.slug === slug)
      if (!entry) {
        onChange(null)
        return
      }
      setProfileLoading(true)
      try {
        const signals = await loadProfileSignals(slug)
        onChange({ slug: entry.slug, name: entry.name, signals })
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        onChange(null)
      } finally {
        setProfileLoading(false)
      }
    },
    [onChange],
  )

  // Sim mode: auto-pick the default profile once the index has loaded so the
  // e2e flow can complete without manual interaction. The real picker stays
  // unblocked because `onChange` is the only side effect. Defer the call to
  // a microtask so the effect body itself never triggers a setState (the
  // react-hooks/set-state-in-effect rule).
  useEffect(() => {
    if (!isSimEnabled()) return
    if (autoPickedRef.current) return
    if (loading || entries.length === 0) return
    if (selectedSlug !== null) {
      autoPickedRef.current = true
      return
    }
    const slug = entries.find((e) => e.slug === SIM_DEFAULT_SLUG)?.slug ?? entries[0]?.slug
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
      <label htmlFor="ecu-profile-picker" className="flex flex-col gap-1 text-sm text-text-dim">
        <span className="font-medium text-text">ECU profile</span>
        <span className="text-xs text-text-muted">
          Picks the signals.json the dash will decode. You can change it later in Studio.
        </span>
        <select
          id="ecu-profile-picker"
          value={selectedSlug ?? ''}
          onChange={handleChange}
          className={SELECT_CLASSES}
          disabled={loading || profileLoading}
          aria-label="ECU profile"
        >
          <option value="">
            {loading ? 'Loading profiles…' : 'Choose your ECU…'}
          </option>
          {entries.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.name} · {entry.vendor} · {String(entry.signalCount)} signals
            </option>
          ))}
        </select>
      </label>

      {selectedEntry ? (
        <p className="text-xs text-text-muted">{selectedEntry.description}</p>
      ) : null}

      {error ? (
        <p className="text-xs text-status-danger" role="alert">
          {`Couldn't load profile catalog — ${error}`}
        </p>
      ) : null}
    </div>
  )
}
