// src/hooks/useHelp.test.tsx
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HelpProvider, useHelp, type HelpContextValue } from './useHelp'

describe('useHelp', () => {
  it('throws when used outside <HelpProvider>', () => {
    expect(() => renderHook(() => useHelp())).toThrow(/HelpProvider/)
  })

  it('returns the context value when wrapped in <HelpProvider>', () => {
    const value: HelpContextValue = {
      open: () => {},
      close: () => {},
    }
    const { result } = renderHook(() => useHelp(), {
      wrapper: ({ children }) => <HelpProvider value={value}>{children}</HelpProvider>,
    })
    expect(result.current).toBe(value)
  })
})
