// src/components/flasher/ErrorBanner.tsx
import type { ReactElement } from 'react'

interface ErrorBannerProps {
  message: string
}

export const ErrorBanner = ({ message }: ErrorBannerProps): ReactElement => {
  return (
    <div className="rounded-md border border-status-danger/60 bg-status-danger-dim px-4 py-3 text-sm text-text">
      {message}
    </div>
  )
}
