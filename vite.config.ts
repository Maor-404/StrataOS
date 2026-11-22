import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

const RELEASE_BASE_URL =
  'https://github.com/Maor-404/StrataOS/releases/download/debian-bookworm-v1'
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/

function createRootfsProxyMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/rootfs/')) {
      next()
      return
    }

    const filename = decodeURIComponent(url.slice('/api/rootfs/'.length).split('?')[0] ?? '')
    if (!filename || !SAFE_FILENAME_RE.test(filename)) {
      res.statusCode = 400
      res.end('Invalid rootfs filename')
      return
    }

    try {
      let targetUrl = `${RELEASE_BASE_URL}/${encodeURIComponent(filename)}`
      const method = req.method === 'HEAD' ? 'HEAD' : 'GET'
      const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined

      let upstream: Response | null = null
      for (let hop = 0; hop < 4; hop++) {
        const headers: Record<string, string> = {
          'User-Agent': 'StrataOS-Vite-Rootfs-Proxy/1.0',
        }
        if (rangeHeader) headers.Range = rangeHeader
        const attempt = await fetch(targetUrl, { method, headers, redirect: 'manual' })
        if ([301, 302, 303, 307, 308].includes(attempt.status)) {
          const loc = attempt.headers.get('location')
          if (!loc) {
            upstream = attempt
            break
          }
          targetUrl = new URL(loc, targetUrl).toString()
          continue
        }
        upstream = attempt
        break
      }

      if (!upstream) {
        res.statusCode = 502
        res.end('Upstream redirect failed')
        return
      }

      res.statusCode = upstream.status
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified'
      )
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader(
        'Content-Type',
        filename.endsWith('.gz') ? 'application/gzip' : 'application/octet-stream'
      )

      for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) {
        const val = upstream.headers.get(h)
        if (val) res.setHeader(h, val)
      }
      if (!upstream.headers.get('etag') && !upstream.headers.get('last-modified')) {
        res.setHeader('ETag', `"strata-x11-rootfs-v1-${filename}"`)
      }

      if (method === 'HEAD' || !upstream.body) {
        res.end()
        return
      }

      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0])
      nodeStream.pipe(res)
    } catch (err) {
      res.statusCode = 502
      res.end(err instanceof Error ? err.message : 'Proxy error')
    }
  }
}

function rootfsProxyPlugin(): Plugin {
  const middleware = createRootfsProxyMiddleware()
  return {
    name: 'strataos-rootfs-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), rootfsProxyPlugin()],
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['unkernel', '@leaningtech/cheerpx'],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@xterm')) {
            return 'vendor-terminal'
          }
          if (id.includes('@codemirror') || id.includes('/codemirror/') || id.includes('@lezer')) {
            return 'vendor-codemirror'
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/zustand') ||
            id.includes('node_modules/immer') ||
            id.includes('node_modules/@tanstack/react-virtual')
          ) {
            return 'vendor-ui'
          }
          return undefined
        },
      },
    },
  },
})
