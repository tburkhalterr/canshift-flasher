// api/firmware-proxy.ts
//
// Vercel Edge Function that proxies GitHub release-asset downloads. The
// flasher cannot fetch these directly: GitHub's release-asset CDN
// (`release-assets.githubusercontent.com`, redirect target from
// `api.github.com/repos/.../releases/assets/{id}`) does not send
// `Access-Control-Allow-Origin`, so a browser fetch is blocked even though
// the bytes travel over the wire. Routing through this same-origin endpoint
// dodges CORS entirely.
//
// Hardening:
//   - Method allowlist (GET, OPTIONS).
//   - Target host allowlist — refuses to proxy any URL outside GitHub's
//     release-asset infrastructure. Prevents the function from being used
//     as a generic open proxy.
//   - No cookies / authorization forwarded — the asset endpoints don't need
//     auth and the function should not leak the user's credentials.
//   - Streams the upstream body straight back without buffering, so a 100 MB
//     SPIFFS image doesn't blow the function's memory budget.

export const config = { runtime: 'edge' }

const ALLOWED_HOSTS = new Set([
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])

const UPSTREAM_TIMEOUT_MS = 30_000

const corsHeaders = (origin: string): Record<string, string> => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'accept',
  vary: 'origin',
})

const errorResponse = (status: number, message: string, origin: string): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders(origin),
    },
  })

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin') ?? '*'

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (req.method !== 'GET') {
    return errorResponse(405, 'Method not allowed', origin)
  }

  const requested = new URL(req.url).searchParams.get('url')
  if (!requested) {
    return errorResponse(400, 'Missing "url" query parameter', origin)
  }

  let target: URL
  try {
    target = new URL(requested)
  } catch {
    return errorResponse(400, 'Invalid "url" query parameter', origin)
  }
  if (target.protocol !== 'https:') {
    return errorResponse(400, 'Only https targets are proxied', origin)
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return errorResponse(403, `Host ${target.hostname} not allowed`, origin)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, UPSTREAM_TIMEOUT_MS)

  try {
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      headers: { accept: 'application/octet-stream' },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!upstream.body) {
      return errorResponse(502, 'Upstream returned no body', origin)
    }

    const headers: Record<string, string> = {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'no-store',
      ...corsHeaders(origin),
    }
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers['content-length'] = contentLength

    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream fetch failed'
    return errorResponse(502, message, origin)
  } finally {
    clearTimeout(timer)
  }
}

export default handler
