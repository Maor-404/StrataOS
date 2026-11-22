import { Maximize2, Minimize2, Minus, Pin, X } from 'lucide-react'
import React, { memo, useCallback, useRef } from 'react'
import { ByteScope } from '../apps/Extras/ByteScope'
import { StrataPaint93 } from '../apps/Extras/StrataPaint93'
import { TermArcade } from '../apps/Extras/TermArcade'
import { StrataCode } from '../apps/StrataCode/StrataCode'
import { StrataCopilot } from '../apps/StrataCopilot/StrataCopilot'
import { StrataFiles } from '../apps/StrataFiles/StrataFiles'
import { StrataGpuStudio } from '../apps/StrataGpuStudio/StrataGpuStudio'
import { StrataMonitor } from '../apps/StrataMonitor/StrataMonitor'
import { StrataSettings } from '../apps/StrataSettings/StrataSettings'
import { StrataStore } from '../apps/StrataStore/StrataStore'
import { StrataStudio } from '../apps/StrataStudio/StrataStudio'
import { StrataTerminal } from '../apps/StrataTerminal/StrataTerminal'
import { WasmAppHost } from '../apps/WasmAppHost/WasmAppHost'
import {
  getWorkArea,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  useOsStore,
  type SnapZone,
  type WindowInstance,
} from '../state/osStore'
import { AppIcon } from './AppIcon'

/**
 * 2026 Modern Web Platform Primitive: Element.prototype.moveBefore
 * Relocates a live DOM subtree (such as an active xterm WebGL canvas or AudioWorklet scope)
 * across containers without resetting iframe/canvas/focus state, with graceful fallback.
 */
export function moveElementPreservingState(
  parent: HTMLElement,
  node: HTMLElement,
  referenceNode: Node | null = null
): void {
  const modernParent = parent as HTMLElement & {
    moveBefore?: (movedNode: Node, refNode: Node | null) => void
  }
  if (typeof modernParent.moveBefore === 'function' && node.parentElement) {
    try {
      modernParent.moveBefore(node, referenceNode)
      return
    } catch {
      // Fallback if moveBefore is rejected across shadow roots
    }
  }
  parent.insertBefore(node, referenceNode)
}

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
  if (win.appId === 'studio') return <StrataStudio />
  if (win.appId === 'store') return <StrataStore />
  if (win.appId === 'files') return <StrataFiles initialPath={win.initialPayload?.filePath} />
  if (win.appId === 'copilot') return <StrataCopilot />
  if (win.appId === 'gpu-studio') return <StrataGpuStudio />
  if (win.appId === 'bytescope') return <ByteScope />
  if (win.appId === 'paint93') return <StrataPaint93 />
  if (win.appId === 'termarcade') return <TermArcade />
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
  const panelPosition = useOsStore((s) => s.settings.panelPosition)
  const wobblyWindows = useOsStore((s) => s.settings.wobblyWindows)
  const peekDesktop = useOsStore((s) => s.peekDesktop)

  const focusWindow = useOsStore((s) => s.focusWindow)
  const closeWindow = useOsStore((s) => s.closeWindow)
  const toggleMinimizeWindow = useOsStore((s) => s.toggleMinimizeWindow)
  const toggleMaximizeWindow = useOsStore((s) => s.toggleMaximizeWindow)
  const toggleKeepAbove = useOsStore((s) => s.toggleKeepAbove)
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
      const topLimit = panelPosition === 'top' ? PANEL_HEIGHT + PANEL_MARGIN : 0
      const bottomLimit = panelPosition === 'bottom' ? vh - PANEL_HEIGHT - 36 : vh - 36

      let startX = win.x
      let startY = win.y
      let currentWidth = win.width
      let currentHeight = win.height

      if (win.isMaximized || win.snapState) {
        currentWidth = win.prevBounds?.width ?? 820
        currentHeight = win.prevBounds?.height ?? 520
        startX = Math.max(12, Math.min(vw - currentWidth - 12, e.clientX - currentWidth / 2))
        startY = Math.max(topLimit, e.clientY - 17)
        el.style.width = `${currentWidth}px`
        el.style.height = `${currentHeight}px`
      }

      const pointerStartX = e.clientX
      const pointerStartY = e.clientY
      let prevClientX = e.clientX
      let prevClientY = e.clientY
      let latestX = startX
      let latestY = startY
      let detectedSnap: SnapZone = null

      el.classList.remove('kwin-wobbly-settle')
      el.style.willChange = 'transform'

      const onPointerMove = (moveEv: PointerEvent) => {
        const dx = moveEv.clientX - pointerStartX
        const dy = moveEv.clientY - pointerStartY
        const vx = moveEv.clientX - prevClientX
        const vy = moveEv.clientY - prevClientY
        prevClientX = moveEv.clientX
        prevClientY = moveEv.clientY

        latestX = startX + dx
        latestY = Math.max(topLimit, Math.min(bottomLimit, startY + dy))

        let nextSnap: SnapZone = null
        if (moveEv.clientX <= 16) {
          nextSnap = 'left'
        } else if (moveEv.clientX >= vw - 16) {
          nextSnap = 'right'
        } else if (moveEv.clientY <= topLimit + 10) {
          nextSnap = 'maximize'
        }

        if (nextSnap !== detectedSnap) {
          detectedSnap = nextSnap
          setActiveSnapPreview(nextSnap)
        }

        const skewX = wobblyWindows ? Math.max(-5, Math.min(5, -vx * 0.22)) : 0
        const skewY = wobblyWindows ? Math.max(-3, Math.min(3, vy * 0.14)) : 0

        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          el.style.transform = wobblyWindows
            ? `translate3d(${Math.round(latestX)}px, ${Math.round(latestY)}px, 0) skew(${skewX.toFixed(2)}deg, ${skewY.toFixed(2)}deg)`
            : `translate3d(${Math.round(latestX)}px, ${Math.round(latestY)}px, 0)`
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
        if (wobblyWindows) {
          el.classList.add('kwin-wobbly-settle')
          el.style.transform = `translate3d(${Math.round(latestX)}px, ${Math.round(latestY)}px, 0)`
          window.setTimeout(() => el.classList.remove('kwin-wobbly-settle'), 240)
        }
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
    [win, windowId, panelPosition, wobblyWindows, focusWindow, commitWindowBounds, setActiveSnapPreview]
  )

  const handleResizeStart = useCallback(
    (dir: ResizeDir, e: React.PointerEvent<HTMLDivElement>) => {
      if (!win || win.isMaximized || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      focusWindow(windowId)

      const el = frameRef.current
      if (!el) return

      const topLimit = panelPosition === 'top' ? PANEL_HEIGHT + PANEL_MARGIN : 0
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
          if (candidateH >= minH && candidateY >= topLimit) {
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
    [win, windowId, panelPosition, focusWindow, commitWindowBounds]
  )

  if (!win) return null

  const isOnActiveWorkspace = win.workspace === activeWorkspace
  const isVisible = isOnActiveWorkspace && !win.isMinimized

  const maxArea = getWorkArea(panelPosition, true)
  const renderX = win.isMaximized ? maxArea.x : win.x
  const renderY = win.isMaximized ? maxArea.y : win.y
  const renderW = win.isMaximized ? maxArea.width : win.width
  const renderH = win.isMaximized ? maxArea.height : win.height

  const effectiveZ = win.zIndex + (win.keepAbove ? 2000 : 0)

  return (
    <div
      ref={frameRef}
      data-window-id={win.id}
      data-app-id={win.appId}
      data-maximized={win.isMaximized ? 'true' : 'false'}
      onMouseDown={() => focusWindow(windowId)}
      style={{
        transform: `translate3d(${renderX}px, ${renderY}px, 0)`,
        width: `${renderW}px`,
        height: `${renderH}px`,
        zIndex: effectiveZ,
        display: isVisible ? 'flex' : 'none',
        opacity: peekDesktop ? 0.08 : 1,
        pointerEvents: peekDesktop ? 'none' : 'auto',
      }}
      className={`fixed top-0 left-0 flex-col overflow-hidden strata-window-surface transition-opacity duration-150 ${
        win.isMaximized ? 'rounded-none' : 'rounded-[10px]'
      } ${isFocused ? 'kwin-shadow-active' : 'kwin-shadow'}`}
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

      {/* KWin Breeze 34px Title Bar: App Icon Left | Centered Title | Pin, Min, Max, Close Right */}
      <div
        onPointerDown={handleDragStart}
        onDoubleClick={() => toggleMaximizeWindow(windowId)}
        className={`grid h-[34px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-2.5 select-none cursor-default ${
          isFocused ? 'breeze-header' : 'breeze-header-inactive'
        }`}
      >
        {/* Left: App Icon + optional WASM chip */}
        <div className="flex items-center gap-1.5 min-w-0">
          <AppIcon
            name={win.icon}
            appId={win.appId}
            className={`h-3.5 w-3.5 shrink-0 ${isFocused ? 'plasma-accent-text' : 'opacity-70'}`}
          />
          {win.wasmPkgId && (
            <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1 py-0.2 font-mono text-[9px] text-emerald-400">
              WASM
            </span>
          )}
        </div>

        {/* Center: Breeze Window Title */}
        <div className="max-w-[320px] truncate px-2 text-center text-xs font-medium tracking-tight">
          {win.title}
        </div>

        {/* Right: Keep Above (Pin), Minimize, Maximize, Close */}
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => toggleKeepAbove(windowId)}
            title={win.keepAbove ? 'Unpin (Normal Layer)' : 'Keep Above Others'}
            aria-label={win.keepAbove ? 'Unpin window' : 'Keep window above others'}
            aria-pressed={Boolean(win.keepAbove)}
            className={`flex h-6 w-6 items-center justify-center rounded-full transition cursor-pointer ${
              win.keepAbove
                ? 'plasma-accent-fill'
                : 'text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)]'
            }`}
          >
            <Pin className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => toggleMinimizeWindow(windowId)}
            title="Minimize"
            aria-label="Minimize window"
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] transition cursor-pointer"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => toggleMaximizeWindow(windowId)}
            title={win.isMaximized ? 'Restore' : 'Maximize'}
            aria-label={win.isMaximized ? 'Restore window' : 'Maximize window'}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] transition cursor-pointer"
          >
            {win.isMaximized ? (
              <Minimize2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => closeWindow(windowId)}
            title="Close Window"
            aria-label="Close window"
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--breeze-text-muted)] hover:bg-[#da4453] hover:text-white transition cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Window Client Body with CSS Container Query context */}
      <div className="relative flex-1 overflow-hidden strata-window-container">
        <WindowContent win={win} />
      </div>
    </div>
  )
})
WindowFrame.displayName = 'WindowFrame'

export const WindowManager: React.FC = () => {
  const windowOrder = useOsStore((s) => s.windowOrder)
  const activeSnapPreview = useOsStore((s) => s.activeSnapPreview)
  const panelPosition = useOsStore((s) => s.settings.panelPosition)

  const snapArea = getWorkArea(panelPosition, activeSnapPreview === 'maximize')

  return (
    <>
      {/* KWin Edge-Snapping Visual Preview Overlay */}
      {activeSnapPreview && (
        <div
          style={{
            top: `${snapArea.y + (activeSnapPreview === 'maximize' ? 0 : PANEL_MARGIN)}px`,
            height: `${snapArea.height - (activeSnapPreview === 'maximize' ? 0 : PANEL_MARGIN * 2)}px`,
            left:
              activeSnapPreview === 'right'
                ? `${Math.floor(snapArea.width / 2) + 4}px`
                : activeSnapPreview === 'maximize'
                  ? '0px'
                  : '6px',
            width:
              activeSnapPreview === 'maximize'
                ? `${snapArea.width}px`
                : `${Math.floor(snapArea.width / 2) - 10}px`,
            borderColor: 'var(--plasma-accent)',
            backgroundColor: 'color-mix(in srgb, var(--plasma-accent) 18%, transparent)',
          }}
          className="pointer-events-none fixed z-[8100] rounded-xl border-2 transition-all duration-100"
        />
      )}

      {windowOrder.map((winId) => (
        <WindowFrame key={winId} windowId={winId} />
      ))}
    </>
  )
}
