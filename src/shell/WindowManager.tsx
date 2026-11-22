import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import React, { memo, useCallback, useRef } from 'react'
import { StrataCode } from '../apps/StrataCode/StrataCode'
import { StrataFiles } from '../apps/StrataFiles/StrataFiles'
import { StrataMonitor } from '../apps/StrataMonitor/StrataMonitor'
import { StrataSettings } from '../apps/StrataSettings/StrataSettings'
import { StrataStore } from '../apps/StrataStore/StrataStore'
import { StrataTerminal } from '../apps/StrataTerminal/StrataTerminal'
import { WasmAppHost } from '../apps/WasmAppHost/WasmAppHost'
import { useOsStore, type SnapZone, type WindowInstance } from '../state/osStore'
import { AppIcon } from './AppIcon'

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_HANDLES: Array<{ dir: ResizeDir; className: string }> = [
  { dir: 'n', className: 'top-0 left-2 right-2 h-1.5 cursor-ns-resize' },
  { dir: 's', className: 'bottom-0 left-2 right-2 h-1.5 cursor-ns-resize' },
  { dir: 'w', className: 'left-0 top-2 bottom-2 w-1.5 cursor-ew-resize' },
  { dir: 'e', className: 'right-0 top-2 bottom-2 w-1.5 cursor-ew-resize' },
  { dir: 'nw', className: 'top-0 left-0 h-3 w-3 cursor-nwse-resize z-20' },
  { dir: 'ne', className: 'top-0 right-0 h-3 w-3 cursor-nesw-resize z-20' },
  { dir: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize z-20' },
  { dir: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize z-20' },
]

const WindowContent: React.FC<{ win: WindowInstance }> = memo(({ win }) => {
  if (win.appId === 'terminal') return <StrataTerminal />
  if (win.appId === 'store') return <StrataStore />
  if (win.appId === 'files') return <StrataFiles initialPath={win.initialPayload?.filePath} />
  if (win.appId === 'code') return <StrataCode initialFilePath={win.initialPayload?.filePath} />
  if (win.appId === 'monitor') return <StrataMonitor />
  if (win.appId === 'settings') return <StrataSettings />
  if (win.wasmPkgId) {
    return (
      <WasmAppHost
        pkgId={win.wasmPkgId}
        initialFilePath={win.initialPayload?.filePath}
        initialArgs={win.initialPayload?.args}
      />
    )
  }
  return null
})
WindowContent.displayName = 'WindowContent'

const WindowFrame: React.FC<{ windowId: string }> = memo(({ windowId }) => {
  const win = useOsStore((s) => s.windows[windowId])
  const activeWorkspace = useOsStore((s) => s.activeWorkspace)
  const isFocused = useOsStore((s) => s.focusedWindowId === windowId)
  const performanceMode = useOsStore((s) => s.settings.performanceMode)

  const focusWindow = useOsStore((s) => s.focusWindow)
  const closeWindow = useOsStore((s) => s.closeWindow)
  const toggleMinimizeWindow = useOsStore((s) => s.toggleMinimizeWindow)
  const toggleMaximizeWindow = useOsStore((s) => s.toggleMaximizeWindow)
  const commitWindowBounds = useOsStore((s) => s.commitWindowBounds)
  const setActiveSnapPreview = useOsStore((s) => s.setActiveSnapPreview)

  const frameRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!win || e.button !== 0) return
      if ((e.target as HTMLElement).closest('button')) return

      e.preventDefault()
      focusWindow(windowId)

      const el = frameRef.current
      if (!el) return

      const vw = window.innerWidth
      const vh = window.innerHeight

      let startX = win.x
      let startY = win.y
      let currentWidth = win.width
      let currentHeight = win.height

      // If maximized or snapped, unmaximize into cursor-centered bounds on drag
      if (win.isMaximized || win.snapState) {
        currentWidth = win.prevBounds?.width ?? 820
        currentHeight = win.prevBounds?.height ?? 520
        startX = Math.max(12, Math.min(vw - currentWidth - 12, e.clientX - currentWidth / 2))
        startY = Math.max(34, e.clientY - 18)
        el.style.width = `${currentWidth}px`
        el.style.height = `${currentHeight}px`
      }

      const pointerStartX = e.clientX
      const pointerStartY = e.clientY
      let latestX = startX
      let latestY = startY
      let detectedSnap: SnapZone = null

      // Enable GPU compositing hint ONLY during active drag
      el.style.willChange = 'transform'

      const onPointerMove = (moveEv: PointerEvent) => {
        const dx = moveEv.clientX - pointerStartX
        const dy = moveEv.clientY - pointerStartY
        latestX = startX + dx
        latestY = Math.max(32, Math.min(vh - 76, startY + dy))

        // Edge-snapping detection
        let nextSnap: SnapZone = null
        if (moveEv.clientX <= 16) {
          nextSnap = 'left'
        } else if (moveEv.clientX >= vw - 16) {
          nextSnap = 'right'
        } else if (moveEv.clientY <= 36) {
          nextSnap = 'maximize'
        }

        if (nextSnap !== detectedSnap) {
          detectedSnap = nextSnap
          setActiveSnapPreview(nextSnap)
        }

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          el.style.transform = `translate3d(${Math.round(latestX)}px, ${Math.round(latestY)}px, 0)`
        })
      }

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }

        // Remove will-change immediately after drag completes to conserve VRAM
        el.style.willChange = 'auto'
        setActiveSnapPreview(null)

        commitWindowBounds(
          windowId,
          {
            x: latestX,
            y: latestY,
            width: currentWidth,
            height: currentHeight,
          },
          detectedSnap
        )
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [win, windowId, focusWindow, commitWindowBounds, setActiveSnapPreview]
  )

  const handleResizeStart = useCallback(
    (dir: ResizeDir, e: React.PointerEvent<HTMLDivElement>) => {
      if (!win || win.isMaximized || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      focusWindow(windowId)

      const el = frameRef.current
      if (!el) return

      const startX = win.x
      const startY = win.y
      const startW = win.width
      const startH = win.height
      const minW = win.minWidth
      const minH = win.minHeight
      const pointerStartX = e.clientX
      const pointerStartY = e.clientY

      let latestX = startX
      let latestY = startY
      let latestW = startW
      let latestH = startH

      // Apply GPU compositing hint ONLY during active resize
      el.style.willChange = 'transform, width, height'

      const onPointerMove = (moveEv: PointerEvent) => {
        const dx = moveEv.clientX - pointerStartX
        const dy = moveEv.clientY - pointerStartY

        if (dir.includes('e')) {
          latestW = Math.max(minW, startW + dx)
        }
        if (dir.includes('s')) {
          latestH = Math.max(minH, startH + dy)
        }
        if (dir.includes('w')) {
          const candidateW = startW - dx
          if (candidateW >= minW) {
            latestW = candidateW
            latestX = startX + dx
          }
        }
        if (dir.includes('n')) {
          const candidateH = startH - dy
          const candidateY = startY + dy
          if (candidateH >= minH && candidateY >= 32) {
            latestH = candidateH
            latestY = candidateY
          }
        }

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          el.style.transform = `translate3d(${Math.round(latestX)}px, ${Math.round(latestY)}px, 0)`
          el.style.width = `${Math.round(latestW)}px`
          el.style.height = `${Math.round(latestH)}px`
        })
      }

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }

        el.style.willChange = 'auto'
        commitWindowBounds(windowId, {
          x: latestX,
          y: latestY,
          width: latestW,
          height: latestH,
        })
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [win, windowId, focusWindow, commitWindowBounds]
  )

  if (!win) return null

  const isOnActiveWorkspace = win.workspace === activeWorkspace
  const isVisible = isOnActiveWorkspace && !win.isMinimized

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  const renderX = win.isMaximized ? 0 : win.x
  const renderY = win.isMaximized ? 32 : win.y
  const renderW = win.isMaximized ? vw : win.width
  const renderH = win.isMaximized ? vh - 32 - 70 : win.height

  return (
    <div
      ref={frameRef}
      onMouseDown={() => focusWindow(windowId)}
      style={{
        transform: `translate3d(${renderX}px, ${renderY}px, 0)`,
        width: `${renderW}px`,
        height: `${renderH}px`,
        zIndex: win.zIndex,
        display: isVisible ? 'flex' : 'none',
      }}
      className={`fixed top-0 left-0 flex-col overflow-hidden ${
        win.isMaximized ? 'rounded-none' : 'rounded-xl'
      } border transition-shadow duration-150 ${
        isFocused
          ? 'border-cyan-500/40 shadow-[0_24px_60px_rgba(0,0,0,0.75)]'
          : 'border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.5)]'
      } ${performanceMode ? 'bg-zinc-950' : 'bg-zinc-950/90 backdrop-blur-xl'}`}
    >
      {/* 8-Directional Resize Handles */}
      {!win.isMaximized &&
        RESIZE_HANDLES.map((h) => (
          <div
            key={h.dir}
            onPointerDown={(e) => handleResizeStart(h.dir, e)}
            className={`absolute ${h.className}`}
          />
        ))}

      {/* Window Title Bar */}
      <div
        onPointerDown={handleDragStart}
        onDoubleClick={() => toggleMaximizeWindow(windowId)}
        className={`flex h-9 shrink-0 items-center justify-between border-b px-3 select-none cursor-default ${
          isFocused
            ? 'border-white/10 bg-zinc-900/90 text-zinc-100'
            : 'border-white/5 bg-zinc-900/50 text-zinc-400'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AppIcon name={win.icon} className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <span className="truncate text-xs font-medium tracking-tight">{win.title}</span>
          {win.wasmPkgId && (
            <span className="rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.2 font-mono text-[9px] text-cyan-300">
              WASM
            </span>
          )}
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleMinimizeWindow(windowId)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            title="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => toggleMaximizeWindow(windowId)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            title={win.isMaximized ? 'Restore' : 'Maximize'}
          >
            {win.isMaximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => closeWindow(windowId)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-red-500/25 hover:text-red-300"
            title="Close Window"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Window Client Body */}
      <div className="relative flex-1 overflow-hidden">
        <WindowContent win={win} />
      </div>
    </div>
  )
})
WindowFrame.displayName = 'WindowFrame'

export const WindowManager: React.FC = () => {
  const windowOrder = useOsStore((s) => s.windowOrder)
  const activeSnapPreview = useOsStore((s) => s.activeSnapPreview)

  return (
    <>
      {/* Edge-Snapping Visual Preview Overlay */}
      {activeSnapPreview && (
        <div
          className={`pointer-events-none fixed z-[8500] rounded-xl border-2 border-cyan-400/60 bg-cyan-500/15 transition-all duration-100 ${
            activeSnapPreview === 'left'
              ? 'top-9 bottom-20 left-2 w-[calc(50%-12px)]'
              : activeSnapPreview === 'right'
              ? 'top-9 bottom-20 right-2 w-[calc(50%-12px)]'
              : 'top-8 bottom-[70px] left-1 right-1'
          }`}
        />
      )}

      {windowOrder.map((winId) => (
        <WindowFrame key={winId} windowId={winId} />
      ))}
    </>
  )
}
