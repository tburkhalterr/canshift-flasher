// src/components/flasher/ReleaseSummary.tsx
import type { ReactElement } from 'react'

import { formatPublishedDate } from '../../lib/format'
import type { Release } from '../../lib/releases'

interface ReleaseSummaryProps {
  release: Release
}

export const ReleaseSummary = ({ release }: ReleaseSummaryProps): ReactElement => {
  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-dim">
      <div>
        Latest: <span className="font-mono text-text">v{release.version}</span>
        <span className="text-text-dim">
          {' '}
          (published {formatPublishedDate(release.publishedAt)})
        </span>
      </div>
      {release.notes.trim().length > 0 ? (
        <details className="text-sm text-text-dim">
          <summary className="cursor-pointer">Release notes</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-text-dim">
            {release.notes}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
