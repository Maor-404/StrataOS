#!/usr/bin/env node
/**
 * Downloads unkernel's official Minimal Debian 13 (aarch64) EROFS rootfs image
 * and splits it into <20 MiB chunks in `public/kernel/` for Cloudflare Pages
 * 25 MiB per-file compliance.
 *
 * Usage: node scripts/fetch-debian-rootfs.mjs
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchDistro } from 'unkernel/node'

const CHUNK_SIZE = 18 * 1024 * 1024 // 18 MiB (strictly under Cloudflare Pages 25 MiB limit)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'kernel')

async function main() {
  console.log('Fetching official Minimal Debian 13 EROFS image via unkernel...')
  const imagePath = await fetchDistro('debian', {
    onProgress: (p) => {
      if (p.stage === 'download' && p.total) {
        const pct = Math.round((p.loaded / p.total) * 100)
        process.stdout.write(`\r  Downloading debian.erofs: ${pct}%`)
      }
    },
  })
  process.stdout.write('\n')

  const stat = fs.statSync(imagePath)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Remove stale part files
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.startsWith('debian.erofs.part') || f === 'debian-manifest.json') {
      fs.unlinkSync(path.join(OUT_DIR, f))
    }
  }

  const fd = fs.openSync(imagePath, 'r')
  const hash = crypto.createHash('sha256')
  const chunks = []
  let offset = 0
  let index = 0

  while (offset < stat.size) {
    const len = Math.min(CHUNK_SIZE, stat.size - offset)
    const buf = Buffer.allocUnsafe(len)
    fs.readSync(fd, buf, 0, len, offset)
    hash.update(buf)

    const partName = `debian.erofs.part${String(index).padStart(2, '0')}`
    fs.writeFileSync(path.join(OUT_DIR, partName), buf)
    chunks.push(partName)
    console.log(`  Wrote ${partName} (${(len / (1024 * 1024)).toFixed(2)} MiB)`)

    offset += len
    index++
  }
  fs.closeSync(fd)

  const manifest = {
    distro: 'debian',
    format: 'erofs',
    totalSize: stat.size,
    chunkSize: CHUNK_SIZE,
    sha256: hash.digest('hex'),
    chunks,
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'debian-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  )

  console.log(
    `\nDone! Split ${(stat.size / (1024 * 1024)).toFixed(2)} MiB into ${chunks.length} chunks (<18 MiB each) in public/kernel/.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
