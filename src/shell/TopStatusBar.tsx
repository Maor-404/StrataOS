import {
  Activity,
  Command,
  Cpu,
  Info,
  Layers,
  Power,
  RotateCcw,
  Search,
  Sliders,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { kernelClient } from '../kernel/kernelClient'
import { useOsStore } from '../state/osStore'

export const TopStatusBar: React.FC = () => {
  const kernelStatus = useOsStore((s) => s.kernelStatus)
  const kernelBootStage = useOsStore((s) => s.kernelBootStage)
  const workerLatencyMs = useOsStore((s) => s.workerLatencyMs)
  const activeWorkspace = useOsStore((s) => s.activeWorkspace)
  const setActiveWorkspace = useOsStore((s) => s.setActiveWorkspace)
  const toggleCommandPalette = useOsStore((s) => s.toggleCommandPalette)
  const openApp = useOsStore((s) => s.openApp)
  const setAboutModalOpen = useOsStore((s) => s.setAboutModalOpen)
  const performanceMode = useOsStore((s) => s.settings.performanceMode)
  const windows = useOsStore((s) => s.windows)

  const [menuOpen, setMenuOpen] = useState(false)
  const [clockText, setClockText] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      setClockText(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      )
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const wsCounts = { 1: 0, 2: 0, 3: 0 }
  for (const w of Object.values(windows)) {
    wsCounts[w.workspace] = (wsCounts[w.workspace] || 0) + 1
  }

  const statusColor =
    kernelStatus === 'online'
      ? 'bg-emerald-400'
      : kernelStatus === 'booting'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-red-400'

  const statusLabel =
    kernelStatus === 'online'
      ? 'Linux 7.3 Online'
      : kernelStatus === 'booting'
      ? kernelBootStage
      : 'Kernel Halted'

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[9000] flex h-8 items-center justify-between border-b border-white/10 px-3 text-xs select-none ${
        performanceMode ? 'bg-zinc-950' : 'bg-zinc-950/80 backdrop-blur-md'
      }`}
    >
      {/* Left: StrataOS System Menu + Workspace Switcher */}
      <div className="flex items-center gap-3">
        <div ref={menuRef} className="relative">
          <button
            id="strata-system-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded px-2 py-0.5 font-semibold text-zinc-100 hover:bg-white/10 transition"
          >
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            <span>StrataOS</span>
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-7 w-56 rounded-lg border border-white/15 bg-zinc-900/95 p-1.5 shadow-2xl">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setAboutModalOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <Info className="h-3.5 w-3.5 text-cyan-400" />
                About StrataOS & unkernel
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  openApp('settings')
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <Sliders className="h-3.5 w-3.5 text-zinc-400" />
                System Settings...
              </button>
              <div className="my-1 border-t border-white/10" />
              <button
                onClick={() => {
                  setMenuOpen(false)
                  void kernelClient.rebootKernel()
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-amber-300 hover:bg-amber-500/15"
              >
                <Power className="h-3.5 w-3.5" />
                Reboot Linux Kernel
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  void kernelClient.factoryResetDisk()
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/15"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Factory Reset ext4 Disk
              </button>
            </div>
          )}
        </div>

        {/* Workspace Switcher 1-3 */}
        <div className="flex items-center gap-1 rounded bg-zinc-900/90 border border-white/10 px-1 py-0.5">
          {([1, 2, 3] as const).map((ws) => {
            const active = activeWorkspace === ws
            const hasWins = wsCounts[ws] > 0
            return (
              <button
                key={ws}
                id={`workspace-switch-${ws}`}
                onClick={() => setActiveWorkspace(ws)}
                className={`flex items-center gap-1 rounded px-2 py-0.2 font-mono text-[11px] transition ${
                  active
                    ? 'bg-cyan-500/25 text-cyan-300 font-semibold border border-cyan-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={`Workspace ${ws} (Alt+${ws})`}
              >
                <span>{ws}</span>
                {hasWins && (
                  <span
                    className={`h-1 w-1 rounded-full ${
                      active ? 'bg-cyan-300' : 'bg-zinc-500'
                    }`}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Center: Command Palette Trigger */}
      <button
        id="command-palette-trigger"
        onClick={toggleCommandPalette}
        className="flex items-center gap-2 rounded-md border border-white/10 bg-zinc-900/80 px-3 py-0.5 text-[11px] text-zinc-400 hover:border-cyan-500/40 hover:text-zinc-200 transition"
      >
        <Search className="h-3 w-3 text-cyan-400" />
        <span>Search Apps, Packages & Linux Files...</span>
        <kbd className="ml-2 inline-flex items-center gap-0.5 rounded bg-zinc-800 px-1.5 py-0.2 font-mono text-[10px] text-zinc-300">
          <Command className="h-2.5 w-2.5" /> Ctrl+K
        </kbd>
      </button>

      {/* Right: Kernel Status Pill, Worker Heartbeat & Live Clock */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => openApp('monitor')}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/90 px-2.5 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-cyan-500/30"
          title="Open Strata Monitor"
        >
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          <span className="max-w-[180px] truncate">{statusLabel}</span>
        </button>

        <div
          className="hidden sm:flex items-center gap-1 rounded border border-white/5 bg-zinc-900/70 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
          title="Web Worker RPC Heartbeat Latency"
        >
          <Activity className="h-3 w-3 text-emerald-400" />
          <span>{workerLatencyMs.toFixed(1)}ms</span>
        </div>

        <div
          className="hidden md:flex items-center gap-1 rounded border border-white/5 bg-zinc-900/70 px-2 py-0.5 font-mono text-[10px] text-cyan-300"
          title="Cross-Origin Isolated SharedArrayBuffer Context"
        >
          <Cpu className="h-3 w-3" />
          <span>SAB</span>
        </div>

        <div className="font-mono text-xs font-medium text-zinc-200 min-w-[62px] text-right">
          {clockText}
        </div>
      </div>
    </header>
  )
}
