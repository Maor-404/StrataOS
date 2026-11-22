import {
  Cpu,
  Download,
  ExternalLink,
  HardDrive,
  Keyboard,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useOsStore } from '../state/osStore'
import {
  GpuDisplayPipeline,
  type DisplayPipelineState,
  type VirtualKmsSurface,
} from './gpuDisplay'
import {
  DEFAULT_DEBIAN_GZ_URL,
  DEFAULT_DEBIAN_IMAGE_URL,
  OpfsDiskCache,
  type OpfsCacheState,
} from './opfsCache'

type BootStage =
  | 'checking'
  | 'streaming'
  | 'starting-xorg'
  | 'launching-lxqt'
  | 'ready'
  | 'error'

interface CheerpXLinuxExtended {
  delete(): void
  run(
    fileName: string,
    args: string[],
    optionals?: { env?: string[]; cwd?: string; uid?: number; gid?: number }
  ): Promise<{ status: number }>
  setKmsCanvas(
    canvas: HTMLCanvasElement | VirtualKmsSurface,
    width: number,
    height: number
  ): void
  setCustomConsole(
    writeFunc: (buffer: Uint8Array, vt: number) => void,
    columns: number,
    rows: number
  ): (keyCode: number) => void
  registerCallback(
    eventName: string,
    callback: (state: string | number) => void
  ): void
  unregisterCallback(
    eventName: string,
    callback: (state: string | number) => void
  ): void
}

interface CheerpXIdbDevice {
  reset(): Promise<void>
  delete(): void
}

const STAGE_PROGRESS: Record<BootStage, number> = {
  checking: 12,
  streaming: 42,
  'starting-xorg': 72,
  'launching-lxqt': 92,
  ready: 100,
  error: 0,
}

const STAGE_LABELS: Record<BootStage, string> = {
  checking: 'Verifying COOP/COEP Isolation & OPFS Storage',
  streaming: 'Streaming Blocks',
  'starting-xorg': 'Starting Xorg',
  'launching-lxqt': 'Launching LXQt-panel',
  ready: 'Debian 12 Bookworm X11 Ready',
  error: 'Boot Halted',
}

function formatMiB(bytes: number): string {
  if (!bytes || bytes <= 0) return '0.0 MiB'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function computeKmsResolution(): { width: number; height: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const minW = 1024
  const minH = 768
  let mult = 1.0
  if (vw < minW) mult = minW / Math.max(1, vw)
  if (vh < minH) mult = Math.max(mult, minH / Math.max(1, vh))
  return {
    width: Math.floor(vw * mult),
    height: Math.floor(vh * mult),
  }
}

export const RealDebianDesktop: React.FC = () => {
  const setBootPhase = useOsStore((s) => s.setBootPhase)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasHostRef = useRef<HTMLDivElement | null>(null)
  const opfsRef = useRef<OpfsDiskCache | null>(null)
  const displayRef = useRef<GpuDisplayPipeline | null>(null)
  const idbOverlayRef = useRef<CheerpXIdbDevice | null>(null)
  const cxRef = useRef<CheerpXLinuxExtended | null>(null)

  const [bootNonce, setBootNonce] = useState(0)
  const [stage, setStage] = useState<BootStage>('checking')
  const [errorInfo, setErrorInfo] = useState<{
    title: string
    detail: string
    isImageBuilding?: boolean
  } | null>(null)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [bootElapsedMs, setBootElapsedMs] = useState<number | null>(null)
  const [consoleLines, setConsoleLines] = useState<string[]>([])
  const [cpuActive, setCpuActive] = useState(false)
  const [diskActive, setDiskActive] = useState(false)
  const [diskLatencyMs, setDiskLatencyMs] = useState(0)
  const [hydratingOffline, setHydratingOffline] = useState(false)
  const [resettingDisk, setResettingDisk] = useState(false)

  const [opfsState, setOpfsState] = useState<OpfsCacheState>({
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
  })

  const [displayState, setDisplayState] = useState<DisplayPipelineState>({
    backend: 'initializing',
    adapterName: '',
    width: 1280,
    height: 800,
    fps: 0,
    framesRendered: 0,
    sharedBufferActive: false,
    firstFramePainted: false,
    isFullscreen: false,
    keyboardLocked: false,
    keyboardLockSupported: false,
  })

  const appendConsole = useCallback((chunk: Uint8Array) => {
    const text = new TextDecoder().decode(chunk)
    // Strip ANSI escape codes for crisp telemetry ticker
    const ansiRe = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, 'g')
    const clean = text.replace(ansiRe, '')
    const parts = clean
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (parts.length === 0) return

    setConsoleLines((prev) => [...prev, ...parts].slice(-6))
    const joined = parts.join(' ').toLowerCase()
    if (joined.includes('x.org') || joined.includes('xorg')) {
      setStage((cur) => (cur === 'streaming' ? 'starting-xorg' : cur))
    }
    if (
      joined.includes('lxqt') ||
      joined.includes('openbox') ||
      joined.includes('pcmanfm')
    ) {
      setStage((cur) =>
        cur === 'streaming' || cur === 'starting-xorg' ? 'launching-lxqt' : cur
      )
    }
  }, [])

  // Allow F2 to jump into StrataUEFI while boot overlay is active
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' && overlayVisible) {
        e.preventDefault()
        setBootPhase('uefi-setup')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlayVisible, setBootPhase])

  const triggerReboot = useCallback(() => {
    setStage('checking')
    setErrorInfo(null)
    setOverlayVisible(true)
    setBootElapsedMs(null)
    setConsoleLines([])
    setBootNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    const bootStartedAt = performance.now()

    const host = canvasHostRef.current
    if (!host) return

    // Create a fresh <canvas> DOM node per mount so React 19 StrictMode never calls
    // transferControlToOffscreen() twice on the same element.
    host.innerHTML = ''
    const canvas = document.createElement('canvas')
    canvas.id = 'debian-x11-canvas'
    canvas.tabIndex = 0
    canvas.className = 'block h-full w-full cursor-default touch-none outline-none'
    host.appendChild(canvas)

    const { width, height } = computeKmsResolution()

    let pipeline: GpuDisplayPipeline | null = null
    let unsubDisplay: (() => void) | null = null
    let opfsCache: OpfsDiskCache | null = null
    let unsubOpfs: (() => void) | null = null
    let cx: CheerpXLinuxExtended | null = null

    const bootVm = async () => {
      // 1. Verify Cross-Origin Isolation required by CheerpX SharedArrayBuffer + OPFS
      if (!globalThis.crossOriginIsolated) {
        setStage('error')
        setErrorInfo({
          title: 'Cross-Origin Isolation Required',
          detail:
            'window.crossOriginIsolated is false. Ensure Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp headers are active.',
        })
        return
      }

      // 2. Start OffscreenCanvas + WebGPU (or 2D ImageBitmap fallback) Display Pipeline
      try {
        pipeline = new GpuDisplayPipeline(canvas, width, height, () => {
          if (cancelled) return
          setStage('ready')
          setBootElapsedMs(Math.round(performance.now() - bootStartedAt))
          setTimeout(() => {
            if (!cancelled) setOverlayVisible(false)
          }, 420)
        })
        displayRef.current = pipeline
        unsubDisplay = pipeline.subscribe((snap) => {
          if (!cancelled) setDisplayState(snap)
        })
      } catch (err) {
        setStage('error')
        setErrorInfo({
          title: 'Display Pipeline Initialization Failed',
          detail: err instanceof Error ? err.message : String(err),
        })
        return
      }

      // 3. Initialize OPFS SyncAccessHandle Cache (with persist() + navigator.locks)
      setStage('streaming')
      const params = new URLSearchParams(window.location.search)
      const customImage = params.get('image')?.trim()
      const imageUrl = customImage || DEFAULT_DEBIAN_IMAGE_URL
      const gzUrl = customImage ? `${customImage}.gz` : DEFAULT_DEBIAN_GZ_URL

      opfsCache = new OpfsDiskCache()
      opfsRef.current = opfsCache
      unsubOpfs = opfsCache.subscribe((snap) => {
        if (!cancelled) setOpfsState(snap)
      })

      const opfsInit = await opfsCache.init(imageUrl, gzUrl)
      if (cancelled) return

      if (!opfsInit.ok) {
        setStage('error')
        setErrorInfo({
          title:
            opfsInit.status === 404
              ? 'Debian 12 Bookworm VM Image Building'
              : 'Rootfs Image Unavailable',
          detail:
            opfsInit.error ??
            `Unable to stream ${imageUrl} (HTTP ${opfsInit.status}).`,
          isImageBuilding: opfsInit.status === 404,
        })
        return
      }

      // 4. Dynamically import CheerpX runtime & mount OPFS-backed ext2 + IDB overlay
      try {
        const CheerpX = await import('@leaningtech/cheerpx')
        if (cancelled) return

        const httpDevice = await CheerpX.HttpBytesDevice.create(
          opfsInit.virtualDiskUrl
        )
        const idbDevice = (await CheerpX.IDBDevice.create(
          'strataos-bookworm-overlay'
        )) as unknown as CheerpXIdbDevice
        idbOverlayRef.current = idbDevice

        if (params.get('reset') === '1') {
          await idbDevice.reset()
        }

        const overlayDevice = await CheerpX.OverlayDevice.create(
          httpDevice,
          idbDevice as unknown as Parameters<
            typeof CheerpX.OverlayDevice.create
          >[1]
        )
        const dataDevice = await CheerpX.DataDevice.create()
        if (cancelled) return

        const mounts = [
          { type: 'ext2', dev: overlayDevice, path: '/' },
          { type: 'dir', dev: dataDevice, path: '/data' },
          { type: 'devs', path: '/dev' },
          { type: 'devpts', path: '/dev/pts' },
          { type: 'proc', path: '/proc' },
          { type: 'sys', path: '/sys' },
        ] as unknown as NonNullable<
          Parameters<typeof CheerpX.Linux.create>[0]
        >['mounts']

        cx = (await CheerpX.Linux.create({
          mounts,
        })) as unknown as CheerpXLinuxExtended
        if (cancelled) {
          cx.delete()
          return
        }
        cxRef.current = cx

        cx.registerCallback('cpuActivity', (val) => {
          if (!cancelled) setCpuActive(val === 'ready')
        })
        cx.registerCallback('diskActivity', (val) => {
          if (!cancelled) setDiskActive(val === 'ready')
        })
        cx.registerCallback('diskLatency', (val) => {
          if (!cancelled && typeof val === 'number') setDiskLatencyMs(val)
        })
        cx.registerCallback('processCreated', () => {
          if (cancelled) return
          setStage((cur) => {
            if (cur === 'streaming') return 'starting-xorg'
            if (cur === 'starting-xorg') return 'launching-lxqt'
            return cur
          })
        })

        cx.setCustomConsole(appendConsole, 120, 32)
        cx.setKmsCanvas(pipeline.virtualKmsSurface, width, height)

        setStage('starting-xorg')

        // Auto-boot real Xorg + Openbox + LXQt-panel as non-root `strata` (uid 1000)
        while (!cancelled) {
          const exitRes = await cx.run(
            '/usr/bin/xinit',
            ['/home/strata/.xinitrc', '--', '/usr/bin/Xorg', '-retro'],
            {
              env: [
                'HOME=/home/strata',
                'USER=strata',
                'DISPLAY=:0',
                'XDG_RUNTIME_DIR=/tmp/runtime-strata',
              ],
              cwd: '/home/strata',
              uid: 1000,
              gid: 1000,
            }
          )
          if (cancelled) break
          if (exitRes.status !== 0) {
            setStage('error')
            setOverlayVisible(true)
            setErrorInfo({
              title: `Xorg / xinit Exited (Code ${exitRes.status})`,
              detail:
                'The X11 session terminated unexpectedly. Inspect the console ticker or click Retry Boot / Reset Storage.',
            })
            break
          }
        }
      } catch (err) {
        if (cancelled) return
        setStage('error')
        setOverlayVisible(true)
        setErrorInfo({
          title: 'CheerpX Linux Boot Error',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }

    void bootVm()

    return () => {
      cancelled = true
      unsubDisplay?.()
      unsubOpfs?.()
      if (cx) {
        try {
          cx.delete()
        } catch {
          // ignore teardown errors
        }
      }
      cxRef.current = null
      idbOverlayRef.current = null
      pipeline?.dispose()
      displayRef.current = null
      void opfsCache?.dispose()
      opfsRef.current = null
      host.innerHTML = ''
    }
  }, [bootNonce, appendConsole])

  const handleToggleFullscreen = async () => {
    const container = containerRef.current
    const pipeline = displayRef.current
    if (!container || !pipeline) return
    try {
      await pipeline.toggleFullscreen(container)
    } catch {
      // ignore user-gesture rejection
    }
  }

  const handleHydrateOffline = async () => {
    const opfs = opfsRef.current
    if (!opfs || hydratingOffline) return
    setHydratingOffline(true)
    try {
      await opfs.hydrateFromGzip()
    } catch {
      // surfaced via OPFS state
    } finally {
      setHydratingOffline(false)
    }
  }

  const handleResetStorage = async () => {
    if (resettingDisk) return
    setResettingDisk(true)
    try {
      await idbOverlayRef.current?.reset().catch(() => {})
      await opfsRef.current?.reset().catch(() => {})
      triggerReboot()
    } finally {
      setResettingDisk(false)
    }
  }

  const hitPct = Math.round(opfsState.hitRatio * 100)
  const progressPct = opfsState.decompressing
    ? opfsState.decompressPercent
    : STAGE_PROGRESS[stage]

  return (
    <div
      ref={containerRef}
      id="real-debian-desktop"
      className="relative h-screen w-screen overflow-hidden bg-[#0d1117] text-zinc-100 select-none"
    >
      {/* Full-Viewport OffscreenCanvas / WebGPU X11 Framebuffer Surface */}
      <div ref={canvasHostRef} className="h-full w-full" />

      {/* Subtle Hover-Revealed Top-Right Hardware Utility Pill (never blocks bottom LXQt-panel) */}
      <div className="fixed top-2 right-2 z-[60] flex items-center gap-1 rounded-full border border-white/10 bg-[#0d1117]/75 px-2 py-1 text-[11px] font-mono text-zinc-300 backdrop-blur-md opacity-45 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            stage === 'ready'
              ? 'bg-emerald-400'
              : stage === 'error'
                ? 'bg-rose-500'
                : 'bg-cyan-400 animate-pulse'
          }`}
          title={STAGE_LABELS[stage]}
        />
        <span className="hidden sm:inline text-zinc-400">
          {displayState.backend === 'webgpu' ? 'WebGPU' : '2D-Bitmap'}
          {displayState.fps > 0 ? ` ${displayState.fps}fps` : ''}
        </span>
        {opfsState.opfsActive && (
          <span
            className="hidden md:inline text-emerald-400/90"
            title={`OPFS cached ${formatMiB(opfsState.cachedBytes)} (${hitPct}% hit ratio)`}
          >
            • OPFS {hitPct}%
          </span>
        )}
        {displayState.keyboardLocked && (
          <span
            className="inline-flex items-center gap-1 rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-300"
            title="Alt+Tab, Ctrl+W, and Super forwarded to Linux (Hold Esc to release)"
          >
            <Keyboard className="h-3 w-3" /> Keys Locked
          </span>
        )}

        <div className="mx-0.5 h-3 w-px bg-white/15" />

        <button
          id="btn-fullscreen-kbdlock"
          type="button"
          onClick={() => void handleToggleFullscreen()}
          title="Fullscreen + Keyboard Lock (forwards Alt+Tab / Super into Linux)"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white cursor-pointer"
        >
          {displayState.isFullscreen ? (
            <Minimize2 className="h-3 w-3" />
          ) : (
            <Maximize2 className="h-3 w-3" />
          )}
          <span className="hidden sm:inline">
            {displayState.isFullscreen ? 'Exit' : 'Fullscreen'}
          </span>
        </button>

        {opfsState.opfsActive && !opfsState.fullyCached && stage !== 'error' && (
          <button
            id="btn-hydrate-opfs"
            type="button"
            disabled={hydratingOffline || opfsState.decompressing}
            onClick={() => void handleHydrateOffline()}
            title="Download & unpack .ext2.gz via DecompressionStream into OPFS for instant offline boots"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-cyan-300 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3 w-3" />
            <span className="hidden lg:inline">
              {opfsState.decompressing
                ? `${opfsState.decompressPercent}%`
                : 'Cache Offline'}
            </span>
          </button>
        )}

        <button
          id="btn-open-uefi"
          type="button"
          onClick={() => setBootPhase('uefi-setup')}
          title="Open StrataUEFI Setup (F2)"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-cyan-300 cursor-pointer"
        >
          <Wrench className="h-3 w-3" />
          <span>UEFI</span>
        </button>

        <button
          id="btn-cli-fallback"
          type="button"
          onClick={() => setBootPhase('tty-recovery')}
          title="Switch to Lightweight unkernel Linux 7.3 CLI Fallback"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-amber-300 cursor-pointer"
        >
          <Terminal className="h-3 w-3" />
          <span>CLI</span>
        </button>

        <button
          id="btn-reset-storage"
          type="button"
          disabled={resettingDisk}
          onClick={() => void handleResetStorage()}
          title="Wipe OPFS cache + IndexedDB Bookworm overlay and reboot clean"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-50 cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      {/* Minimal Boot Progress & Hardware Telemetry Overlay (fades out on first real X11 frame) */}
      <div
        id="debian-boot-overlay"
        className={`fixed inset-0 z-[50] flex items-center justify-center bg-[#0d1117]/95 p-6 font-mono transition-opacity duration-500 ${
          overlayVisible
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#12161f] p-6 shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-rose-400">
                <span>StrataOS v1.0</span>
                <span className="text-zinc-600">•</span>
                <span className="text-cyan-400">CheerpX x86 JIT</span>
              </div>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-100">
                Debian 12 Bookworm — LXQt-panel + Openbox (X11)
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Real i386 Linux rootfs streamed on demand • OPFS SyncAccessHandle
                cache • OffscreenCanvas GPU blitter
              </p>
            </div>
            <div className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
              {globalThis.crossOriginIsolated ? 'COOP/COEP: ON' : 'COI: OFF'}
            </div>
          </div>

          {/* Hardware Telemetry Badges */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
            <div className="rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <HardDrive className="h-3.5 w-3.5 text-emerald-400" />
                <span>OPFS Cache</span>
              </div>
              <div className="mt-1 font-semibold text-zinc-100">
                {opfsState.opfsActive
                  ? opfsState.warmBoot
                    ? `Warm Hit (${hitPct}%)`
                    : `${formatMiB(opfsState.cachedBytes)}`
                  : opfsState.lockStatus === 'held-by-other-tab'
                    ? 'Shared Tab RO'
                    : 'Streaming'}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Zap className="h-3.5 w-3.5 text-cyan-400" />
                <span>Display Blitter</span>
              </div>
              <div className="mt-1 font-semibold text-zinc-100">
                {displayState.backend === 'webgpu'
                  ? 'WebGPU Active'
                  : displayState.backend === '2d-imagebitmap'
                    ? '2D ImageBitmap'
                    : 'Initializing...'}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <ShieldCheck className="h-3.5 w-3.5 text-violet-400" />
                <span>Persistence</span>
              </div>
              <div className="mt-1 font-semibold text-zinc-100">
                {opfsState.persisted ? 'Storage Persisted' : 'IDB + OPFS'}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Cpu className="h-3.5 w-3.5 text-amber-400" />
                <span>I/O Telemetry</span>
              </div>
              <div className="mt-1 font-semibold text-zinc-100">
                {opfsState.decompressing
                  ? `${opfsState.decompressMBs.toFixed(1)} MB/s`
                  : diskLatencyMs > 0
                    ? `${Math.round(diskLatencyMs)} ms`
                    : cpuActive || diskActive
                      ? 'Active'
                      : 'Idle'}
              </div>
            </div>
          </div>

          {/* Stage Progress Bar or Error Card */}
          {stage !== 'error' ? (
            <div className="mt-5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-cyan-300">
                  {opfsState.decompressing
                    ? `Unpacking via DecompressionStream (${formatMiB(opfsState.unpackedBytes)})`
                    : STAGE_LABELS[stage]}
                </span>
                <span className="text-zinc-400">
                  {bootElapsedMs !== null
                    ? `Ready in ${(bootElapsedMs / 1000).toFixed(2)}s`
                    : opfsState.downloadedBytes > 0
                      ? `${formatMiB(opfsState.downloadedBytes)} streamed`
                      : `${progressPct}%`}
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 via-cyan-400 to-emerald-400 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* 3-Step Pipeline Indicator */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                {(
                  [
                    { key: 'streaming', label: '1. Streaming Blocks' },
                    { key: 'starting-xorg', label: '2. Starting Xorg' },
                    { key: 'launching-lxqt', label: '3. Launching LXQt-panel' },
                  ] as const
                ).map((step) => {
                  const stepOrder = [
                    'checking',
                    'streaming',
                    'starting-xorg',
                    'launching-lxqt',
                    'ready',
                  ]
                  const curIdx = stepOrder.indexOf(stage)
                  const stepIdx = stepOrder.indexOf(step.key)
                  const done = curIdx > stepIdx
                  const active = curIdx === stepIdx
                  return (
                    <div
                      key={step.key}
                      className={`rounded border px-2.5 py-1.5 ${
                        done
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : active
                            ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200'
                            : 'border-white/5 bg-[#0d1117]/60 text-zinc-500'
                      }`}
                    >
                      {done ? '✓ ' : active ? '▸ ' : '· '}
                      {step.label}
                    </div>
                  )
                })}
              </div>

              {/* Live Xorg / Boot Console Ticker */}
              {consoleLines.length > 0 && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/70 p-2.5 text-[11px] text-zinc-400 leading-relaxed max-h-24 overflow-hidden">
                  {consoleLines.slice(-3).map((line, i) => (
                    <div key={i} className="truncate">
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs">
              <div className="font-bold text-rose-300">{errorInfo?.title}</div>
              <p className="mt-1 text-zinc-300 leading-relaxed">
                {errorInfo?.detail}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  id="btn-retry-debian-boot"
                  type="button"
                  onClick={triggerReboot}
                  className="inline-flex items-center gap-1.5 rounded bg-cyan-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-cyan-400 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Boot
                </button>
                <button
                  type="button"
                  onClick={() => setBootPhase('tty-recovery')}
                  className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-[#1c212b] px-3 py-1.5 text-zinc-200 hover:border-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Boot Lightweight CLI (unkernel Linux 7.3)
                </button>
                {errorInfo?.isImageBuilding && (
                  <a
                    href="https://github.com/Maor-404/StrataOS/actions/workflows/build-debian-vm.yml"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-[#1c212b] px-3 py-1.5 text-zinc-300 hover:text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Cloud Image Build
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-zinc-400">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBootPhase('uefi-setup')}
                className="rounded border border-white/15 bg-[#181d27] px-2.5 py-1 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                <kbd className="font-bold text-cyan-400">F2</kbd> StrataUEFI
              </button>
              <button
                type="button"
                onClick={() => setBootPhase('tty-recovery')}
                className="rounded border border-white/15 bg-[#181d27] px-2.5 py-1 text-zinc-200 hover:border-amber-400 hover:text-amber-300 cursor-pointer"
              >
                CLI Recovery (unkernel)
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span>User: strata / Pass: strata</span>
              {stage !== 'error' && (
                <button
                  type="button"
                  onClick={() => setOverlayVisible(false)}
                  className="rounded border border-white/10 px-2 py-0.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Show Canvas
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RealDebianDesktop
