/**
 * Dedicated OPFS Storage Web Worker
 *
 * Uses Origin Private File System `FileSystemFileHandle.createSyncAccessHandle()`
 * for synchronous binary ext2 block caching + native `DecompressionStream('gzip')`
 * full-disk hydration, eliminating IndexedDB structured-clone overhead and allowing
 * repeat boots in ~2 seconds with zero network redownloads.
 */

const OPFS_DIR_NAME = 'strataos-bookworm-v1'
const DISK_FILE_NAME = 'debian_bookworm_lxqt.ext2'
const BITMAP_FILE_NAME = 'debian_bookworm_lxqt.bitmap'
const META_FILE_NAME = 'debian_bookworm_lxqt.meta.json'

const CHUNK_SIZE = 64 * 1024 // 64 KiB block granularity
const READAHEAD_CHUNKS = 2 // 128 KiB minimum Range fetch on miss

interface SyncAccessHandleLike {
  getSize(): number
  truncate(newSize: number): void
  read(buffer: ArrayBufferView, options?: { at?: number }): number
  write(buffer: ArrayBufferView, options?: { at?: number }): number
  flush(): void
  close(): void
}

interface OpfsFileHandleWithSync extends FileSystemFileHandle {
  createSyncAccessHandle(): Promise<SyncAccessHandleLike>
}

interface StoredDiskMeta {
  imageUrl: string
  gzUrl: string
  etag: string
  lastModified: string
  totalSize: number
  chunkSize: number
  totalChunks: number
  fullyCached: boolean
}

export interface OpfsTelemetrySnapshot {
  opfsActive: boolean
  warmBoot: boolean
  fullyCached: boolean
  totalSize: number
  cachedBytes: number
  downloadedBytes: number
  opfsHits: number
  networkMisses: number
  hitRatio: number
  etag: string
  lastModified: string
  decompressing: boolean
  decompressPercent: number
  decompressMBs: number
  unpackedBytes: number
}

type WorkerRequest =
  | {
      id: number
      type: 'init'
      imageUrl: string
      gzUrl: string
      useOpfs: boolean
    }
  | {
      id: number
      type: 'readRange'
      start: number
      end: number
    }
  | {
      id: number
      type: 'hydrateGzip'
      gzUrl?: string
    }
  | {
      id: number
      type: 'flush'
    }
  | {
      id: number
      type: 'reset'
    }
  | {
      id: number
      type: 'close'
    }

let opfsActive = false
let diskHandle: SyncAccessHandleLike | null = null
let bitmapHandle: SyncAccessHandleLike | null = null
let rootDirHandle: FileSystemDirectoryHandle | null = null
let bitmap = new Uint8Array(0)
let meta: StoredDiskMeta | null = null

let warmBoot = false
let opfsHits = 0
let networkMisses = 0
let downloadedBytes = 0
let cachedChunksCount = 0
let dirtyWritesSinceFlush = 0
let decompressing = false
let decompressPercent = 0
let decompressMBs = 0
let unpackedBytes = 0

function isChunkCached(chunkIndex: number): boolean {
  const byteIdx = chunkIndex >> 3
  const bitMask = 1 << (chunkIndex & 7)
  return byteIdx < bitmap.length && (bitmap[byteIdx] & bitMask) !== 0
}

function markChunkCached(chunkIndex: number): boolean {
  const byteIdx = chunkIndex >> 3
  const bitMask = 1 << (chunkIndex & 7)
  if (byteIdx >= bitmap.length) return false
  const wasSet = (bitmap[byteIdx] & bitMask) !== 0
  if (!wasSet) {
    bitmap[byteIdx] |= bitMask
    cachedChunksCount++
    return true
  }
  return false
}

function countBitmapBits(buf: Uint8Array, totalChunks: number): number {
  let count = 0
  for (let i = 0; i < totalChunks; i++) {
    if ((buf[i >> 3] & (1 << (i & 7))) !== 0) count++
  }
  return count
}

function buildTelemetry(): OpfsTelemetrySnapshot {
  const totalSize = meta?.totalSize ?? 0
  const cachedBytes = meta
    ? Math.min(totalSize, cachedChunksCount * meta.chunkSize)
    : 0
  const totalReads = opfsHits + networkMisses
  return {
    opfsActive,
    warmBoot,
    fullyCached: meta?.fullyCached ?? false,
    totalSize,
    cachedBytes,
    downloadedBytes,
    opfsHits,
    networkMisses,
    hitRatio: totalReads > 0 ? opfsHits / totalReads : warmBoot ? 1 : 0,
    etag: meta?.etag ?? '',
    lastModified: meta?.lastModified ?? '',
    decompressing,
    decompressPercent,
    decompressMBs,
    unpackedBytes,
  }
}

function emitTelemetry(): void {
  self.postMessage({ type: 'telemetry', snapshot: buildTelemetry() })
}

async function readStoredMeta(
  dir: FileSystemDirectoryHandle
): Promise<StoredDiskMeta | null> {
  try {
    const fileHandle = await dir.getFileHandle(META_FILE_NAME)
    const file = await fileHandle.getFile()
    const parsed = JSON.parse(await file.text()) as StoredDiskMeta
    if (
      typeof parsed.totalSize === 'number' &&
      parsed.totalSize > 0 &&
      typeof parsed.chunkSize === 'number' &&
      parsed.chunkSize === CHUNK_SIZE
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

async function writeStoredMeta(
  dir: FileSystemDirectoryHandle,
  nextMeta: StoredDiskMeta
): Promise<void> {
  const fileHandle = await dir.getFileHandle(META_FILE_NAME, { create: true })
  const sync = await (fileHandle as OpfsFileHandleWithSync).createSyncAccessHandle()
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(nextMeta))
    sync.truncate(encoded.byteLength)
    sync.write(encoded, { at: 0 })
    sync.flush()
  } finally {
    sync.close()
  }
}

function closeHandles(): void {
  if (diskHandle) {
    try {
      diskHandle.flush()
      diskHandle.close()
    } catch {
      // ignore close errors
    }
    diskHandle = null
  }
  if (bitmapHandle) {
    try {
      bitmapHandle.flush()
      bitmapHandle.close()
    } catch {
      // ignore close errors
    }
    bitmapHandle = null
  }
}

async function probeRemoteImage(
  imageUrl: string
): Promise<{
  ok: boolean
  status: number
  totalSize: number
  etag: string
  lastModified: string
}> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(imageUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' },
      signal: controller.signal,
    })

    if (res.status !== 200 && res.status !== 206) {
      return { ok: false, status: res.status, totalSize: 0, etag: '', lastModified: '' }
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      return { ok: false, status: 404, totalSize: 0, etag: '', lastModified: '' }
    }

    const contentRange = res.headers.get('content-range')
    let totalSize = 0
    if (contentRange) {
      const slashIdx = contentRange.lastIndexOf('/')
      if (slashIdx !== -1) {
        totalSize = Number(contentRange.slice(slashIdx + 1))
      }
    }
    if (!Number.isFinite(totalSize) || totalSize <= 0) {
      totalSize = Number(res.headers.get('content-length') ?? '0')
    }

    // A valid ext2 rootfs disk image must be at least 1 MiB
    if (!Number.isFinite(totalSize) || totalSize < 1024 * 1024) {
      return { ok: false, status: 404, totalSize: 0, etag: '', lastModified: '' }
    }

    const etag =
      res.headers.get('etag') ?? `"strata-bookworm-${totalSize}"`
    const lastModified =
      res.headers.get('last-modified') ?? new Date().toUTCString()

    // Drain tiny 2-byte body so connection can be reused cleanly
    await res.arrayBuffer().catch(() => {})

    return {
      ok: true,
      status: res.status,
      totalSize,
      etag,
      lastModified,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function hydrateFromGzipInternal(gzUrl: string): Promise<void> {
  if (!opfsActive || !diskHandle || !bitmapHandle || !rootDirHandle || !meta) {
    throw new Error('OPFS disk is not initialized for gzip hydration')
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser does not support native DecompressionStream')
  }

  decompressing = true
  decompressPercent = 0
  decompressMBs = 0
  unpackedBytes = 0
  emitTelemetry()

  const startMs = performance.now()
  try {
    const res = await fetch(gzUrl)
    if (!res.ok || !res.body) {
      throw new Error(`Failed to fetch gzipped image (${res.status})`)
    }

    const decompressedStream = res.body.pipeThrough(
      new DecompressionStream('gzip')
    )
    const reader = decompressedStream.getReader()

    let writeOffset = 0
    let lastEmitMs = performance.now()

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue

      diskHandle.write(value, { at: writeOffset })
      writeOffset += value.byteLength
      unpackedBytes = writeOffset

      const now = performance.now()
      if (now - lastEmitMs > 120) {
        const elapsedSec = Math.max(0.05, (now - startMs) / 1000)
        decompressMBs = writeOffset / (1024 * 1024) / elapsedSec
        decompressPercent =
          meta.totalSize > 0
            ? Math.min(99, Math.round((writeOffset / meta.totalSize) * 100))
            : 0
        lastEmitMs = now
        emitTelemetry()
      }
    }

    // Finalize exact size, bitmap, and metadata
    const finalSize = writeOffset
    if (finalSize > 0) {
      const totalChunks = Math.ceil(finalSize / CHUNK_SIZE)
      const bitmapBytes = Math.ceil(totalChunks / 8)
      diskHandle.truncate(finalSize)
      diskHandle.flush()

      bitmap = new Uint8Array(bitmapBytes)
      bitmap.fill(0xff)
      cachedChunksCount = totalChunks

      bitmapHandle.truncate(bitmapBytes)
      bitmapHandle.write(bitmap, { at: 0 })
      bitmapHandle.flush()

      meta = {
        ...meta,
        gzUrl,
        totalSize: finalSize,
        totalChunks,
        fullyCached: true,
      }
      await writeStoredMeta(rootDirHandle, meta)
    }

    const totalElapsedSec = Math.max(0.05, (performance.now() - startMs) / 1000)
    decompressMBs = writeOffset / (1024 * 1024) / totalElapsedSec
    decompressPercent = 100
    warmBoot = true
  } finally {
    decompressing = false
    emitTelemetry()
  }
}

async function handleInit(
  imageUrl: string,
  gzUrl: string,
  useOpfs: boolean
): Promise<{
  ok: boolean
  status: number
  error?: string
  snapshot: OpfsTelemetrySnapshot
}> {
  closeHandles()
  opfsActive = false
  warmBoot = false
  opfsHits = 0
  networkMisses = 0
  downloadedBytes = 0
  cachedChunksCount = 0
  dirtyWritesSinceFlush = 0
  unpackedBytes = 0

  let storedMeta: StoredDiskMeta | null = null

  if (useOpfs && typeof navigator.storage?.getDirectory === 'function') {
    try {
      const opfsRoot = await navigator.storage.getDirectory()
      rootDirHandle = await opfsRoot.getDirectoryHandle(OPFS_DIR_NAME, {
        create: true,
      })
      storedMeta = await readStoredMeta(rootDirHandle)

      const diskFile = (await rootDirHandle.getFileHandle(DISK_FILE_NAME, {
        create: true,
      })) as OpfsFileHandleWithSync
      const bitmapFile = (await rootDirHandle.getFileHandle(BITMAP_FILE_NAME, {
        create: true,
      })) as OpfsFileHandleWithSync

      diskHandle = await diskFile.createSyncAccessHandle()
      bitmapHandle = await bitmapFile.createSyncAccessHandle()
      opfsActive = true
    } catch {
      closeHandles()
      opfsActive = false
    }
  }

  // Probe remote image (or reuse warm OPFS cache if offline)
  let remote: Awaited<ReturnType<typeof probeRemoteImage>> | null = null
  try {
    remote = await probeRemoteImage(imageUrl)
  } catch {
    remote = null
  }

  if (remote && remote.ok) {
    const totalChunks = Math.ceil(remote.totalSize / CHUNK_SIZE)
    const bitmapBytes = Math.ceil(totalChunks / 8)

    const cacheMatches =
      opfsActive &&
      storedMeta !== null &&
      storedMeta.imageUrl === imageUrl &&
      storedMeta.totalSize === remote.totalSize &&
      storedMeta.etag === remote.etag

    if (cacheMatches && storedMeta && diskHandle && bitmapHandle) {
      meta = storedMeta
      bitmap = new Uint8Array(bitmapBytes)
      if (bitmapHandle.getSize() === bitmapBytes) {
        bitmapHandle.read(bitmap, { at: 0 })
      }
      cachedChunksCount = countBitmapBits(bitmap, totalChunks)
      warmBoot = cachedChunksCount >= 16 || storedMeta.fullyCached
    } else {
      meta = {
        imageUrl,
        gzUrl,
        etag: remote.etag,
        lastModified: remote.lastModified,
        totalSize: remote.totalSize,
        chunkSize: CHUNK_SIZE,
        totalChunks,
        fullyCached: false,
      }
      bitmap = new Uint8Array(bitmapBytes)
      cachedChunksCount = 0
      warmBoot = false

      if (opfsActive && diskHandle && bitmapHandle && rootDirHandle) {
        diskHandle.truncate(remote.totalSize)
        bitmapHandle.truncate(bitmapBytes)
        bitmapHandle.write(bitmap, { at: 0 })
        bitmapHandle.flush()
        await writeStoredMeta(rootDirHandle, meta)
      }
    }

    emitTelemetry()
    return { ok: true, status: 206, snapshot: buildTelemetry() }
  }

  // If raw .ext2 wasn't reachable, check if warm OPFS cache already exists (offline repeat boot!)
  if (
    opfsActive &&
    storedMeta &&
    storedMeta.fullyCached &&
    diskHandle &&
    bitmapHandle
  ) {
    meta = storedMeta
    const bitmapBytes = Math.ceil(storedMeta.totalChunks / 8)
    bitmap = new Uint8Array(bitmapBytes)
    if (bitmapHandle.getSize() === bitmapBytes) {
      bitmapHandle.read(bitmap, { at: 0 })
    }
    cachedChunksCount = countBitmapBits(bitmap, storedMeta.totalChunks)
    warmBoot = true
    emitTelemetry()
    return { ok: true, status: 206, snapshot: buildTelemetry() }
  }

  // If raw .ext2 is 404 but .ext2.gz exists & OPFS is active, unpack via DecompressionStream('gzip')!
  if (opfsActive && gzUrl && typeof DecompressionStream !== 'undefined') {
    try {
      const gzHead = await fetch(gzUrl, { method: 'HEAD' })
      const gzType = (gzHead.headers.get('content-type') ?? '').toLowerCase()
      const gzLen = Number(gzHead.headers.get('content-length') ?? '0')
      if (
        gzHead.ok &&
        !gzType.includes('text/html') &&
        !gzType.includes('text/plain') &&
        gzLen >= 512 * 1024
      ) {
        const etag = gzHead.headers.get('etag') ?? '"strata-bookworm-gz"'
        const lastModified =
          gzHead.headers.get('last-modified') ?? new Date().toUTCString()
        meta = {
          imageUrl,
          gzUrl,
          etag,
          lastModified,
          totalSize: 0,
          chunkSize: CHUNK_SIZE,
          totalChunks: 0,
          fullyCached: false,
        }
        await hydrateFromGzipInternal(gzUrl)
        return { ok: true, status: 206, snapshot: buildTelemetry() }
      }
    } catch {
      // fall through to error
    }
  }

  const status = remote?.status ?? 503
  return {
    ok: false,
    status,
    error:
      status === 404
        ? 'Debian 12 Bookworm VM image (debian_bookworm_lxqt.ext2) is still building or not yet published on GitHub Release debian-bookworm-v1.'
        : `Unable to probe Debian rootfs image (HTTP ${status})`,
    snapshot: buildTelemetry(),
  }
}

async function handleReadRange(
  reqStart: number,
  reqEnd: number
): Promise<ArrayBuffer> {
  if (!meta) {
    throw new Error('OPFS storage not initialized')
  }

  const clampedStart = Math.max(0, Math.min(reqStart, meta.totalSize - 1))
  const clampedEnd = Math.max(clampedStart, Math.min(reqEnd, meta.totalSize - 1))
  const length = clampedEnd - clampedStart + 1

  // Network-only fallback (when OPFS unavailable or locked by another tab)
  if (!opfsActive || !diskHandle || !bitmapHandle) {
    networkMisses++
    const res = await fetch(meta.imageUrl, {
      headers: { Range: `bytes=${clampedStart}-${clampedEnd}` },
    })
    if (!res.ok && res.status !== 206) {
      throw new Error(`Range fetch failed (${res.status})`)
    }
    const buf = await res.arrayBuffer()
    downloadedBytes += buf.byteLength
    if (networkMisses % 8 === 0) emitTelemetry()
    return buf
  }

  const firstChunk = Math.floor(clampedStart / CHUNK_SIZE)
  const lastChunk = Math.floor(clampedEnd / CHUNK_SIZE)

  let hasMissing = false
  let missFirst = -1
  let missLast = -1
  for (let c = firstChunk; c <= lastChunk; c++) {
    if (!isChunkCached(c)) {
      if (!hasMissing) missFirst = c
      missLast = c
      hasMissing = true
    }
  }

  if (!hasMissing) {
    // Pure OPFS SyncAccessHandle cache hit — zero network I/O!
    const out = new Uint8Array(length)
    diskHandle.read(out, { at: clampedStart })
    opfsHits++
    if ((opfsHits & 31) === 0 || opfsHits <= 4) {
      emitTelemetry()
    }
    return out.buffer
  }

  // Coalesce missing chunks with modest read-ahead (128 KiB minimum)
  const maxChunk = meta.totalChunks - 1
  if (missLast - missFirst + 1 < READAHEAD_CHUNKS) {
    let ahead = missLast
    while (
      ahead < maxChunk &&
      ahead - missFirst + 1 < READAHEAD_CHUNKS &&
      !isChunkCached(ahead + 1)
    ) {
      ahead++
    }
    missLast = ahead
  }

  const fetchStart = missFirst * CHUNK_SIZE
  const fetchEnd = Math.min(
    meta.totalSize - 1,
    (missLast + 1) * CHUNK_SIZE - 1
  )

  const res = await fetch(meta.imageUrl, {
    headers: { Range: `bytes=${fetchStart}-${fetchEnd}` },
  })
  if (!res.ok && res.status !== 206) {
    throw new Error(`Range fetch failed (${res.status})`)
  }
  const fetchedBytes = new Uint8Array(await res.arrayBuffer())
  downloadedBytes += fetchedBytes.byteLength
  networkMisses++

  // Persist fetched blocks synchronously into OPFS
  diskHandle.write(fetchedBytes, { at: fetchStart })

  let minDirtyByte = bitmap.length
  let maxDirtyByte = 0
  for (let c = missFirst; c <= missLast; c++) {
    const chunkByteEnd = Math.min(meta.totalSize, (c + 1) * CHUNK_SIZE)
    if (fetchStart + fetchedBytes.byteLength >= chunkByteEnd) {
      if (markChunkCached(c)) {
        const bIdx = c >> 3
        if (bIdx < minDirtyByte) minDirtyByte = bIdx
        if (bIdx > maxDirtyByte) maxDirtyByte = bIdx
      }
    }
  }

  if (minDirtyByte <= maxDirtyByte) {
    bitmapHandle.write(bitmap.subarray(minDirtyByte, maxDirtyByte + 1), {
      at: minDirtyByte,
    })
  }

  dirtyWritesSinceFlush++
  if (dirtyWritesSinceFlush >= 16) {
    diskHandle.flush()
    bitmapHandle.flush()
    dirtyWritesSinceFlush = 0
  }

  if (cachedChunksCount >= meta.totalChunks && !meta.fullyCached && rootDirHandle) {
    meta.fullyCached = true
    await writeStoredMeta(rootDirHandle, meta).catch(() => {})
  }

  const out = new Uint8Array(length)
  diskHandle.read(out, { at: clampedStart })
  emitTelemetry()
  return out.buffer
}

async function handleReset(): Promise<void> {
  closeHandles()
  opfsActive = false
  warmBoot = false
  meta = null
  bitmap = new Uint8Array(0)
  cachedChunksCount = 0
  opfsHits = 0
  networkMisses = 0
  downloadedBytes = 0

  if (typeof navigator.storage?.getDirectory === 'function') {
    try {
      const opfsRoot = await navigator.storage.getDirectory()
      await opfsRoot.removeEntry(OPFS_DIR_NAME, { recursive: true })
    } catch {
      // ignore if directory did not exist
    }
  }
  emitTelemetry()
}

// Serialize worker messages strictly because SyncAccessHandle & bitmap mutations are stateful
let messageQueue: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  messageQueue = messageQueue.then(async () => {
    try {
      if (req.type === 'init') {
        const result = await handleInit(req.imageUrl, req.gzUrl, req.useOpfs)
        self.postMessage({ id: req.id, ok: true, result })
      } else if (req.type === 'readRange') {
        const buffer = await handleReadRange(req.start, req.end)
        self.postMessage(
          { id: req.id, ok: true, buffer },
          { transfer: [buffer] }
        )
      } else if (req.type === 'hydrateGzip') {
        const targetGz = req.gzUrl ?? meta?.gzUrl
        if (!targetGz) throw new Error('No gzip URL configured')
        await hydrateFromGzipInternal(targetGz)
        self.postMessage({
          id: req.id,
          ok: true,
          snapshot: buildTelemetry(),
        })
      } else if (req.type === 'flush') {
        diskHandle?.flush()
        bitmapHandle?.flush()
        self.postMessage({ id: req.id, ok: true })
      } else if (req.type === 'reset') {
        await handleReset()
        self.postMessage({ id: req.id, ok: true })
      } else if (req.type === 'close') {
        closeHandles()
        self.postMessage({ id: req.id, ok: true })
      }
    } catch (err) {
      self.postMessage({
        id: req.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
