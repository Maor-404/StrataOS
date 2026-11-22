import { Layers, Maximize2, Pin, Plus, Search, X } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useOsStore } from '../state/osStore'
import { AppIcon } from './AppIcon'

export const MissionControl: React.FC = () => {
  const overviewOpen = useOsStore((s) => s.missionControlOpen)
  const setOverviewOpen = useOsStore((s) => s.setMissionControlOpen)
  const activeWorkspace = useOsStore((s) => s.activeWorkspace)
  const setWorkspace = useOsStore((s) => s.setActiveWorkspace)
  const windows = useOsStore((s) => s.windows)
  const focusWindow = useOsStore((s) => s.focusWindow)
  const closeWindow = useOsStore((s) => s.closeWindow)
  const openApp = useOsStore((s) => s.openApp)

  const [filter, setFilter] = useState('')
  const [showAllDesktops, setShowAllDesktops] = useState(false)

  useEffect(() => {
    if (!overviewOpen) return
    setFilter('')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overviewOpen, setOverviewOpen])

  if (!overviewOpen) return null

  const allWindows = Object.values(windows)
  const visibleWindows = allWindows
    .filter((w) => (showAllDesktops ? true : w.workspace === activeWorkspace))
    .filter((w) =>
      filter.trim() ? w.title.toLowerCase().includes(filter.trim().toLowerCase()) : true
    )
    .sort((a, b) => b.zIndex - a.zIndex)

  const handleSelectWindow = (winId: string, ws: 1 | 2 | 3) => {
    setWorkspace(ws)
    focusWindow(winId)
    setOverviewOpen(false)
  }

  return (
    <div
      id="plasma-overview"
      role="dialog"
      aria-label="KDE Plasma Overview"
      className="fixed inset-0 z-[8800] plasma-panel-blur flex flex-col gap-5 p-6 select-none"
      style={{ backgroundColor: 'rgba(15, 18, 21, 0.84)' }}
      onClick={() => setOverviewOpen(false)}
    >
      {/* Top Virtual Desktops 1–3 Strip */}
      <div
        className="mx-auto flex w-full max-w-5xl flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-[var(--breeze-text)]">
            <Layers className="h-4 w-4 plasma-accent-text" aria-hidden="true" />
            <span className="text-sm font-semibold">Plasma Overview</span>
            <span className="rounded border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--breeze-text-muted)]">
              Ctrl+Up / Alt+Tab
            </span>
          </div>

          {/* Overview Quick Filter */}
          <div className="relative w-64 max-w-full">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--breeze-text-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter open windows..."
              className="w-full rounded-lg border border-[var(--breeze-border-strong)] bg-[var(--breeze-base)]/90 py-1.5 pl-8 pr-3 text-xs text-[var(--breeze-text)] placeholder:text-[var(--breeze-text-muted)] focus:border-[var(--plasma-accent)] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllDesktops((v) => !v)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                showAllDesktops
                  ? 'plasma-accent-fill border-transparent'
                  : 'border-[var(--breeze-border)] bg-[var(--breeze-view)] text-[var(--breeze-text-muted)] hover:text-[var(--breeze-text)]'
              }`}
            >
              {showAllDesktops ? 'All Desktops' : `Desktop ${activeWorkspace}`}
            </button>
            <button
              type="button"
              onClick={() => setOverviewOpen(false)}
              aria-label="Close Plasma Overview"
              className="rounded-lg p-1.5 text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Virtual Desktops 1–3 Thumbnail Strip */}
        <div className="grid grid-cols-3 gap-3">
          {([1, 2, 3] as const).map((ws) => {
            const wsWins = allWindows.filter((w) => w.workspace === ws)
            const active = activeWorkspace === ws
            return (
              <div
                key={ws}
                onClick={() => setWorkspace(ws)}
                className={`group flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 transition ${
                  active
                    ? 'border-[var(--plasma-accent)] bg-[var(--breeze-view)] shadow-[0_0_18px_color-mix(in_srgb,var(--plasma-accent)_22%,transparent)]'
                    : 'border-[var(--breeze-border)] bg-[var(--breeze-base)]/80 hover:border-[var(--breeze-border-strong)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold ${
                      active
                        ? 'plasma-accent-fill'
                        : 'bg-[var(--breeze-header)] text-[var(--breeze-text-muted)]'
                    }`}
                  >
                    {ws}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--breeze-text)]">
                      Virtual Desktop {ws}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--breeze-text-muted)]">
                      {wsWins.length} {wsWins.length === 1 ? 'window' : 'windows'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setWorkspace(ws)
                    openApp('terminal')
                    setOverviewOpen(false)
                  }}
                  title={`Open Terminal on Desktop ${ws}`}
                  aria-label={`Open Terminal on Desktop ${ws}`}
                  className="rounded-md p-1 text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Window Grid */}
      <div
        className="mx-auto flex-1 w-full max-w-6xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {visibleWindows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-xs text-[var(--breeze-text-muted)]">
            <p>No open windows on Virtual Desktop {activeWorkspace}.</p>
            <button
              type="button"
              onClick={() => {
                openApp('terminal')
                setOverviewOpen(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg plasma-accent-fill px-3.5 py-1.5 font-semibold cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Open Strata Terminal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleWindows.map((win) => (
              <div
                key={win.id}
                onClick={() => handleSelectWindow(win.id, win.workspace)}
                className="group flex flex-col overflow-hidden rounded-xl border border-[var(--breeze-border-strong)] bg-[var(--breeze-view)] hover:border-[var(--plasma-accent)] cursor-pointer transition-all kwin-shadow"
              >
                {/* Mini Breeze Title Bar */}
                <div className="flex h-8 items-center justify-between border-b border-[var(--breeze-border)] bg-[var(--breeze-header)] px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <AppIcon
                      name={win.icon}
                      appId={win.appId}
                      className="h-3.5 w-3.5 shrink-0 plasma-accent-text"
                    />
                    <span className="truncate text-xs font-medium text-[var(--breeze-text)]">
                      {win.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {win.keepAbove && (
                      <Pin className="h-3 w-3 plasma-accent-text" aria-label="Pinned above" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeWindow(win.id)
                      }}
                      title="Close window"
                      aria-label={`Close ${win.title}`}
                      className="rounded-full p-1 text-[var(--breeze-text-muted)] hover:bg-[#da4453] hover:text-white cursor-pointer"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Window Card Preview */}
                <div className="flex h-36 flex-col items-center justify-center gap-2 bg-[var(--breeze-base)]/80 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--breeze-border)] bg-[var(--breeze-view)] plasma-accent-text group-hover:scale-105 transition-transform">
                    <AppIcon name={win.icon} appId={win.appId} className="h-6 w-6" />
                  </div>
                  <div className="font-mono text-[10px] text-[var(--breeze-text-muted)]">
                    Desktop {win.workspace} • {win.width}×{win.height}
                    {win.isMaximized ? ' • Maximized' : win.isMinimized ? ' • Minimized' : ''}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] plasma-accent-text opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="h-2.5 w-2.5" aria-hidden="true" /> Focus Window
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
