// src/hooks/useHelp.ts
import { createContext, useContext } from 'react'

import type { HelpTopicId } from '../components/help-topics'

/**
 * Imperative API for the troubleshooting drawer. State lives in `App` so the
 * drawer (`HelpZone`) can be opened programmatically from any descendant —
 * e.g. `FailedView` linking an `errorClass` to the matching help topic.
 *
 * `open(topicId?)` opens the drawer and, if provided, pre-selects the topic.
 * `close()` collapses the drawer.
 */
export interface HelpContextValue {
  open: (topicId?: HelpTopicId) => void
  close: () => void
}

const HelpContext = createContext<HelpContextValue | null>(null)

export const HelpProvider = HelpContext.Provider

/**
 * Subscribe to the drawer API. Throws when used outside `<HelpProvider>` —
 * silent no-ops would mask wiring bugs in nested subtrees.
 */
export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext)
  if (ctx === null) {
    throw new Error('useHelp() must be used inside <HelpProvider>')
  }
  return ctx
}
