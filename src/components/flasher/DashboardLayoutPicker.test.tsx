// src/components/flasher/DashboardLayoutPicker.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardLayoutPicker } from './DashboardLayoutPicker'

const INDEX_FIXTURE = [
  {
    slug: 'blank',
    name: 'Skip — push my own layout via Studio',
    pagesCount: 1,
    widgetCount: 0,
    recommendedFor: 'Anyone designing in Studio.',
    description: 'Start fresh — build it in Studio',
  },
  {
    slug: 'track-day',
    name: 'Track Day',
    pagesCount: 1,
    widgetCount: 6,
    recommendedFor: 'Track drivers.',
    description: 'Lap timer + gear + fluids.',
  },
]

const TRACK_FIXTURE = {
  _comment: 'fixture',
  version: '1.0.0',
  name: 'Track Day',
  description: 'fixture',
  defaultPageId: 'track',
  revLimitRpm: 7200,
  topBar: {
    height: 16,
    bgColor: '#0D0D0D',
    textColor: '#AAAAAA',
    layout: [],
  },
  pages: [
    {
      id: 'track',
      backgroundImage: null,
      backgroundColor: '#000000',
      showTopBar: true,
      widgets: [],
    },
  ],
}

const BLANK_FIXTURE = {
  ...TRACK_FIXTURE,
  name: 'Blank',
  defaultPageId: 'blank',
  pages: [
    {
      id: 'blank',
      backgroundImage: null,
      backgroundColor: '#000000',
      showTopBar: true,
      widgets: [],
    },
  ],
}

const installFetchMock = (): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/dashboards/index.json')) {
        return new Response(JSON.stringify(INDEX_FIXTURE), { status: 200 })
      }
      if (url.endsWith('/dashboards/track-day.json')) {
        return new Response(JSON.stringify(TRACK_FIXTURE), { status: 200 })
      }
      if (url.endsWith('/dashboards/blank.json')) {
        return new Response(JSON.stringify(BLANK_FIXTURE), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

describe('DashboardLayoutPicker', () => {
  beforeEach(() => {
    installFetchMock()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders all entries from the index after mount', async () => {
    render(<DashboardLayoutPicker selectedSlug={null} onChange={() => {}} />)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Track Day/ })).toBeInTheDocument()
    })
    expect(
      screen.getByRole('option', { name: /Skip — push my own layout/ }),
    ).toBeInTheDocument()
  })

  it('calls onChange with the resolved layout when the user picks an entry', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<DashboardLayoutPicker selectedSlug={null} onChange={onChange} />)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Track Day/ })).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/Dashboard layout/), 'track-day')

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        slug: 'track-day',
        name: 'Track Day',
        config: expect.objectContaining({
          name: 'Track Day',
          defaultPageId: 'track',
        }),
      })
    })
  })

  it('renders the description of the selected entry', async () => {
    render(<DashboardLayoutPicker selectedSlug="track-day" onChange={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Lap timer + gear + fluids.')).toBeInTheDocument()
    })
  })

  it('surfaces a fetch failure inline via role=alert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (): Promise<Response> => new Response('boom', { status: 500 })),
    )

    render(<DashboardLayoutPicker selectedSlug={null} onChange={() => {}} />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
