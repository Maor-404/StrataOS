import {
  CheckCircle2,
  Cpu,
  Download,
  FileCode,
  FolderOpen,
  Pause,
  Play,
  RefreshCw,
  Save,
  Shield,
  Sliders,
  Sparkles,
  Terminal,
  Wand2,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'
import type { PackageManifest } from '../../kernel/types'
import { useOsStore } from '../../state/osStore'

export interface WasmAppHostProps {
  pkgId: string
  initialFilePath?: string
  initialArgs?: string[]
}

function computeShannonEntropy(bytes: Uint8Array): number {
  if (bytes.byteLength === 0) return 0
  const counts = new Uint32Array(256)
  for (let i = 0; i < bytes.byteLength; i++) {
    counts[bytes[i]]++
  }
  let entropy = 0
  const len = bytes.byteLength
  for (let i = 0; i < 256; i++) {
    if (counts[i] > 0) {
      const p = counts[i] / len
      entropy -= p * Math.log2(p)
    }
  }
  return Number(entropy.toFixed(3))
}

export const WasmAppHost: React.FC<WasmAppHostProps> = ({ pkgId, initialFilePath }) => {
  const [manifest, setManifest] = useState<PackageManifest | null>(null)
  const [wasmBytes, setWasmBytes] = useState<Uint8Array | null>(null)
  const [wasmInstance, setWasmInstance] = useState<WebAssembly.Instance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const openApp = useOsStore((s) => s.openApp)

  const loadWasmPackage = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { manifest: mf, wasmBytes: bytes } = await kernelClient.loadInstalledAppBinary(pkgId)
      setManifest(mf)
      setWasmBytes(bytes)

      const compiled = await WebAssembly.compile(bytes.slice().buffer)
      const dummyWasi = {
        fd_write: () => 0,
        fd_read: () => 0,
        fd_close: () => 0,
        fd_seek: () => 0,
        args_sizes_get: () => 0,
        args_get: () => 0,
        environ_sizes_get: () => 0,
        environ_get: () => 0,
        proc_exit: () => 0,
      }
      const instance = await WebAssembly.instantiate(compiled, {
        wasi_snapshot_preview1: dummyWasi,
        wasi_unstable: dummyWasi,
        env: {},
      })
      setWasmInstance(instance)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [pkgId])

  useEffect(() => {
    void loadWasmPackage()
  }, [loadWasmPackage])

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950/90 text-zinc-300">
        <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
        <div className="text-xs font-mono text-zinc-400">
          Loading /opt/strata/apps/{pkgId} from Linux ext4 filesystem...
        </div>
      </div>
    )
  }

  if (error || !manifest || !wasmBytes || !wasmInstance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center">
        <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-xs font-mono text-red-300">
          {error ?? `Package ${pkgId} is not installed in /opt/strata/apps/${pkgId}`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadWasmPackage()}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            Retry Load
          </button>
          <button
            onClick={() => openApp('store')}
            className="rounded bg-cyan-500/20 border border-cyan-500/40 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/30"
          >
            Open Strata Store
          </button>
        </div>
      </div>
    )
  }

  const exportNames = Object.keys(wasmInstance.exports)

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 select-none">
      {/* Sandboxed WASM Runtime Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 border border-cyan-500/30">
            <Cpu className="h-3 w-3" /> WASM RUNTIME
          </span>
          <span className="font-mono text-zinc-400">
            /opt/strata/apps/{manifest.id}/{manifest.entry}
          </span>
          <span className="text-zinc-600">•</span>
          <span className="font-mono text-[11px] text-zinc-400">
            {wasmBytes.byteLength} bytes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {manifest.permissions.map((perm) => (
              <span
                key={perm}
                className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 border border-white/5"
              >
                <Shield className="h-2.5 w-2.5 text-emerald-400" />
                {perm}
              </span>
            ))}
          </div>
          <span
            className="hidden sm:inline-block font-mono text-[10px] text-zinc-500"
            title={`Exports: ${exportNames.join(', ')}`}
          >
            Exports: {exportNames.join(', ')}
          </span>
        </div>
      </div>

      {/* App-Specific WASM Surface */}
      <div className="flex-1 overflow-hidden">
        {pkgId === 'hexforge' ? (
          <HexForgeSurface
            wasmInstance={wasmInstance}
            initialPath={initialFilePath ?? `/opt/strata/apps/hexforge/hexforge.wasm`}
          />
        ) : pkgId === 'pixelsynth' ? (
          <PixelSynthSurface wasmInstance={wasmInstance} />
        ) : pkgId === 'markview' ? (
          <MarkViewSurface
            wasmInstance={wasmInstance}
            initialPath={initialFilePath ?? '/root/README.md'}
          />
        ) : pkgId === 'jsonlab' ? (
          <JsonLabSurface
            wasmInstance={wasmInstance}
            initialPath={initialFilePath ?? '/etc/strata/installed.json'}
          />
        ) : (
          <GenericWasmInspector
            manifest={manifest}
            wasmBytes={wasmBytes}
            wasmInstance={wasmInstance}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// 1. HexForge — Binary & Hexadecimal File Inspector powered by hexforge.wasm
// ============================================================================
const PRESET_HEX_FILES = [
  '/opt/strata/apps/hexforge/hexforge.wasm',
  '/etc/strata/installed.json',
  '/usr/local/bin/strataget',
  '/root/README.md',
]

const HexForgeSurface: React.FC<{
  wasmInstance: WebAssembly.Instance
  initialPath: string
}> = ({ wasmInstance, initialPath }) => {
  const [filePath, setFilePath] = useState(initialPath)
  const [bytes, setBytes] = useState<Uint8Array>(new Uint8Array(0))
  const [selectedOffset, setSelectedOffset] = useState<number | null>(null)
  const [xorKey, setXorKey] = useState<string>('0x2A')
  const [statusMsg, setStatusMsg] = useState<string>('Loaded from Linux ext4 FS')

  const loadTargetFile = useCallback(async (target: string) => {
    try {
      const data = await kernelClient.readFileBytes(target)
      setBytes(data)
      setFilePath(target)
      setSelectedOffset(null)
      setStatusMsg(`Read ${data.byteLength} bytes from ${target}`)
    } catch (err) {
      setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => {
    void loadTargetFile(initialPath)
  }, [initialPath, loadTargetFile])

  // Run WASM-accelerated FNV-1a checksum & printable byte counter in linear WASM memory
  const metrics = useMemo(() => {
    const exports = wasmInstance.exports as {
      memory?: WebAssembly.Memory
      compute_checksum?: (ptr: number, len: number) => number
      count_printable?: (ptr: number, len: number) => number
    }
    let checksumHex = '0x00000000'
    let printableCount = 0

    if (exports.memory && bytes.byteLength > 0) {
      const memBytes = new Uint8Array(exports.memory.buffer)
      const sliceLen = Math.min(bytes.byteLength, memBytes.byteLength - 64)
      memBytes.set(bytes.subarray(0, sliceLen), 64)

      if (typeof exports.compute_checksum === 'function') {
        const hash = exports.compute_checksum(64, sliceLen) >>> 0
        checksumHex = '0x' + hash.toString(16).toUpperCase().padStart(8, '0')
      }
      if (typeof exports.count_printable === 'function') {
        printableCount = exports.count_printable(64, sliceLen)
      }
    }

    const entropy = computeShannonEntropy(bytes)
    const isWasm =
      bytes.byteLength >= 4 &&
      bytes[0] === 0x00 &&
      bytes[1] === 0x61 &&
      bytes[2] === 0x73 &&
      bytes[3] === 0x6d
    const isElf =
      bytes.byteLength >= 4 &&
      bytes[0] === 0x7f &&
      bytes[1] === 0x45 &&
      bytes[2] === 0x4c &&
      bytes[3] === 0x46

    return {
      checksumHex,
      printableCount,
      entropy,
      format: isWasm ? 'WebAssembly Binary (\\0asm)' : isElf ? 'ELF64 Executable' : 'Raw / UTF-8 Stream',
    }
  }, [bytes, wasmInstance])

  const applyWasmXorTransform = () => {
    const exports = wasmInstance.exports as {
      memory?: WebAssembly.Memory
      xor_buffer?: (ptr: number, len: number, key: number) => number
    }
    const keyNum = Number(xorKey) & 0xff
    if (!exports.memory || typeof exports.xor_buffer !== 'function' || bytes.byteLength === 0) return

    const memBytes = new Uint8Array(exports.memory.buffer)
    const sliceLen = Math.min(bytes.byteLength, memBytes.byteLength - 64)
    memBytes.set(bytes.subarray(0, sliceLen), 64)
    exports.xor_buffer(64, sliceLen, keyNum)
    const updated = new Uint8Array(bytes.byteLength)
    updated.set(memBytes.subarray(64, 64 + sliceLen), 0)
    setBytes(updated)
    setStatusMsg(`Applied WASM in-memory XOR (key=0x${keyNum.toString(16).toUpperCase()})`)
  }

  const saveModifiedFile = async () => {
    try {
      await kernelClient.writeFileBytes(filePath, bytes)
      setStatusMsg(`Saved ${bytes.byteLength} bytes to ${filePath} (synced to ext4)`)
    } catch (err) {
      setStatusMsg(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const rows = useMemo(() => {
    const maxBytes = Math.min(bytes.byteLength, 16384)
    const rowCount = Math.ceil(maxBytes / 16)
    const list: Array<{ offset: number; slice: Uint8Array }> = []
    for (let r = 0; r < rowCount; r++) {
      const offset = r * 16
      list.push({ offset, slice: bytes.subarray(offset, Math.min(offset + 16, maxBytes)) })
    }
    return list
  }, [bytes])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-zinc-900/50 px-3 py-2">
        <div className="flex flex-1 items-center gap-1.5 min-w-[240px]">
          <FolderOpen className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadTargetFile(filePath)}
            className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100 focus:border-cyan-500 focus:outline-none"
            placeholder="/path/to/file"
          />
          <button
            onClick={() => void loadTargetFile(filePath)}
            className="rounded bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/30 shrink-0"
          >
            Inspect
          </button>
        </div>

        <div className="flex items-center gap-1">
          {PRESET_HEX_FILES.map((preset) => (
            <button
              key={preset}
              onClick={() => void loadTargetFile(preset)}
              className="rounded bg-zinc-800/80 px-2 py-1 font-mono text-[10px] text-zinc-300 hover:bg-zinc-700"
            >
              {preset.split('/').pop()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 border-l border-white/10 pl-2">
          <input
            type="text"
            value={xorKey}
            onChange={(e) => setXorKey(e.target.value)}
            className="w-14 rounded border border-white/10 bg-zinc-950 px-1.5 py-1 font-mono text-xs text-center text-amber-300"
            title="XOR Key Byte"
          />
          <button
            onClick={applyWasmXorTransform}
            className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/25"
          >
            <Wand2 className="h-3 w-3" /> WASM XOR
          </button>
          <button
            onClick={() => void saveModifiedFile()}
            className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/25"
          >
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </div>

      {/* Telemetry Cards */}
      <div className="grid grid-cols-4 gap-2 border-b border-white/10 bg-zinc-900/30 px-3 py-2 text-xs">
        <div className="rounded border border-white/5 bg-zinc-900/70 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">WASM FNV-1a Hash</div>
          <div className="font-mono text-sm font-semibold text-cyan-300">{metrics.checksumHex}</div>
        </div>
        <div className="rounded border border-white/5 bg-zinc-900/70 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Shannon Entropy</div>
          <div className="font-mono text-sm font-semibold text-emerald-300">
            {metrics.entropy} <span className="text-[10px] font-normal text-zinc-500">bits/B</span>
          </div>
        </div>
        <div className="rounded border border-white/5 bg-zinc-900/70 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Printable ASCII</div>
          <div className="font-mono text-sm font-semibold text-zinc-200">
            {metrics.printableCount} / {bytes.byteLength}
          </div>
        </div>
        <div className="rounded border border-white/5 bg-zinc-900/70 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Signature Magic</div>
          <div className="truncate font-mono text-xs font-medium text-amber-300 mt-0.5">
            {metrics.format}
          </div>
        </div>
      </div>

      {/* Hex Table */}
      <div className="flex-1 overflow-auto font-mono text-xs p-3 bg-zinc-950">
        <div className="mb-1.5 flex items-center text-[11px] text-zinc-500 border-b border-white/10 pb-1">
          <span className="w-24">OFFSET</span>
          <span className="w-[360px]">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
          <span>DECODED ASCII</span>
        </div>
        <div className="space-y-0.5">
          {rows.map(({ offset, slice }) => {
            const hexCells: React.ReactNode[] = []
            const asciiChars: string[] = []
            for (let i = 0; i < 16; i++) {
              if (i < slice.length) {
                const b = slice[i]
                const absOff = offset + i
                const isSelected = selectedOffset === absOff
                const isNonZero = b !== 0
                hexCells.push(
                  <span
                    key={i}
                    onClick={() => setSelectedOffset(absOff)}
                    className={`inline-block w-5 cursor-pointer rounded text-center ${
                      i === 8 ? 'ml-2' : ''
                    } ${
                      isSelected
                        ? 'bg-cyan-500 text-zinc-950 font-bold'
                        : isNonZero
                        ? 'text-zinc-200 hover:bg-white/10'
                        : 'text-zinc-600 hover:bg-white/5'
                    }`}
                  >
                    {b.toString(16).toUpperCase().padStart(2, '0')}
                  </span>
                )
                asciiChars.push(b >= 32 && b <= 126 ? String.fromCharCode(b) : '·')
              } else {
                hexCells.push(
                  <span key={i} className={`inline-block w-5 ${i === 8 ? 'ml-2' : ''}`}>
                    {'  '}
                  </span>
                )
                asciiChars.push(' ')
              }
            }
            return (
              <div
                key={offset}
                className="flex items-center rounded px-1 py-0.5 hover:bg-zinc-900/70"
              >
                <span className="w-24 text-cyan-400/80">
                  0x{offset.toString(16).toUpperCase().padStart(6, '0')}
                </span>
                <span className="w-[360px]">{hexCells}</span>
                <span className="tracking-widest text-emerald-300/90">{asciiChars.join('')}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Status Footer */}
      <div className="flex items-center justify-between border-t border-white/10 bg-zinc-900/80 px-3 py-1 font-mono text-[11px] text-zinc-400">
        <span>{statusMsg}</span>
        {selectedOffset !== null && selectedOffset < bytes.byteLength && (
          <span className="text-cyan-300">
            Offset 0x{selectedOffset.toString(16).toUpperCase()} = Dec {bytes[selectedOffset]} | Bin{' '}
            {bytes[selectedOffset].toString(2).padStart(8, '0')}
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// 2. PixelSynth — Interactive WASM Procedural Pixel/Shader Framebuffer Synthesizer
// ============================================================================
const PixelSynthSurface: React.FC<{ wasmInstance: WebAssembly.Instance }> = ({ wasmInstance }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [running, setRunning] = useState(true)
  const [mode, setMode] = useState(1)
  const [scale, setScale] = useState(12)
  const [speed, setSpeed] = useState(2)
  const [fps, setFps] = useState(60)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const tickRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const exports = wasmInstance.exports as {
      memory?: WebAssembly.Memory
      render_frame?: (w: number, h: number, tick: number, mode: number, scale: number) => number
    }
    if (!exports.memory || typeof exports.render_frame !== 'function') return

    const width = 240
    const height = 150
    const imgData = ctx.createImageData(width, height)

    let animId = 0
    let lastTime = performance.now()
    let frames = 0

    const renderLoop = (now: number) => {
      frames++
      if (now - lastTime >= 500) {
        setFps(Math.round((frames * 1000) / (now - lastTime)))
        frames = 0
        lastTime = now
      }

      if (running) {
        tickRef.current = (tickRef.current + speed) | 0
      }

      const ptr = exports.render_frame!(width, height, tickRef.current, mode, scale)
      const wasmU8 = new Uint8ClampedArray(
        exports.memory!.buffer,
        ptr,
        width * height * 4
      )
      imgData.data.set(wasmU8)
      ctx.putImageData(imgData, 0, 0)

      animId = requestAnimationFrame(renderLoop)
    }

    animId = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(animId)
  }, [wasmInstance, running, mode, scale, speed])

  const exportFrameToLinuxFs = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const header = new TextEncoder().encode(`P6\n${width} ${height}\n255\n`)
    const rgb = new Uint8Array(header.length + width * height * 3)
    rgb.set(header, 0)
    let dst = header.length
    for (let i = 0; i < data.length; i += 4) {
      rgb[dst++] = data[i]
      rgb[dst++] = data[i + 1]
      rgb[dst++] = data[i + 2]
    }
    const targetPath = '/root/pixelsynth-frame.ppm'
    await kernelClient.writeFileBytes(targetPath, rgb)
    setExportStatus(`Exported ${rgb.byteLength} bytes to ${targetPath}`)
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/60 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            className="inline-flex items-center gap-1.5 rounded bg-cyan-500/20 border border-cyan-500/40 px-2.5 py-1 font-medium text-cyan-300 hover:bg-cyan-500/30"
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {running ? 'Pause' : 'Resume'}
          </button>

          <div className="flex items-center gap-1 rounded bg-zinc-900 border border-white/10 p-0.5">
            {[
              { id: 0, label: 'XorWave' },
              { id: 1, label: 'CyberPlasma' },
              { id: 2, label: 'Interference' },
              { id: 3, label: 'HarmonicGrid' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                  mode === m.id
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-emerald-400">{fps} FPS (WASM Memory)</span>
          <button
            onClick={() => void exportFrameToLinuxFs()}
            className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-white/10 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" /> Export Frame to /root
          </button>
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center bg-black/90 p-3 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={240}
          height={150}
          className="h-full w-full rounded-lg border border-white/10 object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-zinc-900/80 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-zinc-300">
            <Sliders className="h-3.5 w-3.5 text-cyan-400" />
            <span>Frequency Scale ({scale})</span>
            <input
              type="range"
              min={2}
              max={32}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-28 accent-cyan-400"
            />
          </label>
          <label className="flex items-center gap-2 text-zinc-300">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Phase Speed ({speed})</span>
            <input
              type="range"
              min={1}
              max={8}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-24 accent-emerald-400"
            />
          </label>
        </div>
        <div className="font-mono text-[11px] text-zinc-400">
          {exportStatus ?? 'Linear WASM Buffer @ 0x00000400 (144,000 bytes/frame)'}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 3. MarkView — Live Markdown Studio reading/writing .md files from /root & /home
// ============================================================================
const PRESET_MD_FILES = ['/root/README.md', '/home/strata/architecture.md']

function renderSimpleMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n')
  const elements: React.ReactNode[] = []
  let inCode = false
  let codeLines: string[] = []

  lines.forEach((line, idx) => {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre
            key={`code-${idx}`}
            className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-zinc-900/90 p-3 font-mono text-xs text-cyan-200"
          >
            {codeLines.join('\n')}
          </pre>
        )
        codeLines = []
        inCode = false
      } else {
        inCode = true
      }
      return
    }
    if (inCode) {
      codeLines.push(line)
      return
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={idx} className="mt-3 mb-2 text-lg font-bold text-zinc-100 border-b border-white/10 pb-1">
          {line.slice(2)}
        </h1>
      )
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={idx} className="mt-3 mb-1.5 text-sm font-semibold text-cyan-300">
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={idx} className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          {line.slice(4)}
        </h3>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={idx} className="ml-4 list-disc text-xs leading-relaxed text-zinc-300">
          {line.slice(2)}
        </li>
      )
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(
        <li key={idx} className="ml-4 list-decimal text-xs leading-relaxed text-zinc-300">
          {line.replace(/^\d+\.\s/, '')}
        </li>
      )
    } else if (!line.trim()) {
      elements.push(<div key={idx} className="h-2" />)
    } else {
      elements.push(
        <p key={idx} className="text-xs leading-relaxed text-zinc-300">
          {line}
        </p>
      )
    }
  })

  return elements
}

const MarkViewSurface: React.FC<{
  wasmInstance: WebAssembly.Instance
  initialPath: string
}> = ({ wasmInstance, initialPath }) => {
  const [filePath, setFilePath] = useState(initialPath)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('Ready')

  const loadMd = useCallback(async (path: string) => {
    try {
      const text = await kernelClient.readFileText(path)
      setContent(text)
      setFilePath(path)
      setStatus(`Loaded ${path}`)
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => {
    void loadMd(initialPath)
  }, [initialPath, loadMd])

  const wasmStats = useMemo(() => {
    const exports = wasmInstance.exports as {
      memory?: WebAssembly.Memory
      count_lines?: (ptr: number, len: number) => number
      count_headings?: (ptr: number, len: number) => number
      compute_checksum?: (ptr: number, len: number) => number
    }
    const bytes = new TextEncoder().encode(content)
    let lines = 0
    let headings = 0
    let hashHex = '0x00000000'

    if (exports.memory && bytes.byteLength > 0) {
      const mem = new Uint8Array(exports.memory.buffer)
      const len = Math.min(bytes.byteLength, mem.byteLength - 64)
      mem.set(bytes.subarray(0, len), 64)
      if (exports.count_lines) lines = exports.count_lines(64, len)
      if (exports.count_headings) headings = exports.count_headings(64, len)
      if (exports.compute_checksum) {
        hashHex = '0x' + (exports.compute_checksum(64, len) >>> 0).toString(16).toUpperCase()
      }
    }
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    return { lines, headings, words, hashHex }
  }, [content, wasmInstance])

  const saveMd = async () => {
    try {
      await kernelClient.writeFileText(filePath, content)
      setStatus(`Saved ${filePath} to persistent ext4 disk`)
    } catch (err) {
      setStatus(`Save error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadMd(filePath)}
            className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100"
          />
          <button
            onClick={() => void loadMd(filePath)}
            className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Open
          </button>
          {PRESET_MD_FILES.map((p) => (
            <button
              key={p}
              onClick={() => void loadMd(p)}
              className="rounded bg-zinc-800/70 px-2 py-1 font-mono text-[10px] text-cyan-300 hover:bg-zinc-700"
            >
              {p.split('/').pop()}
            </button>
          ))}
        </div>
        <button
          onClick={() => void saveMd()}
          className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
        >
          <Save className="h-3.5 w-3.5" /> Save to Linux FS
        </button>
      </div>

      <div className="grid flex-1 grid-cols-2 divide-x divide-white/10 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="h-full w-full resize-none bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200 focus:outline-none select-text"
          placeholder="Write Markdown..."
        />
        <div className="h-full overflow-y-auto bg-zinc-900/30 p-4 select-text">
          {renderSimpleMarkdown(content)}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-zinc-900/80 px-3 py-1 font-mono text-[11px] text-zinc-400">
        <span>{status}</span>
        <span>
          WASM Metrics: {wasmStats.lines} lines • {wasmStats.headings} headings • {wasmStats.words} words •{' '}
          {wasmStats.hashHex}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// 4. JSONLab — High-Speed JSON Formatter, Query & Diff Workbench
// ============================================================================
const PRESET_JSON_FILES = [
  '/etc/strata/installed.json',
  '/etc/strata/registry.json',
  '/home/strata/strata-config.json',
]

const JsonLabSurface: React.FC<{
  wasmInstance: WebAssembly.Instance
  initialPath: string
}> = ({ wasmInstance, initialPath }) => {
  const [filePath, setFilePath] = useState(initialPath)
  const [jsonText, setJsonText] = useState('')
  const [queryKey, setQueryKey] = useState('')
  const [status, setStatus] = useState('Ready')

  const loadJsonFile = useCallback(async (path: string) => {
    try {
      const text = await kernelClient.readFileText(path)
      setJsonText(text)
      setFilePath(path)
      setStatus(`Loaded ${path}`)
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  useEffect(() => {
    void loadJsonFile(initialPath)
  }, [initialPath, loadJsonFile])

  const analysis = useMemo(() => {
    const exports = wasmInstance.exports as {
      memory?: WebAssembly.Memory
      max_depth?: (ptr: number, len: number) => number
      fnv1a_hash?: (ptr: number, len: number) => number
    }
    const bytes = new TextEncoder().encode(jsonText)
    let maxDepth = 0
    let hashHex = '0x00000000'

    if (exports.memory && bytes.byteLength > 0) {
      const mem = new Uint8Array(exports.memory.buffer)
      const len = Math.min(bytes.byteLength, mem.byteLength - 64)
      mem.set(bytes.subarray(0, len), 64)
      if (exports.max_depth) maxDepth = exports.max_depth(64, len)
      if (exports.fnv1a_hash) {
        hashHex = '0x' + (exports.fnv1a_hash(64, len) >>> 0).toString(16).toUpperCase()
      }
    }

    let parsed: unknown = null
    let parseError: string | null = null
    try {
      parsed = JSON.parse(jsonText)
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e)
    }

    let queryResult: unknown = parsed
    if (parsed && queryKey.trim()) {
      const parts = queryKey
        .trim()
        .split('.')
        .filter(Boolean)
      let cur: unknown = parsed
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p]
        } else {
          cur = undefined
          break
        }
      }
      queryResult = cur
    }

    return { maxDepth, hashHex, parsed, parseError, queryResult, byteLength: bytes.byteLength }
  }, [jsonText, queryKey, wasmInstance])

  const formatPrettify = () => {
    if (!analysis.parsed) return
    setJsonText(JSON.stringify(analysis.parsed, null, 2))
    setStatus('Formatted JSON (2-space indent)')
  }

  const formatMinify = () => {
    if (!analysis.parsed) return
    setJsonText(JSON.stringify(analysis.parsed))
    setStatus('Minified JSON')
  }

  const saveJson = async () => {
    if (analysis.parseError) {
      setStatus(`Cannot save invalid JSON: ${analysis.parseError}`)
      return
    }
    await kernelClient.writeFileText(filePath, jsonText)
    setStatus(`Saved ${filePath} to Linux ext4 filesystem`)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/50 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadJsonFile(filePath)}
            className="w-full rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100"
          />
          <button
            onClick={() => void loadJsonFile(filePath)}
            className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Load
          </button>
          {PRESET_JSON_FILES.map((p) => (
            <button
              key={p}
              onClick={() => void loadJsonFile(p)}
              className="rounded bg-zinc-800/70 px-2 py-1 font-mono text-[10px] text-cyan-300 hover:bg-zinc-700"
            >
              {p.split('/').pop()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={formatPrettify}
            className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Prettify
          </button>
          <button
            onClick={formatMinify}
            className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Minify
          </button>
          <button
            onClick={() => void saveJson()}
            className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-white/10 bg-zinc-900/30 px-3 py-1.5 text-xs">
        <span className="font-mono text-zinc-400">Path Query:</span>
        <input
          type="text"
          value={queryKey}
          onChange={(e) => setQueryKey(e.target.value)}
          placeholder="e.g. packages.hexforge or paths.appsDir"
          className="flex-1 rounded border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-xs text-cyan-200"
        />
        <span className="font-mono text-[11px] text-zinc-400">
          WASM Depth: <strong className="text-cyan-300">{analysis.maxDepth}</strong> • Hash:{' '}
          <strong className="text-emerald-300">{analysis.hashHex}</strong>
        </span>
      </div>

      <div className="grid flex-1 grid-cols-2 divide-x divide-white/10 overflow-hidden">
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="h-full w-full resize-none bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100 focus:outline-none select-text"
        />
        <div className="flex h-full flex-col overflow-auto bg-zinc-900/30 p-3 font-mono text-xs select-text">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-400">
            <span>QUERY / TREE OUTPUT</span>
            {analysis.parseError ? (
              <span className="text-red-400">Syntax Error</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Valid JSON
              </span>
            )}
          </div>
          {analysis.parseError ? (
            <div className="rounded border border-red-500/30 bg-red-950/20 p-2 text-red-300">
              {analysis.parseError}
            </div>
          ) : (
            <pre className="flex-1 overflow-auto text-cyan-200">
              {JSON.stringify(analysis.queryResult, null, 2) ?? 'undefined'}
            </pre>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-zinc-900/80 px-3 py-1 font-mono text-[11px] text-zinc-400">
        <span>{status}</span>
        <span>{analysis.byteLength} bytes</span>
      </div>
    </div>
  )
}

// ============================================================================
// 5. Generic Sideloaded Community .wasm Module Runner & Inspector
// ============================================================================
const GenericWasmInspector: React.FC<{
  manifest: PackageManifest
  wasmBytes: Uint8Array
  wasmInstance: WebAssembly.Instance
}> = ({ manifest, wasmBytes, wasmInstance }) => {
  const callableExports = useMemo(() => {
    return Object.entries(wasmInstance.exports)
      .filter(([, val]) => typeof val === 'function')
      .map(([name, fn]) => ({ name, fn: fn as (...args: number[]) => number }))
  }, [wasmInstance])

  const [selectedFn, setSelectedFn] = useState(callableExports[0]?.name ?? '')
  const [argInput, setArgInput] = useState('10, 20')
  const [callResult, setCallResult] = useState<string | null>(null)

  const invokeExport = () => {
    const target = callableExports.find((e) => e.name === selectedFn)
    if (!target) return
    try {
      const parsedArgs = argInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
      const t0 = performance.now()
      const res = target.fn(...parsedArgs)
      const dt = ((performance.now() - t0) * 1000).toFixed(1)
      setCallResult(`${selectedFn}(${parsedArgs.join(', ')}) => ${res} (${dt} µs)`)
    } catch (err) {
      setCallResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-auto">
      <div className="rounded-lg border border-white/10 bg-zinc-900/60 p-4">
        <div className="flex items-center gap-3">
          <FileCode className="h-6 w-6 text-cyan-400" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              {manifest.name} <span className="font-mono text-xs text-zinc-400">v{manifest.version}</span>
            </h3>
            <p className="text-xs text-zinc-400">{manifest.description}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-zinc-900/40 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Terminal className="h-3.5 w-3.5 text-cyan-400" /> Interactive Exported Function Runner
        </div>
        {callableExports.length === 0 ? (
          <div className="text-xs text-zinc-500">No callable functions exported by this WASM binary.</div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedFn}
              onChange={(e) => setSelectedFn(e.target.value)}
              className="rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-cyan-300"
            >
              {callableExports.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}()
                </option>
              ))}
            </select>
            <input
              type="text"
              value={argInput}
              onChange={(e) => setArgInput(e.target.value)}
              placeholder="Comma-separated numeric args"
              className="flex-1 rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100"
            />
            <button
              onClick={invokeExport}
              className="rounded bg-cyan-500/20 border border-cyan-500/40 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/30"
            >
              Call WASM Function
            </button>
          </div>
        )}
        {callResult && (
          <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 font-mono text-xs text-emerald-300">
            {callResult}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-zinc-900/40 p-4 font-mono text-xs text-zinc-400">
        <div>Binary Size: {wasmBytes.byteLength} bytes</div>
        <div>Install Path: /opt/strata/apps/{manifest.id}/{manifest.entry}</div>
      </div>
    </div>
  )
}
