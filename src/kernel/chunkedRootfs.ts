import { DistroDisk, F_RO, type BlockDevice } from 'unkernel/web'

export interface ChunkedRootfsManifest {
  distro: string
  format: 'erofs' | 'ext4'
  totalSize: number
  chunkSize: number
  sha256?: string
  chunks: string[]
}

/**
 * Cloudflare Pages 25 MiB–compliant lazy BlockDevice.
 * Reassembles reads transparently across <20 MiB static chunks under `/kernel/`
 * without ever shipping a single file above 25 MiB.
 */
export class ChunkedHttpBlockDevice implements BlockDevice {
  readonly size: number
  readonly readOnly = true
  readonly flags = F_RO
  readonly blockSize = 4096

  private readonly manifest: ChunkedRootfsManifest
  private readonly baseUrl: string
  private readonly cache = new Map<number, Promise<Uint8Array>>()
  private readonly log?: (msg: string) => void

  constructor(manifest: ChunkedRootfsManifest, baseUrl: string, log?: (msg: string) => void) {
    this.manifest = manifest
    this.size = manifest.totalSize
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    this.log = log
  }

  private getChunk(index: number): Promise<Uint8Array> {
    let pending = this.cache.get(index)
    if (pending) return pending

    const fileName = this.manifest.chunks[index]
    if (!fileName) {
      return Promise.reject(new RangeError(`Missing rootfs chunk index ${index}`))
    }

    const url = `${this.baseUrl}${fileName}`
    this.log?.(`[debian-rootfs] Fetching chunk ${index + 1}/${this.manifest.chunks.length}: ${fileName}`)
    pending = fetch(url, { cache: 'force-cache' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
        return new Uint8Array(await res.arrayBuffer())
      })
      .catch((err) => {
        this.cache.delete(index)
        throw err
      })

    this.cache.set(index, pending)
    return pending
  }

  async read(off: number, views: Uint8Array[]): Promise<void> {
    let cursor = off
    const chunkSize = this.manifest.chunkSize

    for (const view of views) {
      let written = 0
      while (written < view.byteLength) {
        const chunkIdx = Math.floor(cursor / chunkSize)
        const inChunkOffset = cursor % chunkSize
        const chunk = await this.getChunk(chunkIdx)
        const avail = Math.min(view.byteLength - written, chunk.byteLength - inChunkOffset)
        if (avail <= 0) {
          view.fill(0, written)
          break
        }
        view.set(chunk.subarray(inChunkOffset, inChunkOffset + avail), written)
        written += avail
        cursor += avail
      }
    }
  }

  write(): Promise<void> {
    return Promise.reject(new Error('ChunkedHttpBlockDevice is read-only'))
  }
}

/**
 * Checks whether a split Debian EROFS manifest (`/kernel/debian-manifest.json`) is hosted.
 * Returns a ready `DistroDisk` if present, or `null` to fall back to the fast 9.7 MiB
 * bundled Linux 7.3.4 kernel provisioned with Debian Bedrock userland.
 */
export async function tryOpenChunkedDebianDistro(
  manifestUrl = '/kernel/debian-manifest.json',
  log?: (msg: string) => void
): Promise<DistroDisk | null> {
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) return null

    const manifest = (await res.json()) as Partial<ChunkedRootfsManifest>
    if (
      !manifest ||
      typeof manifest.totalSize !== 'number' ||
      typeof manifest.chunkSize !== 'number' ||
      !Array.isArray(manifest.chunks) ||
      manifest.chunks.length === 0
    ) {
      return null
    }

    const baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1) || '/kernel/'
    const device = new ChunkedHttpBlockDevice(manifest as ChunkedRootfsManifest, baseUrl, log)
    return await DistroDisk.open(device, { name: manifest.distro ?? 'debian', log })
  } catch {
    return null
  }
}
