import {
  Activity,
  Command,
  Cpu,
  History,
  Info,
  LayoutGrid,
  Layers,
  Power,
  RotateCcw,
  Search,
  Shield,
  Sliders,
  Sparkles,
  Sun,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { kernelClient } from '../kernel/kernelClient'
import { useOsStore } from '../state/osStore'
import { STRATA_CONFIG } from '../strata.config'

export const TopStatusBar: React.FC = () => {
  const kernelStatus = useOsStore((s) => s.kernelStatus)
  const kernelBootStage = useOsStore((s) => s.kernelBootStage)
  const workerLatencyMs = useOsStore((s) => s.workerLatencyMs)
  const activeWorkspace = useOsStore((s) => s.activeWorkspace)
  const setWorkspace = useOsStore((s) => s.setActiveWorkspace)
  const toggleCommandPalette = useOsStore((s) => s.toggleCommandPalette)
  const openApp = useOsStore((s) => s.openApp)
  const setAboutModalOpen = useOsStore((s) => s.setAboutModalOpen)
  const toggleMissionControl = useOsStore((s) => s.toggleMissionControl)
  const toggleNotificationDrawer = useOsStore((s) => s.toggleNotificationDrawer)
  const notificationDrawerOpen = useOsStore((s) => s.notificationDrawerOpen)
  const setBootPhase = useOsStore((s) => s.setBootPhase)
  const wakeLockActive = useOsStore((s) => s.wakeLockActive)
  const performanceMode = useOsStore((s) => s.settings.performanceMode)
  const windows = useOsStore((s) => s.windows)

  const [menuOpen, setMenuOpen] = useState(false)
  const [clockText, setClockText] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

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
      className={`fixed top-0 left-0 right-0 z-[9000] flex h-8 items-center justify-between border-b border-white/[0.08] px-3 text-xs select-none ${
        performanceMode ? 'bg-[#09090b]' : 'bg-[#09090b]/80 strata-chrome-blur'
      }`}
    >
      {/* Left: StrataOS System Menu (with Native Popover API attribute) + Workspace Switcher */}
      <div className="flex items-center gap-2.5">
        <div ref={menuRef} className="relative">
          <button
            id="strata-system-menu-btn"
            popoverTarget="strata-system-popover"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded px-2 py-0.5 font-semibold text-zinc-100 hover:bg-white/10 transition"
          >
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span>{STRATA_CONFIG.osName}</span>
            <span className="font-mono text-[10px] text-zinc-400 font-normal">
              v{STRATA_CONFIG.version}
            </span>
          </button>

          {menuOpen && (
            <div
              id="strata-system-popover"
              ref={popoverRef}
              className="absolute left-0 top-7 w-60 rounded-xl border border-white/10 bg-[#121215]/95 strata-chrome-blur p-1.5 shadow-2xl"
            >
              <div className="px-2.5 py-1.5 border-b border-white/5 mb-1">
                <div className="text-[11px] font-semibold text-zinc-100">
                  {STRATA_CONFIG.releaseTitle}
                </div>
                <div className="text-[10px] font-mono text-zinc-400">
                  {STRATA_CONFIG.kernelRelease}
                </div>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setAboutModalOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <Info className="h-3.5 w-3.5 text-sky-400" />
                About StrataOS v1.0.0 (Bedrock)
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  openApp('settings')
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <Sliders className="h-3.5 w-3.5 text-zinc-400" />
                System Settings...
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  toggleNotificationDrawer()
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <History className="h-3.5 w-3.5 text-sky-400" />
                Time Machine Snapshots...
              </button>
              <div className="my-1 border-t border-white/10" />
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setBootPhase('uefi-setup')
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-sky-300 hover:bg-sky-500/15"
              >
                <Shield className="h-3.5 w-3.5" />
                Enter StrataUEFI Firmware Setup
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  void kernelClient.rebootKernel()
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-amber-300 hover:bg-amber-500/15"
              >
                <Power className="h-3.5 w-3.5" />
                Reboot Linux Kernel
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  void kernelClient.factoryResetDisk()
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/15"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Factory Reset ext4 Disk
              </button>
            </div>
          )}
        </div>

        {/* Workspace Switcher 1-3 with View Transitions */}
        <div className="flex items-center gap-1 rounded-md bg-[#121215] border border-white/[0.08] px-1 py-0.5">
          {([1, 2, 3] as const).map((ws) => {
            const active = activeWorkspace === ws
            const hasWins = wsCounts[ws] > 0
            return (
              <button
                key={ws}
                id={`workspace-switch-${ws}`}
                onClick={() => setWorkspace(ws)}
                className={`flex items-center gap-1 rounded px-2 py-0.2 font-mono text-[11px] transition ${
                  active
                    ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/35'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={`Workspace ${ws} (Alt+${ws})`}
              >
                <span>{ws}</span>
                {hasWins && (
                  <span
                    className={`h-1 w-1 rounded-full ${
                      active ? 'bg-sky-300' : 'bg-zinc-500'
                    }`}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Mission Control Button */}
        <button
          onClick={toggleMissionControl}
          className="hidden sm:flex items-center gap-1 rounded-md bg-[#121215] border border-white/[0.08] px-2 py-0.5 text-[11px] text-zinc-300 hover:border-sky-500/30 hover:text-sky-300 transition"
          title="Mission Control (Alt+Tab)"
        >
          <LayoutGrid className="h-3 w-3 text-sky-400" />
          <span>Overview</span>
        </button>
      </div>

      {/* Center: Command Palette Trigger */}
      <button
        id="command-palette-trigger"
        onClick={toggleCommandPalette}
        className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-[#121215] px-3 py-0.5 text-[11px] text-zinc-400 hover:border-sky-500/40 hover:text-zinc-200 transition"
      >
        <Search className="h-3 w-3 text-sky-400" />
        <span>Search Apps, Packages &amp; Linux Files...</span>
        <kbd className="ml-2 inline-flex items-center gap-0.5 rounded bg-zinc-800/80 px-1.5 py-0.2 font-mono text-[10px] text-zinc-300">
          <Command className="h-2.5 w-2.5" /> Ctrl+K
        </kbd>
      </button>

      {/* Right: Copilot, Kernel Status Pill, Time Machine, Worker Heartbeat & Live Clock */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => openApp('copilot')}
          className="hidden md:flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#121215] px-2 py-0.5 text-[11px] text-zinc-300 hover:border-sky-500/40 hover:text-sky-300 transition"
          title="Open Strata Copilot AI Assistant"
        >
          <Sparkles className="h-3 w-3 text-sky-400" />
          <span>Copilot</span>
        </button>

        <button
          onClick={() => openApp('monitor')}
          className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#121215] px-2.5 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-sky-500/30"
          title="Open Strata Monitor"
        >
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          <span className="max-w-[160px] truncate">{statusLabel}</span>
        </button>

        <div
          className="hidden lg:flex items-center gap-1 rounded border border-white/[0.06] bg-[#121215] px-2 py-0.5 font-mono text-[10px] text-zinc-400"
          title="Web Worker RPC Heartbeat Latency"
        >
          <Activity className="h-3 w-3 text-emerald-400" />
          <span>{workerLatencyMs.toFixed(1)}ms</span>
        </div>

        <div
          className="hidden md:flex items-center gap-1 rounded border border-white/[0.06] bg-[#121215] px-2 py-0.5 font-mono text-[10px] text-sky-300"
          title="Cross-Origin Isolated SharedArrayBuffer Context"
        >
          <Cpu className="h-3 w-3" />
          <span>SAB</span>
        </div>

        {wakeLockActive && (
          <div
            className="flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300"
            title="Screen Wake Lock Active"
          >
            <Sun className="h-3 w-3" />
          </div>
        )}

        <button
          id="time-machine-drawer-btn"
          onClick={toggleNotificationDrawer}
          className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition ${
            notificationDrawerOpen
              ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
              : 'border-white/[0.08] bg-[#121215] text-zinc-300 hover:border-sky-500/30'
          }`}
          title="Time Machine Filesystem Snapshots & System Control"
        >
          <History className="h-3 w-3 text-sky-400" />
          <span className="hidden sm:inline">Snapshots</span>
        </button>

        <div className="font-mono text-xs font-medium text-zinc-200 min-w-[60px] text-right">
          {clockText}
        </div>
      </div>
    </header>
  )
}
