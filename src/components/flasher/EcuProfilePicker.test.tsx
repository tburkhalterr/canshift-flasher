// src/components/flasher/EcuProfilePicker.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EcuProfilePicker } from './EcuProfilePicker'

const INDEX_FIXTURE = [
  {
    slug: 'maxxecu',
    name: 'MaxxECU MTune',
    vendor: 'MaxxECU',
    canSpeedKbps: 500,
    signalCount: 1,
    description: 'MaxxECU baseline.',
  },
  {
    slug: 'blank',
    name: 'Skip — push my own profile via Studio',
    vendor: '—',
    canSpeedKbps: 500,
    signalCount: 0,
    description: 'Empty profile.',
  },
]

const SIGNALS_FIXTURE = {
  version: '1.0.0',
  protocol: 'custom_v1.0',
  canSpeedKbps: 500,
  signals: [
    {
      name: 'rpm',
      canFrameId: '0x370',
      startByte: 0,
      byteLength: 2,
      bigEndian: true,
      signed: false,
      scale: 1.0,
      offset: 0.0,
      unit: 'rpm',
      min: 0,
      max: 8000,
      timeoutMs: 500,
    },
  ],
}

const installFetchMock = (): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/profiles/index.json')) {
        return new Response(JSON.stringify(INDEX_FIXTURE), { status: 200 })
      }
      if (url.endsWith('/profiles/maxxecu.json')) {
        return new Response(JSON.stringify(SIGNALS_FIXTURE), { status: 200 })
      }
      if (url.endsWith('/profiles/blank.json')) {
        return new Response(
          JSON.stringify({ ...SIGNALS_FIXTURE, signals: [] }),
          { status: 200 },
        )
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

describe('EcuProfilePicker', () => {
  beforeEach(() => {
    installFetchMock()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders all entries from the index after mount', async () => {
    render(<EcuProfilePicker selectedSlug={null} onChange={() => {}} />)

    await waitFor(() => {
      // The placeholder option is rendered before fetch resolves; once the
      // index lands we expect the real entries to be present.
      expect(
        screen.getByRole('option', { name: /MaxxECU MTune/ }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('option', { name: /Skip — push my own profile/ }),
    ).toBeInTheDocument()
  })

  it('calls onChange with the resolved profile when the user picks an entry', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<EcuProfilePicker selectedSlug={null} onChange={onChange} />)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /MaxxECU MTune/ }),
      ).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/ECU profile/), 'maxxecu')

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        slug: 'maxxecu',
        name: 'MaxxECU MTune',
        signals: expect.objectContaining({
          version: '1.0.0',
          canSpeedKbps: 500,
          signals: expect.arrayContaining([
            expect.objectContaining({ name: 'rpm' }),
          ]),
        }),
      })
    })
  })

  it('renders the description of the selected entry', async () => {
    render(
      <EcuProfilePicker
        selectedSlug="maxxecu"
        onChange={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('MaxxECU baseline.')).toBeInTheDocument()
    })
  })

  it('surfaces a fetch failure inline via role=alert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (): Promise<Response> => new Response('boom', { status: 500 })),
    )

    render(<EcuProfilePicker selectedSlug={null} onChange={() => {}} />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
