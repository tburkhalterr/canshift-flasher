// src/components/flasher/FailedView.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ErrorClass } from '../../hooks/useFlasher'
import { HelpProvider, type HelpContextValue } from '../../hooks/useHelp'

import { FailedView } from './FailedView'

const renderWithHelp = (
  ctx: HelpContextValue,
  errorClass: ErrorClass | null,
): void => {
  render(
    <HelpProvider value={ctx}>
      <FailedView
        errorMessage="boom"
        errorClass={errorClass}
        onRetry={() => {}}
        onReset={() => {}}
        onReselectPort={() => {}}
        log=""
        chipInfo={null}
        port={null}
        release={null}
        logTruncated={false}
      />
    </HelpProvider>,
  )
}

describe('FailedView troubleshooting link', () => {
  it('renders a "See troubleshooting" link for flash-id-ffffff and opens the matching topic', async () => {
    const open = vi.fn()
    const close = vi.fn()
    renderWithHelp({ open, close }, 'flash-id-ffffff')

    const link = screen.getByRole('button', { name: /See troubleshooting: "Flash ID is ffffff"/ })
    await userEvent.click(link)
    expect(open).toHaveBeenCalledWith('flash-id-ffffff')
  })

  it('maps sync-failed to the enter-bootloader topic', async () => {
    const open = vi.fn()
    renderWithHelp({ open, close: vi.fn() }, 'sync-failed')
    const link = screen.getByRole('button', { name: /See troubleshooting: "Could not enter ESP32 bootloader"/ })
    await userEvent.click(link)
    expect(open).toHaveBeenCalledWith('enter-bootloader')
  })

  it('maps sha256-mismatch to the sha-mismatch topic', async () => {
    const open = vi.fn()
    renderWithHelp({ open, close: vi.fn() }, 'sha256-mismatch')
    const link = screen.getByRole('button', { name: /See troubleshooting: "SHA-256 mismatch"/ })
    await userEvent.click(link)
    expect(open).toHaveBeenCalledWith('sha-mismatch')
  })

  it('maps disconnect to the enter-bootloader topic', async () => {
    const open = vi.fn()
    renderWithHelp({ open, close: vi.fn() }, 'disconnect')
    const link = screen.getByRole('button', { name: /See troubleshooting:/ })
    await userEvent.click(link)
    expect(open).toHaveBeenCalledWith('enter-bootloader')
  })

  it('omits the link when errorClass is null', () => {
    renderWithHelp({ open: vi.fn(), close: vi.fn() }, null)
    expect(screen.queryByRole('button', { name: /See troubleshooting/ })).toBeNull()
  })

  it('omits the link for buckets without a clean topic match (http, cancelled, unknown)', () => {
    for (const errorClass of ['http', 'cancelled', 'unknown'] as const) {
      const { unmount } = render(
        <HelpProvider value={{ open: vi.fn(), close: vi.fn() }}>
          <FailedView
            errorMessage="boom"
            errorClass={errorClass}
            onRetry={() => {}}
            onReset={() => {}}
            onReselectPort={() => {}}
            log=""
            chipInfo={null}
            port={null}
            release={null}
            logTruncated={false}
          />
        </HelpProvider>,
      )
      expect(screen.queryByRole('button', { name: /See troubleshooting/ })).toBeNull()
      unmount()
    }
  })
})
