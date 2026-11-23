/**
 * Host Viewport & Direct Input Bridge (`src/wayland/WaylandViewport.tsx`)
 *
 * - Transfers a full-viewport `<canvas>` via `canvas.transferControlToOffscreen()` to
 *   `waylandCompositor.worker.ts`.
 * - Tracks DPI-aware container sizing via `ResizeObserver` (`devicePixelRatio`).
 * - Forwards native Pointer Events (`setPointerCapture`), Wheel, and Keyboard input
 *   directly to the compositor Worker for zero-latency compositor-side hit-testing,
 *   window dragging, focus management, and surface-local `wl_pointer`/`wl_keyboard` delivery.
 * - Includes the built-in Synthetic Wayland Stress Harness (`?wayland-demo=1` or toggle)
 *   and a live HUD overlay reporting uploaded KB/frame, GPU pass time (ms), and
 *   input-to-photon latency.
 */

import {
  Activity,
  ArrowLeft,
  Cpu,
  Eye,
  EyeOff,
  Gauge,
  Layers,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Wrench,
  Zap,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  createWaylandTransport,
  type WaylandCompositorTelemetry,
  type WaylandSharedTransport,
} from './shmRing'
import {
  SyntheticWaylandClient,
  type WaylandStressMode,
} from './syntheticWaylandClient'

export interface WaylandViewportProps {
  /** Auto-start the built-in 3-surface synthetic Wayland stress harness on mount */
  autoStartDemo?: boolean
  /** Optional external shared transport when hosting a guest Wayland bridge */
  externalTransport?: WaylandSharedTransport
  /** Optional navigation handler to return to the Real Debian VM (`/`) */
  onExitLab?: () => void
  /** Optional navigation handler to open StrataUEFI */
  onOpenUefi?: () => void
}

function formatUploadSize(bytes: number): string {
  if (bytes <= 0) return '0.00 KB'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(2)} KB`
}

function encodeModifiers(e: KeyboardEvent): number {
  return (
    (e.shiftKey ? 1 : 0) |
    (e.ctrlKey ? 2 : 0) |
    (e.altKey ? 4 : 0) |
    (e.metaKey ? 8 : 0)
  )
}

export const WaylandViewport: React.FC<WaylandViewportProps> = ({
  autoStartDemo = true,
  externalTransport,
  onExitLab,
  onOpenUefi,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const transportRef = useRef<WaylandSharedTransport | null>(null)
  const clientRef = useRef<SyntheticWaylandClient | null>(null)
  const activePointerIdRef = useRef<number | null>(null)

  const [demoRunning, setDemoRunning] = useState(autoStartDemo)
  const [stressMode, setStressMode] = useState<WaylandStressMode>('stream')
  const [showDamageOverlay, setShowDamageOverlay] = useState(true)
  const [hudExpanded, setHudExpanded] = useState(true)

  const [telemetry, setTelemetry] = useState<WaylandCompositorTelemetry>({
    backend: 'initializing',
    adapterName: '',
    sharedMemoryActive: false,
    viewportWidth: 1280,
    viewportHeight: 800,
    dpr: 1,
    fps: 0,
    uploadedBytesFrame: 0,
    uploadedBytesAvg: 0,
    fullScreenBytes: 1280 * 800 * 4,
    bandwidthSavedPct: 100,
    damageRectsFrame: 0,
    gpuPassTimeMs: 0,
    inputToPhotonMs: 0,
    surfaceCount: 0,
    focusedSurfaceId: 0,
    totalCommits: 0,
    frameCallbacksSent: 0,
  })

  // Boot OffscreenCanvas WebGPU compositor worker + ResizeObserver + Direct Input Bridge
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    host.innerHTML = ''
    const canvas = document.createElement('canvas')
    canvas.id = 'wayland-compositor-canvas'
    canvas.tabIndex = 0
    canvas.className = 'block h-full w-full cursor-default touch-none outline-none'
    host.appendChild(canvas)

    const rect = host.getBoundingClientRect()
    const initW = Math.max(320, Math.floor(rect.width || window.innerWidth))
    const initH = Math.max(240, Math.floor(rect.height || window.innerHeight))
    const initDpr = window.devicePixelRatio || 1

    const transport = externalTransport ?? createWaylandTransport()
    transportRef.current = transport

    const offscreen = canvas.transferControlToOffscreen()
    const worker = new Worker(
      new URL('./waylandCompositor.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as {
        type?: string
        snapshot?: WaylandCompositorTelemetry
      }
      if (msg.type === 'telemetry' && msg.snapshot) {
        setTelemetry(msg.snapshot)
      }
    }

    worker.postMessage(
      {
        type: 'init',
        canvas: offscreen,
        width: initW,
        height: initH,
        dpr: initDpr,
        shmBuffer: transport.shmPool.buffer,
        commandBuffer: transport.commandRing.buffer,
        eventBuffer: transport.eventRing.buffer,
        showDamageOverlay: true,
      },
      [offscreen]
    )

    // Start built-in Synthetic Wayland Stress Harness when requested
    if (autoStartDemo) {
      const client = new SyntheticWaylandClient(transport, initW, initH, 'stream')
      clientRef.current = client
      client.start()
    }

    // DPI-aware ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const nextW = Math.max(320, Math.floor(entry.contentRect.width))
      const nextH = Math.max(240, Math.floor(entry.contentRect.height))
      const nextDpr = window.devicePixelRatio || 1
      worker.postMessage({
        type: 'resize',
        width: nextW,
        height: nextH,
        dpr: nextDpr,
      })
      clientRef.current?.resizeViewport(nextW, nextH)
    })
    resizeObserver.observe(host)

    // Direct Pointer + Wheel + Keyboard bridge to Compositor Worker (surface-local hit testing)
    const getCanvasPos = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect()
      return {
        x: clientX - r.left,
        y: clientY - r.top,
      }
    }

    const nowEpochMs = () => performance.timeOrigin + performance.now()

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      canvas.focus({ preventScroll: true })
      try {
        canvas.setPointerCapture(e.pointerId)
        activePointerIdRef.current = e.pointerId
      } catch {
        // ignore synthetic/unsupported capture
      }
      const { x, y } = getCanvasPos(e.clientX, e.clientY)
      worker.postMessage({
        type: 'pointer',
        kind: 'down',
        x,
        y,
        button: e.button,
        timestampMs: nowEpochMs(),
      })
    }

    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = getCanvasPos(e.clientX, e.clientY)
      worker.postMessage({
        type: 'pointer',
        kind: 'move',
        x,
        y,
        button: e.button,
        timestampMs: nowEpochMs(),
      })
    }

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current === e.pointerId) {
        try {
          if (canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId)
          }
        } catch {
          // ignore
        }
        activePointerIdRef.current = null
      }
      const { x, y } = getCanvasPos(e.clientX, e.clientY)
      worker.postMessage({
        type: 'pointer',
        kind: 'up',
        x,
        y,
        button: e.button,
        timestampMs: nowEpochMs(),
      })
    }

    const onPointerLeave = () => {
      if (activePointerIdRef.current !== null) return
      worker.postMessage({
        type: 'pointer',
        kind: 'leave',
        x: 0,
        y: 0,
        button: 0,
        timestampMs: nowEpochMs(),
      })
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { x, y } = getCanvasPos(e.clientX, e.clientY)
      worker.postMessage({
        type: 'wheel',
        x,
        y,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        timestampMs: nowEpochMs(),
      })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5' || e.key === 'F12') return
      if (
        document.activeElement instanceof HTMLButtonElement ||
        document.activeElement instanceof HTMLInputElement
      ) {
        return
      }
      if (e.key === 'Backspace' || e.key === ' ' || e.key === 'Tab') {
        e.preventDefault()
      }
      const charCode = e.key.length === 1 ? e.key.charCodeAt(0) : 0
      worker.postMessage({
        type: 'keyboard',
        pressed: true,
        keyCode: e.keyCode || e.which || 0,
        modifiers: encodeModifiers(e),
        charCode,
        timestampMs: nowEpochMs(),
      })
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const charCode = e.key.length === 1 ? e.key.charCodeAt(0) : 0
      worker.postMessage({
        type: 'keyboard',
        pressed: false,
        keyCode: e.keyCode || e.which || 0,
        modifiers: encodeModifiers(e),
        charCode,
        timestampMs: nowEpochMs(),
      })
    }

    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      resizeObserver.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)

      clientRef.current?.stop()
      clientRef.current = null
      worker.postMessage({ type: 'dispose' })
      worker.terminate()
      workerRef.current = null
      transportRef.current = null
      host.innerHTML = ''
    }
  }, [autoStartDemo, externalTransport])

  const handleToggleDemo = useCallback(() => {
    const transport = transportRef.current
    const host = hostRef.current
    if (!transport || !host) return

    if (clientRef.current) {
      clientRef.current.stop()
      clientRef.current = null
      setDemoRunning(false)
      workerRef.current?.postMessage({ type: 'nudge' })
    } else {
      const rect = host.getBoundingClientRect()
      const client = new SyntheticWaylandClient(
        transport,
        Math.floor(rect.width || window.innerWidth),
        Math.floor(rect.height || window.innerHeight),
        stressMode
      )
      clientRef.current = client
      client.start()
      setDemoRunning(true)
    }
  }, [stressMode])

  const handleChangeMode = useCallback((next: WaylandStressMode) => {
    setStressMode(next)
    clientRef.current?.setMode(next)
  }, [])

  const handleToggleDamageOverlay = useCallback(() => {
    setShowDamageOverlay((prev) => {
      const next = !prev
      workerRef.current?.postMessage({ type: 'setDamageOverlay', enabled: next })
      return next
    })
  }, [])

  const handleResetWindows = useCallback(() => {
    clientRef.current?.resetWindowLayout()
  }, [])

  return (
    <div
      id="wayland-lab-viewport"
      className="relative h-screen w-screen overflow-hidden bg-[#0a0e14] text-zinc-100 select-none"
    >
      {/* Full-Viewport OffscreenCanvas WebGPU Compositor Surface */}
      <div ref={hostRef} className="h-full w-full" />

      {/* Top Navigation & Controls Bar */}
      <div className="fixed top-2.5 left-2.5 right-2.5 z-[60] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d1117]/88 px-3 py-1.5 text-xs font-mono backdrop-blur-md shadow-xl">
          <span className="inline-flex h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
          <span className="font-bold tracking-tight text-zinc-100">
            StrataOS Wayland Lab
          </span>
          <span className="hidden sm:inline text-zinc-500">•</span>
          <span className="hidden sm:inline text-[11px] text-cyan-300">
            {telemetry.backend === 'webgpu'
              ? 'WebGPU Compositor'
              : telemetry.backend === '2d-dirtyrect'
                ? 'OffscreenCanvas 2D Dirty-Rect'
                : 'Initializing...'}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              telemetry.sharedMemoryActive
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            }`}
          >
            {telemetry.sharedMemoryActive ? 'SAB + Atomics' : 'ArrayBuffer'}
          </span>
        </div>

        {/* Stress Harness & Route Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#0d1117]/88 px-2 py-1.5 text-[11px] font-mono backdrop-blur-md shadow-xl">
          <button
            id="btn-wayland-toggle-demo"
            type="button"
            onClick={handleToggleDemo}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium cursor-pointer transition-colors ${
              demoRunning
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
            }`}
          >
            {demoRunning ? (
              <>
                <Square className="h-3 w-3" /> Stop Harness
              </>
            ) : (
              <>
                <Play className="h-3 w-3" /> Start Harness
              </>
            )}
          </button>

          {demoRunning && (
            <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5">
              {(
                [
                  { id: 'idle', label: 'Idle Cursor' },
                  { id: 'stream', label: '60fps Logs' },
                  { id: 'burst', label: 'Burst Stress' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  id={`btn-wayland-mode-${m.id}`}
                  type="button"
                  onClick={() => handleChangeMode(m.id)}
                  className={`rounded-md px-2 py-0.5 cursor-pointer transition-colors ${
                    stressMode === m.id
                      ? 'bg-cyan-500/25 text-cyan-200'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <button
            id="btn-wayland-damage-overlay"
            type="button"
            onClick={handleToggleDamageOverlay}
            title="Highlight exact wl_surface.damage_buffer rectangles uploaded each frame"
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 cursor-pointer transition-colors ${
              showDamageOverlay
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
            }`}
          >
            {showDamageOverlay ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
            <span className="hidden md:inline">Damage Rects</span>
          </button>

          {demoRunning && (
            <button
              id="btn-wayland-reset"
              type="button"
              onClick={handleResetWindows}
              title="Reset surface window positions"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-zinc-300 hover:bg-white/10 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}

          <div className="mx-0.5 h-4 w-px bg-white/15" />

          {onOpenUefi && (
            <button
              id="btn-wayland-uefi"
              type="button"
              onClick={onOpenUefi}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-zinc-300 hover:bg-white/10 hover:text-cyan-300 cursor-pointer"
            >
              <Wrench className="h-3 w-3" />
              <span>UEFI</span>
            </button>
          )}

          {onExitLab && (
            <button
              id="btn-wayland-back-vm"
              type="button"
              onClick={onExitLab}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-zinc-100 hover:border-cyan-400/50 hover:text-cyan-300 cursor-pointer"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Debian VM</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Low-Latency Wayland Compositor Telemetry HUD */}
      <div
        id="wayland-telemetry-hud"
        className="fixed bottom-11 right-3 z-[60] w-80 rounded-xl border border-white/12 bg-[#0d1117]/90 font-mono text-[11px] text-zinc-200 backdrop-blur-md shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
            <Activity className="h-3.5 w-3.5" />
            <span>Compositor Telemetry</span>
          </div>
          <button
            type="button"
            onClick={() => setHudExpanded((v) => !v)}
            className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-zinc-100 cursor-pointer"
          >
            {hudExpanded ? 'Hide' : 'Show'}
          </button>
        </div>

        {hudExpanded && (
          <div className="space-y-2.5 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Zap className="h-3 w-3 text-cyan-400" />
                  <span>Uploaded / Frame</span>
                </div>
                <div
                  id="hud-uploaded-kb"
                  className="mt-0.5 text-sm font-bold text-emerald-300"
                >
                  {formatUploadSize(telemetry.uploadedBytesFrame)}
                </div>
                <div className="text-[10px] text-zinc-500">
                  avg {formatUploadSize(telemetry.uploadedBytesAvg)} •{' '}
                  {telemetry.bandwidthSavedPct.toFixed(1)}% saved
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Gauge className="h-3 w-3 text-amber-400" />
                  <span>GPU Pass Time</span>
                </div>
                <div
                  id="hud-gpu-pass-ms"
                  className="mt-0.5 text-sm font-bold text-amber-300"
                >
                  {telemetry.gpuPassTimeMs.toFixed(2)} ms
                </div>
                <div className="text-[10px] text-zinc-500">
                  {telemetry.fps} fps • {telemetry.damageRectsFrame} dirty rect
                  {telemetry.damageRectsFrame === 1 ? '' : 's'}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Cpu className="h-3 w-3 text-rose-400" />
                  <span>Input-to-Photon</span>
                </div>
                <div
                  id="hud-input-latency"
                  className="mt-0.5 text-sm font-bold text-rose-300"
                >
                  {telemetry.inputToPhotonMs > 0
                    ? `${telemetry.inputToPhotonMs.toFixed(2)} ms`
                    : 'Ready'}
                </div>
                <div className="text-[10px] text-zinc-500">
                  worker hit-test + native drag
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Layers className="h-3 w-3 text-violet-400" />
                  <span>Wayland Surfaces</span>
                </div>
                <div className="mt-0.5 text-sm font-bold text-violet-300">
                  {telemetry.surfaceCount} active
                </div>
                <div className="text-[10px] text-zinc-500">
                  {telemetry.frameCallbacksSent} wl_callback.done
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[10px] text-zinc-400">
              <span className="inline-flex items-center gap-1 truncate">
                <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" />
                <span className="truncate">
                  {telemetry.adapterName || 'Initializing GPU'}
                </span>
              </span>
              <span className="shrink-0 pl-2 text-zinc-500">
                {telemetry.viewportWidth}×{telemetry.viewportHeight} @
                {telemetry.dpr.toFixed(1)}x
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
