// src/lib/firmware.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FIRMWARE_BINARY_MAX_BYTES } from '../constants'

import { downloadFirmware, type FirmwareDownloadProgress } from './firmware'

interface MockResponseInit {
  ok?: boolean
  status?: number
  statusText?: string
  contentLength?: string | null
  body?: ReadableStream<Uint8Array> | null
}

function makeResponse(init: MockResponseInit): Response {
  const headers = new Headers()
  if (init.contentLength != null) headers.set('content-length', init.contentLength)
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers,
    body: init.body ?? null,
  } as unknown as Response
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        const chunk = chunks[index]
        index += 1
        if (chunk) controller.enqueue(chunk)
      } else {
        controller.close()
      }
    },
  })
}

describe('downloadFirmware', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('streams chunks and reports progress on the happy path', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const chunkA = payload.slice(0, 3)
    const chunkB = payload.slice(3)
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        contentLength: String(payload.byteLength),
        body: streamFromChunks([chunkA, chunkB]),
      }),
    )

    const progress: FirmwareDownloadProgress[] = []
    const result = await downloadFirmware((p) => progress.push(p))

    expect(result.size).toBe(payload.byteLength)
    expect(Array.from(result.bytes)).toEqual(Array.from(payload))
    expect(progress.length).toBe(2)
    expect(progress[0]).toEqual({ loaded: 3, total: payload.byteLength })
    expect(progress[1]).toEqual({ loaded: payload.byteLength, total: payload.byteLength })
  })

  it('throws a descriptive error on HTTP 404', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ ok: false, status: 404, statusText: 'Not Found' }),
    )

    await expect(downloadFirmware(() => undefined)).rejects.toThrow(/HTTP 404 Not Found/)
  })

  it('throws when the response has no body', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ contentLength: '10', body: null }))

    await expect(downloadFirmware(() => undefined)).rejects.toThrow(/empty response body/)
  })

  it('rejects when Content-Length exceeds the cap', async () => {
    const tooBig = String(FIRMWARE_BINARY_MAX_BYTES + 1)
    fetchMock.mockResolvedValueOnce(
      makeResponse({ contentLength: tooBig, body: streamFromChunks([new Uint8Array(1)]) }),
    )

    await expect(downloadFirmware(() => undefined)).rejects.toThrow(/announced size/)
  })

  it('rejects mid-stream when streamed bytes exceed the cap', async () => {
    // Server lies about content-length but tries to stream too many bytes.
    const halfCap = Math.floor(FIRMWARE_BINARY_MAX_BYTES / 2)
    const chunkA = new Uint8Array(halfCap)
    const chunkB = new Uint8Array(halfCap + 16) // total > cap
    fetchMock.mockResolvedValueOnce(
      makeResponse({ contentLength: null, body: streamFromChunks([chunkA, chunkB]) }),
    )

    await expect(downloadFirmware(() => undefined)).rejects.toThrow(/streamed/)
  })

  it('aborts when the supplied AbortSignal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    fetchMock.mockImplementationOnce((_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal
      if (signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      return Promise.resolve(makeResponse({ body: streamFromChunks([new Uint8Array(1)]) }))
    })

    await expect(
      downloadFirmware(() => undefined, controller.signal),
    ).rejects.toThrow(/Aborted/)
  })

  it('invokes the progress callback once per chunk', async () => {
    const chunks = [new Uint8Array(2), new Uint8Array(3), new Uint8Array(5)]
    fetchMock.mockResolvedValueOnce(
      makeResponse({ contentLength: '10', body: streamFromChunks(chunks) }),
    )

    const onProgress = vi.fn<(p: FirmwareDownloadProgress) => void>()
    await downloadFirmware(onProgress)

    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenNthCalledWith(1, { loaded: 2, total: 10 })
    expect(onProgress).toHaveBeenNthCalledWith(2, { loaded: 5, total: 10 })
    expect(onProgress).toHaveBeenNthCalledWith(3, { loaded: 10, total: 10 })
  })
})
