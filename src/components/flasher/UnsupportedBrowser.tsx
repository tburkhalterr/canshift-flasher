// src/components/flasher/UnsupportedBrowser.tsx
import type { ReactElement } from 'react'

import { SECTION_HEADER_CLASSES } from './styles'

export const UnsupportedBrowser = (): ReactElement => {
  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-md border border-status-danger/60 bg-status-danger-dim px-5 py-5">
        <h2 className={SECTION_HEADER_CLASSES}>Chromium browser required</h2>
        <p className="text-sm leading-relaxed text-text-dim">
          This flasher uses Web Serial, which is only available in Chromium-based browsers:
          Chrome, Edge, Brave, Arc, Opera. Safari and Firefox do not implement the spec.
        </p>
        <p className="text-sm leading-relaxed text-text-muted">
          Re-open this page in one of the browsers above to continue.
        </p>
      </div>
    </section>
  )
}
