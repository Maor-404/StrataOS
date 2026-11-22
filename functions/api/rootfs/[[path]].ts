/**
 * Cloudflare Pages Function: Same-Origin HTTP Range Proxy for X11 Rootfs Images
 *
 * Streams raw `.ext2` Range slices and `.ext2.gz` archives from GitHub Releases
 * (`x11-rootfs-v1`) on the same origin with `Cross-Origin-Resource-Policy: same-origin`,
 * satisfying browser COEP (`require-corp`), Cloudflare Pages' 25 MiB static asset limit,
 * and CheerpX's `ETag` / `Last-Modified` + `Content-Range` requirements.
 */

interface PagesContext {
  request: Request
  params: {
    path?: string | string[]
  }
}

const RELEASE_BASE_URL =
  'https://github.com/Maor-404/StrataOS/releases/download/debian-bookworm-v1'

const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/

const ALLOWED_REDIRECT_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
])

const BASE_CORS_CORP_HEADERS: Record<string, string> = {
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified',
}

async function fetchFollowingGithubRedirect(
  url: string,
  method: string,
  rangeHeader: string | null
): Promise<Response> {
  let currentUrl = url

  for (let hop = 0; hop < 4; hop++) {
    const reqHeaders = new Headers({
      'User-Agent': 'StrataOS-Cloudflare-Rootfs-Proxy/1.0',
    })
    if (rangeHeader) {
      reqHeaders.set('Range', rangeHeader)
    }

    const res = await fetch(currentUrl, {
      method,
      headers: reqHeaders,
      redirect: 'manual',
    })

    if (
      res.status === 301 ||
      res.status === 302 ||
      res.status === 303 ||
      res.status === 307 ||
      res.status === 308
    ) {
      const location = res.headers.get('location')
      if (!location) return res

      const nextUrl = new URL(location, currentUrl)
      if (!ALLOWED_REDIRECT_HOSTS.has(nextUrl.hostname)) {
        return new Response('Disallowed upstream redirect host', {
          status: 502,
          headers: BASE_CORS_CORP_HEADERS,
        })
      }
      currentUrl = nextUrl.toString()
      continue
    }

    return res
  }

  return new Response('Too many upstream redirects', {
    status: 502,
    headers: BASE_CORS_CORP_HEADERS,
  })
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, params } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: BASE_CORS_CORP_HEADERS,
    })
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        ...BASE_CORS_CORP_HEADERS,
        Allow: 'GET, HEAD, OPTIONS',
      },
    })
  }

  const rawPath = Array.isArray(params.path)
    ? params.path.join('/')
    : (params.path ?? '')

  if (!rawPath || !SAFE_FILENAME_RE.test(rawPath)) {
    return new Response('Invalid rootfs asset name', {
      status: 400,
      headers: BASE_CORS_CORP_HEADERS,
    })
  }

  const upstreamUrl = `${RELEASE_BASE_URL}/${encodeURIComponent(rawPath)}`
  const rangeHeader = request.headers.get('Range')

  let upstreamRes: Response
  try {
    upstreamRes = await fetchFollowingGithubRedirect(
      upstreamUrl,
      request.method,
      rangeHeader
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream fetch failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: {
        ...BASE_CORS_CORP_HEADERS,
        'Content-Type': 'application/json',
      },
    })
  }

  const outHeaders = new Headers(BASE_CORS_CORP_HEADERS)
  outHeaders.set('Accept-Ranges', 'bytes')
  outHeaders.set(
    'Content-Type',
    rawPath.endsWith('.gz') ? 'application/gzip' : 'application/octet-stream'
  )

  for (const key of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const val = upstreamRes.headers.get(key)
    if (val) outHeaders.set(key, val)
  }

  // CheerpX HttpBytesDevice strictly requires either ETag or Last-Modified
  if (!outHeaders.has('etag') && !outHeaders.has('last-modified')) {
    outHeaders.set('ETag', `"strata-x11-rootfs-v1-${rawPath}"`)
    outHeaders.set('Last-Modified', 'Sun, 22 Nov 2026 00:00:00 GMT')
  }

  if (upstreamRes.status === 200 || upstreamRes.status === 206) {
    outHeaders.set('Cache-Control', 'public, max-age=3600')
  } else {
    outHeaders.set('Cache-Control', 'no-store')
  }

  return new Response(request.method === 'HEAD' ? null : upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: outHeaders,
  })
}
