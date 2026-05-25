// src/components/LogStream.tsx
import { useEffect, useRef, type ReactElement } from 'react'

interface LogStreamProps {
  log: string
}

export function LogStream({ log }: LogStreamProps): ReactElement {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [log])

  return (
    <pre
      ref={ref}
      aria-live="polite"
      aria-atomic="false"
      className="h-48 w-full overflow-auto rounded-md border border-border bg-scrim p-3 font-mono text-xs leading-relaxed text-text-dim"
    >
      {log || '(waiting...)'}
    </pre>
  )
}
