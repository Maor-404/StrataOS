/**
 * Dedicated OPFS Storage Web Worker (Packed Chunk-Slot Store)
 *
 * Uses Origin Private File System `FileSystemFileHandle.createSyncAccessHandle()`
 * with a packed chunk-slot table (`chunks.index` + `chunks.data`) so OPFS only
 * allocates disk quota for chunks actually read by Linux (~40-90 MiB for boot)
 * instead of pre-allocating a multi-gigabyte sparse file that exceeds browser quota.
 *
 * Also supports native `DecompressionStream('gzip')` full-disk offline hydration.
 */

const OPFS_DIR_NAME = 'strataos-bookworm-v2'
const DATA_FILE_NAME = 'chunks.data'
const INDEX_FILE_NAME = 'chunks.index'
const META_FILE_NAME = 'disk.meta.json'

const CHUNK_SIZE = 64 * 1024 // 64 KiB chunk granularity
const READAHEAD_CHUNKS = 8 // 512 KiB minimum Range fetch on cache miss (~4x faster cold boot)

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
  allocatedSlots: number
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
let dataHandle: SyncAccessHandleLike | null = null
let indexHandle: SyncAccessHandleLike | null = null
let rootDirHandle: FileSystemDirectoryHandle | null = null

// Maps chunkIndex -> slotIndex in chunks.data (-1 means not yet cached in OPFS)
let chunkIndexTable = new Int32Array(0)
let allocatedSlots = 0
let meta: StoredDiskMeta | null = null

let warmBoot = false
let opfsHits = 0
let networkMisses = 0
let downloadedBytes = 0
let dirtyWritesSinceFlush = 0
let decompressing = false
let decompressPercent = 0
let decompressMBs = 0
let unpackedBytes = 0

function countAllocatedSlots(table: Int32Array): number {
  let maxSlot = -1
  for (let i = 0; i < table.length; i++) {
    if (table[i] > maxSlot) maxSlot = table[i]
  }
  return maxSlot + 1
}

function buildTelemetry(): OpfsTelemetrySnapshot {
  const totalSize = meta?.totalSize ?? 0
  const cachedBytes = meta
    ? Math.min(totalSize, allocatedSlots * meta.chunkSize)
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
  if (dataHandle) {
    try {
      dataHandle.flush()
      dataHandle.close()
    } catch {
      // ignore close errors
    }
    dataHandle = null
  }
  if (indexHandle) {
    try {
      indexHandle.flush()
      indexHandle.close()
    } catch {
      // ignore close errors
    }
    indexHandle = null
  }
}

async function probeRemoteImage(imageUrl: string): Promise<{
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
      return {
        ok: false,
        status: res.status,
        totalSize: 0,
        etag: '',
        lastModified: '',
      }
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    if (
      contentType.includes('text/html') ||
      contentType.includes('text/plain')
    ) {
      return {
        ok: false,
        status: 404,
        totalSize: 0,
        etag: '',
        lastModified: '',
      }
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
      return {
        ok: false,
        status: 404,
        totalSize: 0,
        etag: '',
        lastModified: '',
      }
    }

    const etag = res.headers.get('etag') ?? `"strata-bookworm-${totalSize}"`
    const lastModified =
      res.headers.get('last-modified') ?? new Date().toUTCString()

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

/**
 * Write a single chunk (padded to CHUNK_SIZE at EOF) into the packed OPFS store.
 * Returns false cleanly if browser quota is reached (falls back to streaming).
 */
function storeChunkInOpfs(chunkId: number, data: Uint8Array): boolean {
  if (!opfsActive || !dataHandle || !indexHandle) return false
  if (chunkId < 0 || chunkId >= chunkIndexTable.length) return false

  let slot = chunkIndexTable[chunkId]
  const isNewSlot = slot < 0
  if (isNewSlot) {
    slot = allocatedSlots
  }

  try {
    if (data.byteLength === CHUNK_SIZE) {
      dataHandle.write(data, { at: slot * CHUNK_SIZE })
    } else {
      const padded = new Uint8Array(CHUNK_SIZE)
      padded.set(data.subarray(0, Math.min(data.byteLength, CHUNK_SIZE)))
      dataHandle.write(padded, { at: slot * CHUNK_SIZE })
    }

    if (isNewSlot) {
      chunkIndexTable[chunkId] = slot
      allocatedSlots = slot + 1
      const entryBytes = new Uint8Array(
        chunkIndexTable.buffer,
        chunkId * 4,
        4
      )
      indexHandle.write(entryBytes, { at: chunkId * 4 })
    }
    return true
  } catch {
    // Browser OPFS storage quota reached: keep already-cached chunks intact,
    // simply skip persisting further chunks rather than failing boot.
    return false
  }
}

/**
 * Read an arbitrary byte range `[start, end]` where EVERY chunk covering it
 * is guaranteed to have a valid slot in `chunkIndexTable`.
 */
function readRangeFromOpfs(start: number, end: number): ArrayBuffer {
  const length = end - start + 1
  const out = new Uint8Array(length)
  if (!dataHandle) return out.buffer

  let dstOffset = 0
  let cursor = start

  while (cursor <= end) {
    const chunkId = Math.floor(cursor / CHUNK_SIZE)
    const offsetInChunk = cursor - chunkId * CHUNK_SIZE
    const toRead = Math.min(CHUNK_SIZE - offsetInChunk, end - cursor + 1)
    const slot = chunkIndexTable[chunkId]

    dataHandle.read(out.subarray(dstOffset, dstOffset + toRead), {
      at: slot * CHUNK_SIZE + offsetInChunk,
    })

    cursor += toRead
    dstOffset += toRead
  }

  return out.buffer
}

async function hydrateFromGzipInternal(gzUrl: string): Promise<void> {
  if (!opfsActive || !dataHandle || !indexHandle || !rootDirHandle || !meta) {
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

    // Reset packed store to linear 1:1 chunk layout for fastest sequential write
    dataHandle.truncate(0)
    allocatedSlots = 0
    let writeOffset = 0
    let lastEmitMs = performance.now()

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue

      dataHandle.write(value, { at: writeOffset })
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

    const finalSize = writeOffset
    if (finalSize > 0) {
      const totalChunks = Math.ceil(finalSize / CHUNK_SIZE)
      dataHandle.flush()

      chunkIndexTable = new Int32Array(totalChunks)
      for (let i = 0; i < totalChunks; i++) {
        chunkIndexTable[i] = i
      }
      allocatedSlots = totalChunks

      indexHandle.truncate(chunkIndexTable.byteLength)
      indexHandle.write(new Uint8Array(chunkIndexTable.buffer), { at: 0 })
      indexHandle.flush()

      meta = {
        ...meta,
        gzUrl,
        totalSize: finalSize,
        totalChunks,
        allocatedSlots,
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
  allocatedSlots = 0
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

      const dataFile = (await rootDirHandle.getFileHandle(DATA_FILE_NAME, {
        create: true,
      })) as OpfsFileHandleWithSync
      const indexFile = (await rootDirHandle.getFileHandle(INDEX_FILE_NAME, {
        create: true,
      })) as OpfsFileHandleWithSync

      dataHandle = await dataFile.createSyncAccessHandle()
      indexHandle = await indexFile.createSyncAccessHandle()
      opfsActive = true
    } catch {
      closeHandles()
      opfsActive = false
    }
  }

  let remote: Awaited<ReturnType<typeof probeRemoteImage>> | null = null
  try {
    remote = await probeRemoteImage(imageUrl)
  } catch {
    remote = null
  }

  if (remote && remote.ok) {
    const totalChunks = Math.ceil(remote.totalSize / CHUNK_SIZE)
    const indexByteLen = totalChunks * 4

    const cacheMatches =
      opfsActive &&
      storedMeta !== null &&
      storedMeta.imageUrl === imageUrl &&
      storedMeta.totalSize === remote.totalSize &&
      storedMeta.etag === remote.etag

    if (
      cacheMatches &&
      storedMeta &&
      dataHandle &&
      indexHandle &&
      indexHandle.getSize() === indexByteLen
    ) {
      meta = storedMeta
      chunkIndexTable = new Int32Array(totalChunks)
      indexHandle.read(new Uint8Array(chunkIndexTable.buffer), { at: 0 })
      allocatedSlots = countAllocatedSlots(chunkIndexTable)
      warmBoot = allocatedSlots >= 16 || storedMeta.fullyCached
    } else {
      meta = {
        imageUrl,
        gzUrl,
        etag: remote.etag,
        lastModified: remote.lastModified,
        totalSize: remote.totalSize,
        chunkSize: CHUNK_SIZE,
        totalChunks,
        allocatedSlots: 0,
        fullyCached: false,
      }
      chunkIndexTable = new Int32Array(totalChunks)
      chunkIndexTable.fill(-1)
      allocatedSlots = 0
      warmBoot = false

      if (opfsActive && dataHandle && indexHandle && rootDirHandle) {
        try {
          // NOTE: Do NOT pre-allocate totalSize in dataHandle!
          // dataHandle starts at 0 bytes and grows strictly by 64 KiB per cached chunk.
          dataHandle.truncate(0)
          indexHandle.truncate(indexByteLen)
          indexHandle.write(new Uint8Array(chunkIndexTable.buffer), { at: 0 })
          indexHandle.flush()
          await writeStoredMeta(rootDirHandle, meta)
        } catch {
          // If OPFS quota is 0 bytes, gracefully fall back to pure HTTP Range streaming
          closeHandles()
          opfsActive = false
        }
      }
    }

    emitTelemetry()
    return { ok: true, status: 206, snapshot: buildTelemetry() }
  }

  // Offline repeat boot if OPFS has a fully cached image
  if (
    opfsActive &&
    storedMeta &&
    storedMeta.fullyCached &&
    dataHandle &&
    indexHandle
  ) {
    const indexByteLen = storedMeta.totalChunks * 4
    if (indexHandle.getSize() === indexByteLen) {
      meta = storedMeta
      chunkIndexTable = new Int32Array(storedMeta.totalChunks)
      indexHandle.read(new Uint8Array(chunkIndexTable.buffer), { at: 0 })
      allocatedSlots = countAllocatedSlots(chunkIndexTable)
      warmBoot = true
      emitTelemetry()
      return { ok: true, status: 206, snapshot: buildTelemetry() }
    }
  }

  // Fallback: if raw .ext2 is 404 but .ext2.gz exists & OPFS is active, unpack via DecompressionStream('gzip')
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
          allocatedSlots: 0,
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

  if (!opfsActive || !dataHandle || !indexHandle) {
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
    if (chunkIndexTable[c] < 0) {
      if (!hasMissing) missFirst = c
      missLast = c
      hasMissing = true
    }
  }

  if (!hasMissing) {
    opfsHits++
    const buf = readRangeFromOpfs(clampedStart, clampedEnd)
    if ((opfsHits & 31) === 0 || opfsHits <= 4) {
      emitTelemetry()
    }
    return buf
  }

  // Coalesce missing chunks with 128 KiB minimum read-ahead
  const maxChunk = meta.totalChunks - 1
  if (missLast - missFirst + 1 < READAHEAD_CHUNKS) {
    let ahead = missLast
    while (
      ahead < maxChunk &&
      ahead - missFirst + 1 < READAHEAD_CHUNKS &&
      chunkIndexTable[ahead + 1] < 0
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

  let allStored = true
  for (let c = missFirst; c <= missLast; c++) {
    const chunkRelStart = (c - missFirst) * CHUNK_SIZE
    if (chunkRelStart >= fetchedBytes.byteLength) break
    const chunkRelEnd = Math.min(fetchedBytes.byteLength, chunkRelStart + CHUNK_SIZE)
    const slice = fetchedBytes.subarray(chunkRelStart, chunkRelEnd)
    if (!storeChunkInOpfs(c, slice)) {
      allStored = false
      break
    }
  }

  dirtyWritesSinceFlush++
  if (dirtyWritesSinceFlush >= 8) {
    try {
      dataHandle.flush()
      indexHandle.flush()
    } catch {
      // ignore flush errors
    }
    dirtyWritesSinceFlush = 0
  }

  if (
    allocatedSlots >= meta.totalChunks &&
    !meta.fullyCached &&
    rootDirHandle
  ) {
    meta.fullyCached = true
    meta.allocatedSlots = allocatedSlots
    await writeStoredMeta(rootDirHandle, meta).catch(() => {})
  }

  emitTelemetry()

  // If every chunk covering [clampedStart, clampedEnd] is now in OPFS, read from OPFS;
  // otherwise (e.g., quota full) assemble cleanly from fetchedBytes + cached chunks.
  if (allStored) {
    let completeInOpfs = true
    for (let c = firstChunk; c <= lastChunk; c++) {
      if (chunkIndexTable[c] < 0) {
        completeInOpfs = false
        break
      }
    }
    if (completeInOpfs) {
      return readRangeFromOpfs(clampedStart, clampedEnd)
    }
  }

  // Fallback slice directly from fetchedBytes when request lies within fetched span
  if (clampedStart >= fetchStart && clampedEnd <= fetchEnd) {
    const relStart = clampedStart - fetchStart
    const relEnd = clampedEnd - fetchStart + 1
    return fetchedBytes.slice(relStart, relEnd).buffer
  }

  // Final safety fallback: exact direct Range fetch
  const direct = await fetch(meta.imageUrl, {
    headers: { Range: `bytes=${clampedStart}-${clampedEnd}` },
  })
  return direct.arrayBuffer()
}

async function handleReset(): Promise<void> {
  closeHandles()
  opfsActive = false
  warmBoot = false
  meta = null
  chunkIndexTable = new Int32Array(0)
  allocatedSlots = 0
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
        dataHandle?.flush()
        indexHandle?.flush()
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
