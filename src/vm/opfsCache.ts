/**
 * OPFS Block Cache (`src/vm/opfsCache.ts`)
 *
 * Accelerates CheerpX's `HttpBytesDevice` by caching downloaded `.ext2` blocks inside
 * Origin Private File System (OPFS) via a dedicated Web Worker (`createSyncAccessHandle()`),
 * protected by `navigator.storage.persist()` and Web Locks (`navigator.locks`) so
 * multiple tabs never corrupt the disk cache and repeat boots start in seconds.
 */

import type { OpfsTelemetrySnapshot } from './opfsWorker'

export type OpfsLockStatus = 'exclusive' | 'held-by-other-tab' | 'unsupported'

export interface OpfsCacheState extends OpfsTelemetrySnapshot {
  persisted: boolean
  lockStatus: OpfsLockStatus
}

export interface OpfsCacheInitResult {
  ok: boolean
  status: number
  error?: string
  virtualDiskUrl: string
  state: OpfsCacheState
}

const OPFS_WEB_LOCK_NAME = 'strataos-bookworm-opfs-v1'
export const VIRTUAL_OPFS_PREFIX = '/__strata_opfs__/'
export const DEFAULT_DEBIAN_IMAGE_URL = '/api/rootfs/debian_bookworm_lxqt.ext2'
export const DEFAULT_DEBIAN_GZ_URL = '/api/rootfs/debian_bookworm_lxqt.ext2.gz'

interface PendingRpc {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

function parseRangeHeader(
  header: string | null,
  totalSize: number
): { start: number; end: number } {
  if (!header) return { start: 0, end: Math.max(0, totalSize - 1) }
  const match = /^bytes=(\d+)-(\d*)$/i.exec(header.trim())
  if (!match) return { start: 0, end: Math.max(0, totalSize - 1) }
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : Math.max(start, totalSize - 1)
  return {
    start: Math.max(0, start),
    end: Math.min(Math.max(start, end), Math.max(0, totalSize - 1)),
  }
}

export class OpfsDiskCache {
  private worker: Worker | null = null
  private nextRpcId = 1
  private pending = new Map<number, PendingRpc>()
  private listeners = new Set<(state: OpfsCacheState) => void>()

  private lockRelease: (() => void) | null = null
  private uninstallXhrBridge: (() => void) | null = null
  private flushTimer: ReturnType<typeof setInterval> | null = null

  private state: OpfsCacheState = {
    opfsActive: false,
    warmBoot: false,
    fullyCached: false,
    totalSize: 0,
    cachedBytes: 0,
    downloadedBytes: 0,
    opfsHits: 0,
    networkMisses: 0,
    hitRatio: 0,
    etag: '',
    lastModified: '',
    decompressing: false,
    decompressPercent: 0,
    decompressMBs: 0,
    unpackedBytes: 0,
    persisted: false,
    lockStatus: 'unsupported',
  }

  public getState(): OpfsCacheState {
    return { ...this.state }
  }

  public subscribe(listener: (state: OpfsCacheState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const snap = this.getState()
    for (const listener of this.listeners) {
      listener(snap)
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(new URL('./opfsWorker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as {
        id?: number
        type?: string
        ok?: boolean
        result?: unknown
        buffer?: ArrayBuffer
        snapshot?: OpfsTelemetrySnapshot
        error?: string
      }

      if (msg.type === 'telemetry' && msg.snapshot) {
        this.state = {
          ...this.state,
          ...msg.snapshot,
        }
        this.emit()
        return
      }

      if (typeof msg.id === 'number') {
        const rpc = this.pending.get(msg.id)
        if (!rpc) return
        this.pending.delete(msg.id)
        if (msg.ok) {
          rpc.resolve(msg.buffer ?? msg.result ?? msg.snapshot)
        } else {
          rpc.reject(new Error(msg.error ?? 'OPFS cache worker error'))
        }
      }
    }

    worker.onerror = (err) => {
      for (const [, rpc] of this.pending) {
        rpc.reject(new Error(err.message || 'OPFS cache worker crashed'))
      }
      this.pending.clear()
    }

    this.worker = worker
    return worker
  }

  private callWorker<T>(payload: Record<string, unknown>): Promise<T> {
    const worker = this.ensureWorker()
    const id = this.nextRpcId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      })
      worker.postMessage({ id, ...payload })
    })
  }

  private async requestPersistence(): Promise<boolean> {
    try {
      if (typeof navigator.storage?.persisted === 'function') {
        const already = await navigator.storage.persisted()
        if (already) return true
      }
      if (typeof navigator.storage?.persist === 'function') {
        return await navigator.storage.persist()
      }
    } catch {
      // ignore storage permission limits
    }
    return false
  }

  private acquireWebLock(): Promise<OpfsLockStatus> {
    if (typeof navigator.locks?.request !== 'function') {
      return Promise.resolve('unsupported')
    }

    return new Promise<OpfsLockStatus>((resolve) => {
      void navigator.locks
        .request(
          OPFS_WEB_LOCK_NAME,
          { mode: 'exclusive', ifAvailable: true },
          (lock) => {
            if (!lock) {
              resolve('held-by-other-tab')
              return
            }
            resolve('exclusive')
            return new Promise<void>((release) => {
              this.lockRelease = release
            })
          }
        )
        .catch(() => {
          resolve('unsupported')
        })
    })
  }

  private releaseWebLock(): void {
    if (this.lockRelease) {
      const release = this.lockRelease
      this.lockRelease = null
      release()
    }
  }

  public async init(
    imageUrl = DEFAULT_DEBIAN_IMAGE_URL,
    gzUrl = DEFAULT_DEBIAN_GZ_URL
  ): Promise<OpfsCacheInitResult> {
    const [persisted, lockStatus] = await Promise.all([
      this.requestPersistence(),
      this.acquireWebLock(),
    ])

    this.state.persisted = persisted
    this.state.lockStatus = lockStatus
    this.emit()

    const canUseOpfs =
      lockStatus === 'exclusive' || lockStatus === 'unsupported'

    const res = await this.callWorker<{
      ok: boolean
      status: number
      error?: string
      snapshot: OpfsTelemetrySnapshot
    }>({
      type: 'init',
      imageUrl,
      gzUrl,
      useOpfs: canUseOpfs,
    })

    this.state = {
      ...this.state,
      ...res.snapshot,
    }
    this.emit()

    const virtualDiskUrl = `${VIRTUAL_OPFS_PREFIX}debian_bookworm_lxqt.ext2`
    if (res.ok) {
      this.installXhrBridge()
      if (!this.flushTimer) {
        this.flushTimer = setInterval(() => {
          void this.callWorker({ type: 'flush' }).catch(() => {})
        }, 4000)
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      error: res.error,
      virtualDiskUrl,
      state: this.getState(),
    }
  }

  public readRange(start: number, end: number): Promise<ArrayBuffer> {
    return this.callWorker<ArrayBuffer>({
      type: 'readRange',
      start,
      end,
    })
  }

  public async hydrateFromGzip(gzUrl?: string): Promise<OpfsCacheState> {
    const snapshot = await this.callWorker<OpfsTelemetrySnapshot>({
      type: 'hydrateGzip',
      gzUrl,
    })
    this.state = { ...this.state, ...snapshot }
    this.emit()
    return this.getState()
  }

  public async reset(): Promise<void> {
    await this.callWorker({ type: 'reset' })
  }

  public async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    if (this.uninstallXhrBridge) {
      this.uninstallXhrBridge()
      this.uninstallXhrBridge = null
    }
    if (this.worker) {
      try {
        await this.callWorker({ type: 'close' })
      } catch {
        // ignore teardown errors
      }
      this.worker.terminate()
      this.worker = null
    }
    this.pending.clear()
    this.releaseWebLock()
  }

  /**
   * Scoped XMLHttpRequest bridge for `/__strata_opfs__/` virtual disk URLs so
   * `CheerpX.HttpBytesDevice.create(...)` streams blocks directly from OPFS
   * `SyncAccessHandle` while leaving all other XHR traffic completely untouched.
   */
  private installXhrBridge(): void {
    if (this.uninstallXhrBridge) return

    const NativeXHR = window.XMLHttpRequest
    const cache = this

    class StrataOpfsXHR {
      private nativeXhr: XMLHttpRequest | null = null
      private isVirtual = false
      private rangeHeader: string | null = null
      private headersMap = new Map<string, string>()

      public readyState = 0
      public status = 0
      public statusText = ''
      public responseType: XMLHttpRequestResponseType = ''
      public response: unknown = null
      public responseText = ''
      public onload: ((ev: ProgressEvent) => void) | null = null
      public onerror: ((ev: ProgressEvent) => void) | null = null
      public onreadystatechange: ((ev: Event) => void) | null = null

      private listeners = new Map<
        string,
        Set<EventListenerOrEventListenerObject>
      >()

      public open(
        method: string,
        url: string | URL,
        async = true,
        username?: string | null,
        password?: string | null
      ): void {
        const urlStr = typeof url === 'string' ? url : url.toString()
        if (urlStr.startsWith(VIRTUAL_OPFS_PREFIX)) {
          this.isVirtual = true
          this.readyState = 1
          return
        }

        this.isVirtual = false
        const xhr = new NativeXHR()
        this.nativeXhr = xhr
        xhr.open(method, urlStr, async, username ?? null, password ?? null)
      }

      public setRequestHeader(name: string, value: string): void {
        if (this.isVirtual) {
          if (name.toLowerCase() === 'range') {
            this.rangeHeader = value
          }
          return
        }
        this.nativeXhr?.setRequestHeader(name, value)
      }

      public getResponseHeader(name: string): string | null {
        if (this.isVirtual) {
          return this.headersMap.get(name.toLowerCase()) ?? null
        }
        return this.nativeXhr?.getResponseHeader(name) ?? null
      }

      public getAllResponseHeaders(): string {
        if (this.isVirtual) {
          return Array.from(this.headersMap.entries())
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n')
        }
        return this.nativeXhr?.getAllResponseHeaders() ?? ''
      }

      public addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ): void {
        if (this.isVirtual) {
          let set = this.listeners.get(type)
          if (!set) {
            set = new Set()
            this.listeners.set(type, set)
          }
          set.add(listener)
          return
        }
        this.nativeXhr?.addEventListener(type, listener)
      }

      public removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ): void {
        if (this.isVirtual) {
          this.listeners.get(type)?.delete(listener)
          return
        }
        this.nativeXhr?.removeEventListener(type, listener)
      }

      public abort(): void {
        if (!this.isVirtual) {
          this.nativeXhr?.abort()
        }
      }

      private dispatch(type: string, ev: Event): void {
        const set = this.listeners.get(type)
        if (!set) return
        for (const listener of set) {
          if (typeof listener === 'function') {
            listener.call(this, ev)
          } else {
            listener.handleEvent(ev)
          }
        }
      }

      public send(body?: Document | XMLHttpRequestBodyInit | null): void {
        if (!this.isVirtual) {
          const xhr = this.nativeXhr
          if (!xhr) return
          if (this.responseType) xhr.responseType = this.responseType
          xhr.onload = (ev) => {
            this.syncFromNative(xhr)
            this.onload?.(ev)
          }
          xhr.onerror = (ev) => {
            this.syncFromNative(xhr)
            this.onerror?.(ev)
          }
          xhr.onreadystatechange = (ev) => {
            this.syncFromNative(xhr)
            this.onreadystatechange?.(ev)
          }
          xhr.send(body)
          return
        }

        const diskState = cache.getState()
        const { start, end } = parseRangeHeader(
          this.rangeHeader,
          diskState.totalSize
        )

        void cache
          .readRange(start, end)
          .then((buffer) => {
            const actualEnd = start + buffer.byteLength - 1
            this.status = this.rangeHeader ? 206 : 200
            this.statusText = this.rangeHeader ? 'Partial Content' : 'OK'
            this.readyState = 4

            this.headersMap.set(
              'content-range',
              `bytes ${start}-${actualEnd}/${diskState.totalSize}`
            )
            this.headersMap.set('content-length', String(buffer.byteLength))
            this.headersMap.set('accept-ranges', 'bytes')
            this.headersMap.set(
              'etag',
              diskState.etag || `"strata-bookworm-${diskState.totalSize}"`
            )
            this.headersMap.set(
              'last-modified',
              diskState.lastModified || 'Sun, 22 Nov 2026 00:00:00 GMT'
            )

            if (this.responseType === 'arraybuffer') {
              this.response = buffer
            } else {
              const decoded = new TextDecoder().decode(buffer)
              this.response = decoded
              this.responseText = decoded
            }

            const readyEv = new Event('readystatechange')
            this.onreadystatechange?.(readyEv)
            this.dispatch('readystatechange', readyEv)

            const loadEv = new ProgressEvent('load', {
              loaded: buffer.byteLength,
              total: buffer.byteLength,
            })
            this.onload?.(loadEv)
            this.dispatch('load', loadEv)
          })
          .catch(() => {
            this.status = 502
            this.statusText = 'OPFS Cache Error'
            this.readyState = 4
            const errEv = new ProgressEvent('error')
            this.onerror?.(errEv)
            this.dispatch('error', errEv)
          })
      }

      private syncFromNative(xhr: XMLHttpRequest): void {
        this.readyState = xhr.readyState
        this.status = xhr.status
        this.statusText = xhr.statusText
        this.response = xhr.response
        if (xhr.responseType === '' || xhr.responseType === 'text') {
          this.responseText = xhr.responseText
        }
      }
    }

    window.XMLHttpRequest =
      StrataOpfsXHR as unknown as typeof XMLHttpRequest

    this.uninstallXhrBridge = () => {
      window.XMLHttpRequest = NativeXHR
    }
  }
}
