// src/components/flasher/LocalFirmwareInput.test.tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type LocalFirmware } from '../../lib/local-firmware'

import { LocalFirmwareInput } from './LocalFirmwareInput'

// Canonical 64-char hex digest (SHA-256 of "hello world").
const COMPUTED_SHA = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
const OTHER_SHA = 'a' + COMPUTED_SHA.slice(1)

const buildFirmware = (overrides: Partial<LocalFirmware> = {}): LocalFirmware => ({
  name: 'fw.bin',
  bytes: new Uint8Array([1, 2, 3, 4]),
  sha256: COMPUTED_SHA,
  expectedSha256: null,
  ...overrides,
})

// Lightweight harness — many of the asserts care about readiness flips, so
// expose the boolean directly in the DOM via a test id.
const Harness = ({
  initialValue,
  onReady,
}: {
  initialValue: LocalFirmware | null
  onReady?: (ready: boolean) => void
}): ReactElement => {
  const [value, setValue] = useState<LocalFirmware | null>(initialValue)
  const [ready, setReady] = useState(true)
  return (
    <div>
      <span data-testid="ready">{ready ? 'ready' : 'blocked'}</span>
      <LocalFirmwareInput
        value={value}
        onChange={setValue}
        onReadinessChange={(next) => {
          setReady(next)
          onReady?.(next)
        }}
      />
    </div>
  )
}

describe('LocalFirmwareInput', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports ready=true when no firmware is loaded', () => {
    render(<Harness initialValue={null} />)
    expect(screen.getByTestId('ready')).toHaveTextContent('ready')
  })

  it('reports ready=true with a verified checksum', () => {
    render(
      <Harness
        initialValue={buildFirmware({ expectedSha256: COMPUTED_SHA })}
      />,
    )
    expect(screen.getByTestId('ready')).toHaveTextContent('ready')
    expect(screen.getByRole('status')).toHaveTextContent(/Verified/)
  })

  it('reports ready=true regardless of letter case in the expected SHA', () => {
    render(
      <Harness
        initialValue={buildFirmware({ expectedSha256: COMPUTED_SHA.toUpperCase() })}
      />,
    )
    expect(screen.getByTestId('ready')).toHaveTextContent('ready')
  })

  it('blocks readiness on SHA mismatch with no override', async () => {
    render(
      <Harness
        initialValue={buildFirmware({ expectedSha256: OTHER_SHA })}
      />,
    )
    expect(screen.getByTestId('ready')).toHaveTextContent('blocked')
    expect(screen.getByRole('alert')).toHaveTextContent(/Mismatch/)
    // The confirmation checkbox must not be shown for the mismatch path.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('blocks readiness when unverified and unconfirmed', () => {
    render(<Harness initialValue={buildFirmware()} />)
    expect(screen.getByTestId('ready')).toHaveTextContent('blocked')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('unblocks readiness once the user confirms the unverified risk', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue={buildFirmware()} />)

    expect(screen.getByTestId('ready')).toHaveTextContent('blocked')

    await user.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByTestId('ready')).toHaveTextContent('ready')

    // Unchecking re-blocks the flash.
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByTestId('ready')).toHaveTextContent('blocked')
  })

  it('resets confirmation when the firmware is removed', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue={buildFirmware()} />)

    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByTestId('ready')).toHaveTextContent('ready')

    await user.click(screen.getByRole('button', { name: /Remove/ }))

    // Firmware is gone — readiness returns to its "no gate" default.
    expect(screen.getByTestId('ready')).toHaveTextContent('ready')

    // No checkbox while no firmware is loaded.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('keeps the details panel open once a firmware is loaded (#116)', () => {
    const { container } = render(
      <Harness initialValue={buildFirmware()} />,
    )
    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(true)
  })

  it('starts collapsed when no firmware is loaded', () => {
    const { container } = render(<Harness initialValue={null} />)
    const details = container.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('shows the dropzone label with a peer-focus ring class (#117)', () => {
    render(<Harness initialValue={null} />)
    const label = screen.getByText(/Click to choose a .bin firmware file/).closest('label')
    expect(label).not.toBeNull()
    // The class names are what give the dropzone its keyboard-focus ring —
    // assert the contract so the affordance is not silently regressed.
    expect(label?.className).toContain('peer-focus-visible:ring-2')
    expect(label?.className).toContain('peer-focus-visible:ring-ring')
  })

  it('flips readiness back to blocked when an expected hash is added that mismatches', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue={buildFirmware()} />)

    // First confirm the unverified risk so readiness is true.
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByTestId('ready')).toHaveTextContent('ready')

    // Then paste a mismatching expected SHA — readiness must flip to blocked
    // and the confirmation override must disappear.
    const expectedInput = screen.getByPlaceholderText(/64 hex chars/)
    await user.type(expectedInput, OTHER_SHA)

    expect(screen.getByTestId('ready')).toHaveTextContent('blocked')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/Mismatch/)
  })

  it('does not call onReadinessChange more than necessary', () => {
    const onReady = vi.fn()
    render(<Harness initialValue={null} onReady={onReady} />)
    // Mount fires once with the initial `true`. Subsequent re-renders without
    // state changes must not re-fire.
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onReady).toHaveBeenLastCalledWith(true)
  })

  it('forwards readiness flips through the ref-cached callback', () => {
    const onReady = vi.fn()
    const { rerender } = render(
      <Harness initialValue={null} onReady={onReady} />,
    )
    rerender(<Harness initialValue={null} onReady={onReady} />)
    // Re-rendering with the same props must not re-trigger the notifier.
    // (The act below is purely to flush effects; no state change is expected.)
    act(() => {})
    expect(onReady).toHaveBeenCalledTimes(1)
  })
})
