import {
  Activity,
  ArrowUpDown,
  Clock,
  GripHorizontal,
  Image,
  Plus,
  Rocket,
  StickyNote,
  X,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  NATIVE_APPS,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  useOsStore,
  type AppId,
  type NativeAppId,
  type PlasmoidInstance,
  type PlasmoidType,
  type WallpaperId,
} from '../state/osStore'
import { AppIcon } from './AppIcon'

const WALLPAPER_ORDER: WallpaperId[] = [
  'obsidian-grid',
  'carbon-slate',
  'midnight-aurora',
  'deep-abyss',
]

const PLASMOID_META: Record<
  PlasmoidType,
  { label: string; minW: number; minH: number }
> = {
  sysmon: { label: 'System Monitor', minW: 220, minH: 132 },
  clock: { label: 'Plasma Clock', minW: 150, minH: 150 },
  note: { label: 'Sticky Note', minW: 180, minH: 130 },
  quicklaunch: { label: 'Quick Launch', minW: 190, minH: 84 },
}

const RingGauge: React.FC<{
  label: string
  valueText: string
  ratio: number
  color: string
}> = ({ label, valueText, ratio, color }) => {
  const clamped = Math.max(0.05, Math.min(1, ratio))
  const r = 20
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - clamped)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-12 w-12">
        <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            stroke="var(--breeze-border-strong)"
            strokeWidth="4"
          />
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-semibold">
          {valueText}
        </div>
      </div>
      <span className="text-[10px] text-[var(--breeze-text-muted)]">{label}</span>
    </div>
  )
}

const SysMonBody: React.FC = () => {
  const workerLatencyMs = useOsStore((s) => s.workerLatencyMs)
  const windowCount = useOsStore((s) => Object.keys(s.windows).length)
  const pkgCount = useOsStore((s) => s.installedPackages.length)
  const [storagePct, setStoragePct] = useState(4)
  const [storageMb, setStorageMb] = useState('12M')

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate()
          const usage = est.usage ?? 0
          const quota = est.quota ?? 1
          if (active) {
            setStoragePct(Math.max(1, Math.round((usage / quota) * 100)))
            const mb = usage / (1024 * 1024)
            setStorageMb(mb >= 1 ? `${mb.toFixed(0)}M` : `${Math.max(1, Math.round(usage / 1024))}K`)
          }
        }
      } catch {
        // ignore storage quota errors
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), 8000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <div className="flex h-full items-center justify-around px-2 py-2">
      <RingGauge
        label="RPC"
        valueText={`${workerLatencyMs.toFixed(1)}ms`}
        ratio={Math.min(1, workerLatencyMs / 25)}
        color="var(--plasma-accent)"
      />
      <RingGauge
        label="ext4"
        valueText={storageMb}
        ratio={Math.max(0.08, storagePct / 100)}
        color="#10b981"
      />
      <RingGauge
        label="Procs"
        valueText={`${windowCount + pkgCount + 3}`}
        ratio={Math.min(1, (windowCount + pkgCount + 3) / 24)}
        color="#f59e0b"
      />
    </div>
  )
}

const ClockBody: React.FC<{
  plasmoid: PlasmoidInstance
  onToggleMode: () => void
}> = ({ plasmoid, onToggleMode }) => {
  const [now, setNow] = useState(() => new Date())
  const analog = plasmoid.data?.analog !== false

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const secDeg = now.getSeconds() * 6
  const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1
  const hrDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5

  return (
    <button
      type="button"
      onClick={onToggleMode}
      title="Click to switch between Analog and Digital clock"
      className="flex h-full w-full flex-col items-center justify-center p-2 cursor-pointer"
    >
      {analog ? (
        <svg viewBox="0 0 100 100" className="h-[112px] w-[112px]" aria-label="Analog Plasma Clock">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="var(--breeze-base)"
            stroke="var(--breeze-border-strong)"
            strokeWidth="2.5"
          />
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
            <line
              key={deg}
              x1="50"
              y1="10"
              x2="50"
              y2={deg % 90 === 0 ? '17' : '13'}
              stroke="var(--breeze-text-muted)"
              strokeWidth={deg % 90 === 0 ? '2' : '1'}
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="27"
            stroke="var(--breeze-text)"
            strokeWidth="3"
            strokeLinecap="round"
            transform={`rotate(${hrDeg} 50 50)`}
          />
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="18"
            stroke="var(--breeze-text)"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${minDeg} 50 50)`}
          />
          <line
            x1="50"
            y1="54"
            x2="50"
            y2="15"
            stroke="var(--plasma-accent)"
            strokeWidth="1.2"
            strokeLinecap="round"
            transform={`rotate(${secDeg} 50 50)`}
          />
          <circle cx="50" cy="50" r="3" fill="var(--plasma-accent)" />
        </svg>
      ) : (
        <div className="text-center">
          <div className="font-mono text-2xl font-bold tracking-tight">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="mt-1 text-[11px] text-[var(--breeze-text-muted)]">
            {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
      )}
    </button>
  )
}

const QuickLaunchBody: React.FC<{ apps: AppId[] }> = ({ apps }) => {
  const openApp = useOsStore((s) => s.openApp)
  const list = apps.length > 0 ? apps : (['terminal', 'store', 'gpu-studio', 'copilot'] as AppId[])

  return (
    <div className="grid h-full grid-cols-4 items-center gap-1.5 px-2.5 py-2">
      {list.map((appId) => {
        const meta = !appId.startsWith('wasm:') ? NATIVE_APPS[appId as NativeAppId] : null
        return (
          <button
            key={appId}
            type="button"
            onClick={() => openApp(appId)}
            title={meta?.name ?? appId}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)]/80 py-2 hover:border-[var(--plasma-accent)] transition cursor-pointer"
          >
            <AppIcon
              name={meta?.icon ?? 'Box'}
              appId={appId}
              className="h-4 w-4 plasma-accent-text"
            />
            <span className="max-w-full truncate px-1 text-[9px] text-[var(--breeze-text-muted)]">
              {meta?.name.replace('Strata ', '') ?? appId}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const PlasmoidCard: React.FC<{
  plasmoid: PlasmoidInstance
  editMode: boolean
  announce: (msg: string) => void
}> = ({ plasmoid, editMode, announce }) => {
  const updatePlasmoid = useOsStore((s) => s.updatePlasmoid)
  const removePlasmoid = useOsStore((s) => s.removePlasmoid)
  const panelPosition = useOsStore((s) => s.settings.panelPosition)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLButtonElement | null>(null)
  const dragStartRef = useRef<{
    clientX: number
    clientY: number
    x: number
    y: number
    scale: number
  } | null>(null)
  const posRef = useRef({ x: plasmoid.x, y: plasmoid.y })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    posRef.current = { x: plasmoid.x, y: plasmoid.y }
  }, [plasmoid.x, plasmoid.y])

  const meta = PLASMOID_META[plasmoid.type]

  const getCanvasScale = useCallback(() => {
    const canvas = cardRef.current?.closest('.plasma-desktop-canvas') as HTMLElement | null
    if (!canvas || !canvas.offsetWidth) return 1
    return canvas.getBoundingClientRect().width / canvas.offsetWidth || 1
  }, [])

  const clampPos = useCallback(
    (left: number, top: number) => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const topMin = panelPosition === 'top' ? PANEL_HEIGHT + PANEL_MARGIN * 2 : 8
      const bottomMargin = panelPosition === 'bottom' ? PANEL_HEIGHT + PANEL_MARGIN * 2 : 8
      const maxLeft = Math.max(8, vw - plasmoid.w - 8)
      const maxTop = Math.max(topMin, vh - bottomMargin - plasmoid.h)
      return {
        x: Math.round(Math.max(8, Math.min(left, maxLeft))),
        y: Math.round(Math.max(topMin, Math.min(top, maxTop))),
      }
    },
    [panelPosition, plasmoid.w, plasmoid.h]
  )

  const moveTo = useCallback(
    (left: number, top: number, commit = false) => {
      const clamped = clampPos(left, top)
      posRef.current = clamped
      if (cardRef.current) {
        cardRef.current.style.left = `${clamped.x}px`
        cardRef.current.style.top = `${clamped.y}px`
      }
      if (commit) {
        updatePlasmoid(plasmoid.id, { x: clamped.x, y: clamped.y })
      }
    },
    [clampPos, plasmoid.id, updatePlasmoid]
  )

  // Dedicated pointer-captured drag handle (following modern-web-guidance `drag`)
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const handle = handleRef.current
    if (!handle) return
    e.stopPropagation()
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      x: posRef.current.x,
      y: posRef.current.y,
      scale: getCanvasScale(),
    }
    handle.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const handle = handleRef.current
    const start = dragStartRef.current
    if (!handle?.hasPointerCapture(e.pointerId) || !start) return
    const nextX = start.x + (e.clientX - start.clientX) / start.scale
    const nextY = start.y + (e.clientY - start.clientY) / start.scale
    moveTo(nextX, nextY, false)
  }

  const handleLostCapture = () => {
    if (!dragStartRef.current) return
    dragStartRef.current = null
    setDragging(false)
    updatePlasmoid(plasmoid.id, { x: posRef.current.x, y: posRef.current.y })
  }

  // Keyboard arrow movement (15px step) when drag handle has focus
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = 15
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      moveTo(posRef.current.x - step, posRef.current.y, true)
      announce(`${meta.label} widget moved left`)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      moveTo(posRef.current.x + step, posRef.current.y, true)
      announce(`${meta.label} widget moved right`)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveTo(posRef.current.x, posRef.current.y - step, true)
      announce(`${meta.label} widget moved up`)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveTo(posRef.current.x, posRef.current.y + step, true)
      announce(`${meta.label} widget moved down`)
    }
  }

  // Bottom-right corner resize handle
  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const startW = plasmoid.w
    const startH = plasmoid.h
    const scale = getCanvasScale()
    let nextW = startW
    let nextH = startH

    const onMove = (ev: PointerEvent) => {
      nextW = Math.max(meta.minW, Math.min(520, startW + (ev.clientX - startX) / scale))
      nextH = Math.max(meta.minH, Math.min(440, startH + (ev.clientY - startY) / scale))
      if (cardRef.current) {
        cardRef.current.style.width = `${Math.round(nextW)}px`
        cardRef.current.style.height = `${Math.round(nextH)}px`
      }
    }

    const onEnd = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('lostpointercapture', onEnd)
      updatePlasmoid(plasmoid.id, { w: Math.round(nextW), h: Math.round(nextH) })
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('lostpointercapture', onEnd)
  }

  return (
    <section
      ref={cardRef}
      data-plasmoid-id={plasmoid.id}
      data-plasmoid-type={plasmoid.type}
      aria-label={meta.label}
      style={{
        left: `${plasmoid.x}px`,
        top: `${plasmoid.y}px`,
        width: `${plasmoid.w}px`,
        height: `${plasmoid.h}px`,
      }}
      className={`group fixed flex flex-col overflow-hidden rounded-xl border transition-shadow ${
        editMode
          ? 'z-[7500] border-[var(--plasma-accent)] ring-1 ring-[var(--plasma-accent)]/40 shadow-2xl'
          : 'z-[9] border-[var(--breeze-border)] shadow-lg'
      } ${
        plasmoid.type === 'note'
          ? 'bg-amber-950/75 text-amber-50 backdrop-blur-md'
          : 'plasma-panel-blur text-[var(--breeze-text)]'
      }`}
    >
      {/* Plasmoid Header with dedicated accessible drag handle */}
      <div
        className={`flex h-7 shrink-0 items-center justify-between border-b px-2 ${
          plasmoid.type === 'note'
            ? 'border-amber-400/20 bg-amber-900/50'
            : 'border-[var(--breeze-border)] bg-[var(--breeze-header)]/70'
        }`}
      >
        <button
          ref={handleRef}
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onLostPointerCapture={handleLostCapture}
          onKeyDown={handleKeyDown}
          aria-label={`${meta.label} widget handle. Use arrow keys to move.`}
          className={`plasmoid-drag-handle flex flex-1 items-center gap-1.5 text-left text-[11px] font-medium focus:outline-none focus-visible:underline ${
            dragging ? 'dragging' : ''
          }`}
        >
          <GripHorizontal className="h-3.5 w-3.5 opacity-60 shrink-0" aria-hidden="true" />
          <span className="truncate">{meta.label}</span>
        </button>

        <button
          type="button"
          onClick={() => removePlasmoid(plasmoid.id)}
          title={`Remove ${meta.label}`}
          aria-label={`Remove ${meta.label}`}
          className={`rounded p-0.5 transition cursor-pointer ${
            editMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
          } hover:bg-red-500/25 hover:text-red-300`}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {/* Plasmoid Body (selectable/interactive content kept outside drag handle) */}
      <div className="relative flex-1 overflow-hidden">
        {plasmoid.type === 'sysmon' && <SysMonBody />}
        {plasmoid.type === 'clock' && (
          <ClockBody
            plasmoid={plasmoid}
            onToggleMode={() =>
              updatePlasmoid(plasmoid.id, {
                data: { ...plasmoid.data, analog: plasmoid.data?.analog === false },
              })
            }
          />
        )}
        {plasmoid.type === 'note' && (
          <textarea
            value={plasmoid.data?.text ?? ''}
            onChange={(e) =>
              updatePlasmoid(plasmoid.id, {
                data: { ...plasmoid.data, text: e.target.value },
              })
            }
            placeholder="Write a persistent note..."
            aria-label="Sticky note text"
            className="h-full w-full resize-none bg-transparent p-2.5 font-mono text-[11px] leading-relaxed text-amber-50 placeholder:text-amber-200/50 focus:outline-none select-text"
          />
        )}
        {plasmoid.type === 'quicklaunch' && (
          <QuickLaunchBody apps={plasmoid.data?.apps ?? []} />
        )}
      </div>

      {/* Bottom-right resize grip */}
      <div
        onPointerDown={handleResizePointerDown}
        title="Drag to resize widget"
        className={`absolute right-0 bottom-0 h-3.5 w-3.5 cursor-nwse-resize ${
          editMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-80'
        }`}
      >
        <svg viewBox="0 0 12 12" className="h-full w-full text-[var(--plasma-accent)]" aria-hidden="true">
          <path d="M11 3L3 11M11 7L7 11" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
    </section>
  )
}

export const PlasmoidsLayer: React.FC = () => {
  const plasmoids = useOsStore((s) => s.plasmoids)
  const editMode = useOsStore((s) => s.editMode)
  const setEditMode = useOsStore((s) => s.setEditMode)
  const addPlasmoid = useOsStore((s) => s.addPlasmoid)
  const settings = useOsStore((s) => s.settings)
  const updateSettings = useOsStore((s) => s.updateSettings)

  const [widgetTrayOpen, setWidgetTrayOpen] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const liveTimerRef = useRef<number | null>(null)

  const announce = useCallback((msg: string) => {
    setLiveMessage(msg)
    if (liveTimerRef.current) window.clearTimeout(liveTimerRef.current)
    liveTimerRef.current = window.setTimeout(() => setLiveMessage(''), 1000)
  }, [])

  useEffect(() => {
    if (!editMode) {
      setWidgetTrayOpen(false)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, setEditMode])

  const cycleWallpaper = () => {
    const idx = WALLPAPER_ORDER.indexOf(settings.wallpaper)
    const next = WALLPAPER_ORDER[(idx + 1) % WALLPAPER_ORDER.length]
    updateSettings({ wallpaper: next })
  }

  return (
    <>
      {/* Screen-reader polite live region registered on page load */}
      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>

      {/* Desktop Edit Mode Top Toolbar */}
      {editMode && (
        <header
          id="plasma-edit-toolbar"
          className="fixed top-2.5 left-1/2 z-[9200] -translate-x-1/2 flex flex-col items-center gap-2 select-none"
        >
          <div className="breeze-popover plasma-panel-blur flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs">
            <span className="mr-1 font-semibold plasma-accent-text">Desktop Edit Mode</span>
            <button
              id="edit-add-widgets-btn"
              type="button"
              onClick={() => setWidgetTrayOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition cursor-pointer ${
                widgetTrayOpen
                  ? 'plasma-accent-fill'
                  : 'border border-[var(--breeze-border)] bg-[var(--breeze-base)] hover:border-[var(--plasma-accent)]'
              }`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Widgets
            </button>

            <button
              type="button"
              onClick={cycleWallpaper}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-2.5 py-1 hover:border-[var(--plasma-accent)] transition cursor-pointer"
            >
              <Image className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
              Wallpaper
            </button>

            <button
              type="button"
              onClick={() =>
                updateSettings({
                  panelPosition: settings.panelPosition === 'bottom' ? 'top' : 'bottom',
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-2.5 py-1 hover:border-[var(--plasma-accent)] transition cursor-pointer"
            >
              <ArrowUpDown className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
              Panel: {settings.panelPosition === 'bottom' ? 'Bottom' : 'Top'}
            </button>

            <button
              id="edit-exit-btn"
              type="button"
              onClick={() => setEditMode(false)}
              className="inline-flex items-center gap-1 rounded-lg plasma-accent-fill px-2.5 py-1 font-semibold hover:brightness-110 transition cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Exit
            </button>
          </div>

          {widgetTrayOpen && (
            <div
              id="plasma-widget-picker"
              className="breeze-popover plasma-panel-blur grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl p-2.5 text-xs"
            >
              {(
                [
                  { type: 'sysmon', label: 'System Monitor', desc: 'RPC, ext4 & procs rings', icon: Activity },
                  { type: 'clock', label: 'Analog/Digital Clock', desc: 'Live Breeze timepiece', icon: Clock },
                  { type: 'note', label: 'Sticky Note', desc: 'Persisted in IndexedDB', icon: StickyNote },
                  { type: 'quicklaunch', label: 'Quick Launch', desc: '4-app desktop launcher', icon: Rocket },
                ] as const
              ).map((w) => {
                const Icon = w.icon
                return (
                  <button
                    key={w.type}
                    data-add-plasmoid={w.type}
                    type="button"
                    onClick={() => addPlasmoid(w.type)}
                    className="flex flex-col items-start gap-1 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] p-2.5 text-left hover:border-[var(--plasma-accent)] transition cursor-pointer"
                  >
                    <Icon className="h-4 w-4 plasma-accent-text" aria-hidden="true" />
                    <div className="font-semibold">{w.label}</div>
                    <div className="text-[10px] text-[var(--breeze-text-muted)]">{w.desc}</div>
                  </button>
                )
              })}
            </div>
          )}
        </header>
      )}

      {/* Render Persisted Desktop Plasmoids */}
      {plasmoids.map((p) => (
        <PlasmoidCard key={p.id} plasmoid={p} editMode={editMode} announce={announce} />
      ))}
    </>
  )
}
