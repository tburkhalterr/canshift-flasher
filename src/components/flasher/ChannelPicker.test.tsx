// src/components/flasher/ChannelPicker.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RecentRelease } from '../../lib/releases'

import { ChannelPicker } from './ChannelPicker'

const RELEASES: RecentRelease[] = [
  { tag: 'v1.2.0', publishedAt: '2026-05-20T12:00:00Z', prerelease: false },
  { tag: 'v1.1.0', publishedAt: '2026-04-10T12:00:00Z', prerelease: false },
  { tag: 'v1.0.0', publishedAt: '2026-03-01T12:00:00Z', prerelease: false },
]

describe('ChannelPicker', () => {
  // UX-11
  it('disables the channel select while loading', () => {
    render(
      <ChannelPicker
        channel="stable"
        onChannelChange={() => {}}
        releases={[]}
        selectedTag=""
        onVersionChange={() => {}}
        loading={true}
        error={null}
      />,
    )

    expect(screen.getByLabelText(/Release channel/)).toBeDisabled()
    expect(screen.getByLabelText(/Firmware version/)).toBeDisabled()
  })

  it('shows the "Loading releases…" hint next to the channel label while loading', () => {
    render(
      <ChannelPicker
        channel="stable"
        onChannelChange={() => {}}
        releases={[]}
        selectedTag=""
        onVersionChange={() => {}}
        loading={true}
        error={null}
      />,
    )

    expect(screen.getByText(/Loading releases…/)).toBeInTheDocument()
  })

  it('enables the channel select once loading completes', () => {
    render(
      <ChannelPicker
        channel="stable"
        onChannelChange={() => {}}
        releases={RELEASES}
        selectedTag=""
        onVersionChange={() => {}}
        loading={false}
        error={null}
      />,
    )

    expect(screen.getByLabelText(/Release channel/)).not.toBeDisabled()
  })

  // UX-14
  it('renders the latest release only once (as the "Latest (vX.Y.Z)" option)', () => {
    render(
      <ChannelPicker
        channel="stable"
        onChannelChange={() => {}}
        releases={RELEASES}
        selectedTag=""
        onVersionChange={() => {}}
        loading={false}
        error={null}
      />,
    )

    expect(
      screen.getByRole('option', { name: /Latest \(v1\.2\.0\)/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^v1\.2\.0 ·/ })).toBeNull()
    expect(
      screen.getByRole('option', { name: /^v1\.1\.0 ·/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: /^v1\.0\.0 ·/ }),
    ).toBeInTheDocument()
  })

  it('passes through an older-tag selection unchanged', async () => {
    const onVersionChange = vi.fn()
    const user = userEvent.setup()

    render(
      <ChannelPicker
        channel="stable"
        onChannelChange={() => {}}
        releases={RELEASES}
        selectedTag=""
        onVersionChange={onVersionChange}
        loading={false}
        error={null}
      />,
    )

    await user.selectOptions(screen.getByLabelText(/Firmware version/), 'v1.1.0')
    expect(onVersionChange).toHaveBeenLastCalledWith('v1.1.0')
  })

  it('collapses a programmatic selection of the latest tag to ""', () => {
    // Defence-in-depth for the handler: if any caller path emits the literal
    // latest tag (e.g. a legacy URL `?version=v1.2.0` that already matches the
    // newest release), the handler must normalise it to the no-override
    // sentinel so reloads don't carry a redundant override.
    const onVersionChange = vi.fn()

    render(
      <ChannelPicker
        channel="stable"
        onChannelChange={() => {}}
        releases={RELEASES}
        selectedTag=""
        onVersionChange={onVersionChange}
        loading={false}
        error={null}
      />,
    )

    const select = screen.getByLabelText(/Firmware version/) as HTMLSelectElement
    const synthetic = document.createElement('option')
    synthetic.value = 'v1.2.0'
    synthetic.textContent = 'v1.2.0'
    select.appendChild(synthetic)
    select.value = 'v1.2.0'
    select.dispatchEvent(new Event('change', { bubbles: true }))

    expect(onVersionChange).toHaveBeenCalledWith('')
  })
})
