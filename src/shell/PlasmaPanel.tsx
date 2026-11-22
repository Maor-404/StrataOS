import {
  Activity,
  Award,
  Bell,
  Bot,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cpu,
  Edit3,
  Feather,
  Flame,
  Grid,
  Info,
  Layers,
  Lock,
  Monitor,
  PanelBottom,
  RotateCcw,
  Search,
  Share2,
  Shield,
  Sliders,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { kernelClient } from '../kernel/kernelClient'
import { STRATA_CONFIG } from '../strata.config'
import {
  GLOBAL_THEMES,
  getPanelHeight,
  NATIVE_APPS,
  useOsStore,
  type AppId,
  type GlobalThemeId,
  type NativeAppId,
  type WallpaperId,
} from '../state/osStore'
import { buildShareSetupUrl, copyTextToClipboard } from '../utils/clipboard'
import { AppIcon } from './AppIcon'

type KickoffTab = 'favorites' | 'all' | 'extras'

const WALLPAPER_SWATCHES: Array<{ id: WallpaperId; label: string; bg: string }> = [
  { id: 'debian-swirl', label: 'Debian Crimson', bg: 'radial-gradient(circle at 25% 25%, #5b0926, #161317)' },
  { id: 'obsidian-grid', label: 'Obsidian', bg: 'linear-gradient(135deg, #1b1e20, #0b0d10)' },
  { id: 'midnight-aurora', label: 'Nordic', bg: 'radial-gradient(circle at 75% 20%, #103240, #12171d)' },
  { id: 'lxqt-frost', label: 'LXQt Frost', bg: 'linear-gradient(135deg, #eff0f1, #cbd5e1)' },
]

function hidePopoverById(id: string) {
  const el = document.getElementById(id) as (HTMLElement & { hidePopover?: () => void }) | null
  try {
    el?.hidePopover?.()
  } catch {
    // ignore if already closed or unsupported
  }
}

/** Lightweight SVG mini-graph showing live Worker/Kernel RPC latency */
const WorkerMiniGraph: React.FC<{ samples: number[] }> = ({ samples }) => {
  const pts = samples.length > 1 ? samples : [0.4, 0.4]
  const maxVal = Math.max(4, ...pts)
  const w = 40
  const h = 16
  const path = pts
    .map((v, idx) => {
      const x = (idx / Math.max(1, pts.length - 1)) * w
      const y = h - Math.min(1, v / maxVal) * (h - 2) - 1
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--plasma-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const PlasmaPanel: React.FC = () => {
  const windows = useOsStore((s) => s.windows)
  const activeWorkspace = useOsStore((s) => s.activeWorkspace)
  const focusedWindowId = useOsStore((s) => s.focusedWindowId)
  const pinnedApps = useOsStore((s) => s.pinnedApps)
  const installedPackages = useOsStore((s) => s.installedPackages)
  const kernelStatus = useOsStore((s) => s.kernelStatus)
  const workerLatencyMs = useOsStore((s) => s.workerLatencyMs)
  const latencyHistory = useOsStore((s) => s.latencyHistory)
  const settings = useOsStore((s) => s.settings)
  const editMode = useOsStore((s) => s.editMode)
  const peekDesktop = useOsStore((s) => s.peekDesktop)
  const strataPetActive = useOsStore((s) => s.strataPetActive)
  const wakeLockActive = useOsStore((s) => s.wakeLockActive)

  const openApp = useOsStore((s) => s.openApp)
  const focusWindow = useOsStore((s) => s.focusWindow)
  const toggleMinimizeWindow = useOsStore((s) => s.toggleMinimizeWindow)
  const updateSettings = useOsStore((s) => s.updateSettings)
  const applyGlobalTheme = useOsStore((s) => s.applyGlobalTheme)
  const setBootPhase = useOsStore((s) => s.setBootPhase)
  const setActiveWorkspace = useOsStore((s) => s.setActiveWorkspace)
  const toggleNotificationDrawer = useOsStore((s) => s.toggleNotificationDrawer)
  const toggleMissionControl = useOsStore((s) => s.toggleMissionControl)
  const toggleCommandPalette = useOsStore((s) => s.toggleCommandPalette)
  const setAboutModalOpen = useOsStore((s) => s.setAboutModalOpen)
  const setFlexCardOpen = useOsStore((s) => s.setFlexCardOpen)
  const setEditMode = useOsStore((s) => s.setEditMode)
  const setPeekDesktop = useOsStore((s) => s.setPeekDesktop)
  const setStrataPetActive = useOsStore((s) => s.setStrataPetActive)
  const setMelt93Active = useOsStore((s) => s.setMelt93Active)

  const [now, setNow] = useState(() => new Date())
  const [kickoffTab, setKickoffTab] = useState<KickoffTab>('favorites')
  const [kickoffQuery, setKickoffQuery] = useState('')
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [webgpuAvailable, setWebgpuAvailable] = useState<boolean | null>(null)
  const [sharePreset, setSharePreset] = useState<'showcase' | 'active' | 'webgpu' | 'uefi'>('showcase')
  const [copiedState, setCopiedState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [copyStatusMsg, setCopyStatusMsg] = useState('')
  const copyTimerRef = useRef<number | null>(null)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000 * 15)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }
    if (!nav.gpu) {
      setWebgpuAvailable(false)
      return
    }
    void nav.gpu
      .requestAdapter()
      .then((adapter) => setWebgpuAvailable(Boolean(adapter)))
      .catch(() => setWebgpuAvailable(false))
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  const isCompactLxqt = settings.panelStyle === 'lxqt-compact'
  const panelHeight = getPanelHeight(settings.panelStyle)

  // Floating Plasma Panel animates flush when a visible window maximizes; LXQt Classic is always flush 32px
  const hasMaximizedWindow = useMemo(
    () =>
      !peekDesktop &&
      Object.values(windows).some(
        (w) => w.workspace === activeWorkspace && w.isMaximized && !w.isMinimized
      ),
    [windows, activeWorkspace, peekDesktop]
  )

  const isFlush = isCompactLxqt || hasMaximizedWindow
  const isTop = settings.panelPosition === 'top'
  const popoverStartClass = isTop ? 'plasma-popover-top-start' : 'plasma-popover-start'
  const popoverEndClass = isTop ? 'plasma-popover-top-end' : 'plasma-popover-end'

  // Task manager items: pinned apps + any currently running apps
  const taskItems = useMemo(() => {
    const seen = new Set<AppId>()
    const result: Array<{
      appId: AppId
      label: string
      icon: string
      runningWinId: string | null
      isFocused: boolean
      isMinimized: boolean
      isWasm: boolean
    }> = []

    const findWin = (appId: AppId) =>
      Object.values(windows).find((w) => w.appId === appId && w.workspace === activeWorkspace) ??
      Object.values(windows).find((w) => w.appId === appId) ??
      null

    const pushApp = (appId: AppId) => {
      if (seen.has(appId)) return
      seen.add(appId)
      const win = findWin(appId)
      if (appId.startsWith('wasm:')) {
        const pkgId = appId.slice(5)
        const pkg = installedPackages.find((p) => p.id === pkgId)
        result.push({
          appId,
          label: pkg?.name ?? win?.title ?? pkgId,
          icon: pkg?.icon ?? win?.icon ?? 'Box',
          runningWinId: win?.id ?? null,
          isFocused: Boolean(win && focusedWindowId === win.id && !win.isMinimized && !peekDesktop),
          isMinimized: Boolean(win?.isMinimized),
          isWasm: true,
        })
      } else {
        const meta = NATIVE_APPS[appId as NativeAppId]
        if (!meta) return
        result.push({
          appId,
          label: meta.name,
          icon: meta.icon,
          runningWinId: win?.id ?? null,
          isFocused: Boolean(win && focusedWindowId === win.id && !win.isMinimized && !peekDesktop),
          isMinimized: Boolean(win?.isMinimized),
          isWasm: false,
        })
      }
    }

    for (const id of pinnedApps) pushApp(id)
    for (const w of Object.values(windows)) pushApp(w.appId)
    return result
  }, [pinnedApps, windows, activeWorkspace, focusedWindowId, installedPackages, peekDesktop])

  // Kickoff / LXQt Application Menu filtered entries
  const kickoffEntries = useMemo(() => {
    const q = kickoffQuery.trim().toLowerCase()
    const nativeList = Object.values(NATIVE_APPS).map((app) => ({
      id: app.id as AppId,
      name: app.name,
      subtitle: app.subtitle,
      icon: app.icon,
      category: app.category,
      isWasm: false,
      onLaunch: () => openApp(app.id),
    }))
    const wasmList = installedPackages.map((pkg) => ({
      id: `wasm:${pkg.id}` as AppId,
      name: pkg.name,
      subtitle: `${pkg.type} • v${pkg.version}`,
      icon: pkg.icon,
      category: 'WASM' as const,
      isWasm: true,
      onLaunch: () => {
        if (pkg.type === 'wasm-cli') {
          openApp('terminal')
          setTimeout(() => kernelClient.sendCommandToTerminal(`${pkg.id} "2^16 + sqrt(144)"`), 120)
        } else {
          openApp(`wasm:${pkg.id}`, { title: `${pkg.name} v${pkg.version}`, icon: pkg.icon })
        }
      },
    }))

    const all = [...nativeList, ...wasmList]
    if (q) {
      return all.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.subtitle.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      )
    }

    if (kickoffTab === 'favorites') {
      return all.filter((e) => pinnedApps.includes(e.id) || e.isWasm)
    }
    if (kickoffTab === 'extras') {
      return all.filter((e) => e.category === 'Extras' || e.isWasm)
    }
    return all
  }, [kickoffQuery, kickoffTab, installedPackages, pinnedApps, openApp])

  const handleShareSetup = async () => {
    const focusedWin = focusedWindowId ? windows[focusedWindowId] : null
    const origin =
      typeof window !== 'undefined' &&
      window.location.origin.startsWith('http') &&
      !window.location.hostname.includes('localhost') &&
      window.location.hostname !== '127.0.0.1'
        ? window.location.origin
        : STRATA_CONFIG.liveDemoUrl

    let target: { url: string; label: string }
    if (sharePreset === 'showcase') {
      target = { url: `${origin}/?showcase=1`, label: 'Instant Showcase (?showcase=1)' }
    } else if (sharePreset === 'webgpu') {
      target = { url: `${origin}/?app=webgpu`, label: 'Strata GPU Studio (?app=webgpu)' }
    } else if (sharePreset === 'uefi') {
      target = { url: `${origin}/?boot=uefi`, label: 'StrataUEFI Firmware (?boot=uefi)' }
    } else {
      target = buildShareSetupUrl(focusedWin?.appId)
    }

    const ok = await copyTextToClipboard(target.url)
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    setCopiedState(ok ? 'copied' : 'failed')
    setCopyStatusMsg(ok ? 'Copied' : 'Copy failed')
    if (ok) {
      toast.success('Setup link copied to clipboard', {
        description: `${target.label} — ${target.url}`,
      })
    } else {
      toast.error('Clipboard write blocked', { description: target.url })
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedState('idle')
      setCopyStatusMsg('')
    }, 2200)
  }

  const handleRestartKernel = async () => {
    hidePopoverById('plasma-kickoff')
    toast.info('Syncing Debian ext4 disk and restarting Linux 7.3 kernel...')
    try {
      await kernelClient.syncDisk()
    } catch {
      // ignore
    }
    window.location.reload()
  }

  // Calendar days computation
  const calendarDays = useMemo(() => {
    const year = calMonth.getFullYear()
    const month = calMonth.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{ day: number | null; isToday: boolean }> = []
    for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, isToday: false })
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday =
        d === now.getDate() && month === now.getMonth() && year === now.getFullYear()
      cells.push({ day: d, isToday })
    }
    return cells
  }, [calMonth, now])

  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateString = now.toLocaleDateString([], { month: 'short', day: 'numeric' })

  const disableBlur = settings.featherMode || settings.performanceMode
  const panelBlurClass = disableBlur ? 'plasma-panel-solid' : 'plasma-panel-blur'

  return (
    <>
      {/* Lock Screen Overlay */}
      {locked && (
        <div
          onClick={() => setLocked(false)}
          onKeyDown={() => setLocked(false)}
          tabIndex={0}
          className="fixed inset-0 z-[9950] flex flex-col items-center justify-center bg-black/88 text-[var(--breeze-text)] select-none"
        >
          <div className="font-mono text-6xl font-light tracking-tight">{timeString}</div>
          <div className="mt-2 text-sm text-[var(--breeze-text-muted)]">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-[var(--breeze-border-strong)] bg-[var(--breeze-view)] px-8 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full plasma-accent-fill font-bold text-lg">
              D
            </div>
            <div className="text-sm font-semibold">root@debian-strata</div>
            <button
              type="button"
              onClick={() => setLocked(false)}
              className="mt-1 rounded-lg plasma-accent-fill px-5 py-1.5 text-xs font-semibold hover:brightness-110 transition duration-120 cursor-pointer"
            >
              Unlock Session
            </button>
          </div>
        </div>
      )}

      {/* Floating Plasma Panel (44px) OR Razor-Thin LXQt Classic Panel (32px) */}
      <nav
        id="plasma-panel"
        aria-label="Plasma / LXQt Panel"
        data-floating={isFlush ? 'false' : 'true'}
        data-panel-style={settings.panelStyle}
        data-position={settings.panelPosition}
        style={{
          height: `${panelHeight}px`,
          left: isFlush ? '0px' : '6px',
          right: isFlush ? '0px' : '6px',
          bottom: isTop ? 'auto' : isFlush ? '0px' : '6px',
          top: isTop ? (isFlush ? '0px' : '6px') : 'auto',
          borderRadius: isFlush ? '0px' : settings.globalTheme === 'strata-obsidian' ? '9999px' : '10px',
        }}
        className={`fixed z-[8200] flex items-center justify-between gap-2 px-2 select-none border transition-all duration-120 ease-out ${panelBlurClass} ${
          isFlush
            ? 'border-x-0 shadow-sm'
            : 'shadow-[0_8px_28px_rgba(0,0,0,0.45)]'
        }`}
      >
        {/* LEFT: Kickoff / LXQt Application Menu + Runner + Compact Workspace Switcher (1 | 2 | 3) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="plasma-kickoff-btn"
            type="button"
            {...({ popoverTarget: 'plasma-kickoff' } as React.ButtonHTMLAttributes<HTMLButtonElement>)}
            title="Kickoff / LXQt Application Launcher"
            aria-label="Application Launcher"
            className={`flex items-center gap-1.5 rounded-md hover:bg-[var(--breeze-hover)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6 px-1.5' : 'h-8 w-8 justify-center'
            }`}
          >
            <span
              className={`flex items-center justify-center rounded plasma-accent-fill ${
                isCompactLxqt ? 'h-4 w-4' : 'h-6 w-6'
              }`}
            >
              <Sparkles className={isCompactLxqt ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} aria-hidden="true" />
            </span>
            {isCompactLxqt && (
              <span className="text-[11px] font-semibold tracking-tight">Apps</span>
            )}
          </button>

          <button
            id="plasma-krunner-btn"
            type="button"
            onClick={toggleCommandPalette}
            title="KRunner / LXQt Runner (Alt+Space / Ctrl+K)"
            aria-label="Open KRunner"
            className={`hidden sm:flex items-center gap-1.5 rounded-md border border-[var(--breeze-border)] bg-[var(--breeze-base)]/60 px-2 text-[11px] text-[var(--breeze-text-muted)] hover:text-[var(--breeze-text)] hover:border-[var(--breeze-border-strong)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6' : 'h-7'
            }`}
          >
            <Search className="h-3 w-3 plasma-accent-text" aria-hidden="true" />
            <span>Runner</span>
            <kbd className="rounded bg-[var(--breeze-hover)] px-1 font-mono text-[9px]">Alt+Space</kbd>
          </button>

          {/* Compact Workspace Switcher (1 | 2 | 3) */}
          <div
            aria-label="Workspaces"
            className={`hidden md:flex items-center rounded-md border border-[var(--breeze-border)] bg-[var(--breeze-base)]/50 ${
              isCompactLxqt ? 'h-6 px-0.5 divide-x divide-[var(--breeze-border)]' : 'p-0.5 gap-0.5'
            }`}
          >
            {([1, 2, 3] as const).map((ws) => (
              <button
                key={ws}
                type="button"
                onClick={() => setActiveWorkspace(ws)}
                title={`Virtual Desktop ${ws} (Alt+${ws})`}
                className={`font-mono transition duration-120 cursor-pointer ${
                  isCompactLxqt ? 'h-5 px-2 text-[10px]' : 'h-6 w-6 rounded text-[11px]'
                } ${
                  activeWorkspace === ws
                    ? 'plasma-accent-fill font-semibold rounded-[4px]'
                    : 'text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)]'
                }`}
              >
                {ws}
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: Icons-Only Task Manager */}
        <div
          aria-label="Task Manager"
          className="flex flex-1 items-center justify-center gap-1 overflow-x-auto px-1"
        >
          {taskItems.map((item) => (
            <button
              key={item.appId}
              type="button"
              onClick={() => {
                if (peekDesktop) setPeekDesktop(false)
                if (!item.runningWinId) {
                  openApp(item.appId)
                } else if (item.isFocused) {
                  toggleMinimizeWindow(item.runningWinId)
                } else {
                  focusWindow(item.runningWinId)
                }
              }}
              title={item.label}
              aria-label={item.label}
              className={`group relative flex shrink-0 items-center justify-center rounded-md transition duration-120 cursor-pointer ${
                isCompactLxqt ? 'h-6 px-2 gap-1.5' : 'h-9 w-10'
              } ${
                item.isFocused
                  ? 'bg-[var(--breeze-hover)] text-[var(--breeze-text)]'
                  : 'text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)]'
              }`}
            >
              <AppIcon
                name={item.icon}
                appId={item.appId}
                className={`${isCompactLxqt ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${
                  item.isFocused ? 'plasma-accent-text' : ''
                }`}
              />
              {isCompactLxqt && item.runningWinId && (
                <span className="hidden xl:inline max-w-[84px] truncate text-[10px] font-medium">
                  {item.label.replace('Strata ', '')}
                </span>
              )}
              {item.isWasm && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
              {/* Active / running indicator bar */}
              {item.runningWinId && (
                <span
                  style={{
                    backgroundColor: 'var(--plasma-accent)',
                    opacity: item.isFocused ? 1 : item.isMinimized ? 0.4 : 0.72,
                    width: item.isFocused ? (isCompactLxqt ? '100%' : '22px') : '8px',
                  }}
                  className={`absolute ${
                    isTop ? 'top-0' : 'bottom-0'
                  } h-[2px] rounded-full transition-all duration-120`}
                />
              )}
            </button>
          ))}
        </div>

        {/* RIGHT: CPU/Worker Mini-Graph + Kernel + Share/Flex + System Tray + Clock + Peek */}
        <div className="flex items-center gap-1 shrink-0">
          {/* CPU / Worker Latency Mini-Graph & Debian Kernel Status */}
          <button
            type="button"
            onClick={() => openApp('monitor')}
            title={`Debian Linux 7.3 (${kernelStatus}) • ${workerLatencyMs}ms Worker RPC — Open Monitor`}
            className={`hidden lg:flex items-center gap-1.5 rounded-md px-1.5 font-mono text-[10px] text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6' : 'h-7'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                kernelStatus === 'online'
                  ? 'bg-emerald-400'
                  : kernelStatus === 'error'
                    ? 'bg-red-400'
                    : 'bg-amber-400 animate-pulse'
              }`}
            />
            <WorkerMiniGraph samples={latencyHistory} />
            <span>{workerLatencyMs}ms</span>
          </button>

          {/* 1-Click Share / Flex Proof Card Button */}
          <button
            id="tray-flex-btn"
            type="button"
            onClick={() => setFlexCardOpen(true)}
            title="Share / Flex — Export 1200×630 Live Proof Card PNG"
            aria-label="Share or Flex Proof Card"
            className={`flex items-center gap-1 rounded-md border border-[var(--breeze-border)] bg-[var(--breeze-base)]/60 px-2 text-[11px] font-medium hover:border-[var(--plasma-accent)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6' : 'h-7'
            }`}
          >
            <Award className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span className="hidden sm:inline">Flex</span>
          </button>

          {/* WebGPU Status */}
          <button
            type="button"
            onClick={() => openApp('gpu-studio')}
            title={
              webgpuAvailable
                ? 'WebGPU Adapter Ready — Open Strata GPU Studio'
                : 'WebGPU Adapter Unavailable — Open GPU Inspector'
            }
            aria-label="WebGPU Status"
            className={`flex items-center justify-center rounded-md hover:bg-[var(--breeze-hover)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6 w-6' : 'h-7 w-7'
            }`}
          >
            <Cpu
              className={`h-3.5 w-3.5 ${
                webgpuAvailable ? 'text-emerald-400' : 'text-[var(--breeze-text-muted)]'
              }`}
              aria-hidden="true"
            />
          </button>

          {/* Notifications / Time Machine */}
          <button
            type="button"
            onClick={toggleNotificationDrawer}
            title="Notifications & Time Machine Snapshots"
            aria-label="Notifications and Time Machine"
            className={`flex items-center justify-center rounded-md text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6 w-6' : 'h-7 w-7'
            }`}
          >
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* Quick Settings Trigger */}
          <button
            id="plasma-quick-settings-btn"
            type="button"
            {...({ popoverTarget: 'plasma-quick-settings' } as React.ButtonHTMLAttributes<HTMLButtonElement>)}
            title="Quick Settings (LXQt Feather Mode, Global Themes & Share)"
            aria-label="Quick Settings"
            className={`flex items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6' : 'h-7'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
            {settings.featherMode && (
              <Feather className="h-3 w-3 plasma-accent-text" aria-hidden="true" />
            )}
          </button>

          {/* Hidden Tray Chevron */}
          <button
            id="plasma-hidden-tray-btn"
            type="button"
            {...({ popoverTarget: 'plasma-hidden-tray' } as React.ButtonHTMLAttributes<HTMLButtonElement>)}
            title="Show hidden system tray items"
            aria-label="Hidden system tray items"
            className={`flex items-center justify-center rounded-md text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6 w-5' : 'h-7 w-6'
            }`}
          >
            <ChevronUp className={`h-3.5 w-3.5 ${isTop ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {/* Digital Clock -> Calendar Popup */}
          <button
            id="plasma-clock-btn"
            type="button"
            {...({ popoverTarget: 'plasma-calendar' } as React.ButtonHTMLAttributes<HTMLButtonElement>)}
            title="Open Calendar & System Time"
            aria-label={`Clock ${timeString} ${dateString}`}
            className={`flex items-center justify-center rounded-md px-2 leading-tight hover:bg-[var(--breeze-hover)] transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-6 gap-1.5' : 'h-8 flex-col items-end'
            }`}
          >
            <span className="font-mono text-[11px] font-semibold text-[var(--breeze-text)]">
              {timeString}
            </span>
            <span className="font-mono text-[9px] text-[var(--breeze-text-muted)]">
              {dateString}
            </span>
          </button>

          {/* Far-Right Peek at Desktop */}
          <button
            id="plasma-peek-btn"
            type="button"
            onClick={() => setPeekDesktop(!peekDesktop)}
            title={peekDesktop ? 'Restore Windows' : 'Peek at Desktop'}
            aria-label="Peek at Desktop"
            aria-pressed={peekDesktop}
            className={`ml-0.5 flex w-3 items-center justify-center rounded border transition duration-120 cursor-pointer ${
              isCompactLxqt ? 'h-5' : 'h-7'
            } ${
              peekDesktop
                ? 'plasma-accent-fill border-transparent'
                : 'border-[var(--breeze-border-strong)] bg-[var(--breeze-hover)] hover:border-[var(--plasma-accent)]'
            }`}
          />
        </div>
      </nav>

      {/* ==================== KICKOFF / LXQT APPLICATION LAUNCHER POPOVER ==================== */}
      <div
        id="plasma-kickoff"
        {...({ popover: 'auto' } as React.HTMLAttributes<HTMLDivElement>)}
        className={`plasma-popover ${popoverStartClass} w-[460px] max-w-[calc(100vw-20px)]`}
      >
        <div className="breeze-popover rounded-xl overflow-hidden flex flex-col max-h-[min(540px,calc(100vh-80px))]">
          {/* Search Header */}
          <div className="flex items-center gap-2.5 border-b border-[var(--breeze-border)] bg-[var(--breeze-header)] px-3.5 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full plasma-accent-fill text-xs font-bold">
              D
            </div>
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--breeze-text-muted)]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={kickoffQuery}
                onChange={(e) => setKickoffQuery(e.target.value)}
                placeholder="Search Debian & strataget WASM applications..."
                aria-label="Search Kickoff applications"
                className="w-full rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--breeze-text)] placeholder:text-[var(--breeze-text-muted)] focus:border-[var(--plasma-accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Body: Sidebar Tabs + App List */}
          <div className="flex min-h-[290px] flex-1 overflow-hidden">
            <div className="w-36 shrink-0 border-r border-[var(--breeze-border)] bg-[var(--breeze-base)]/60 p-2 flex flex-col gap-1">
              {(
                [
                  { id: 'favorites', label: 'Favorites', icon: Star },
                  { id: 'all', label: 'All Applications', icon: Grid },
                  { id: 'extras', label: 'Extras & WASM', icon: Sparkles },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon
                const active = kickoffTab === tab.id && !kickoffQuery
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setKickoffQuery('')
                      setKickoffTab(tab.id)
                    }}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition duration-120 cursor-pointer ${
                      active
                        ? 'plasma-accent-fill'
                        : 'text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                )
              })}

              <div className="mt-auto pt-2 border-t border-[var(--breeze-border)] space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    hidePopoverById('plasma-kickoff')
                    setEditMode(!editMode)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
                >
                  <Edit3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>Edit Mode</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hidePopoverById('plasma-kickoff')
                    toggleMissionControl()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
                >
                  <Layers className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>Overview</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {kickoffEntries.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--breeze-text-muted)]">
                  No applications match “{kickoffQuery}”.
                </div>
              ) : (
                kickoffEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      hidePopoverById('plasma-kickoff')
                      entry.onLaunch()
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--breeze-hover)] transition duration-120 cursor-pointer"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] plasma-accent-text">
                      <AppIcon name={entry.icon} appId={entry.id} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-[var(--breeze-text)]">
                          {entry.name}
                        </span>
                        {entry.isWasm && (
                          <span className="rounded bg-emerald-500/15 px-1 py-0.2 font-mono text-[9px] text-emerald-400">
                            WASM
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-[var(--breeze-text-muted)]">
                        {entry.subtitle}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Kickoff Footer: Star StrataOS on GitHub + Power Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--breeze-border)] bg-[var(--breeze-header)] px-3 py-2">
            <a
              id="kickoff-github-star"
              href={STRATA_CONFIG.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25 transition duration-120"
            >
              <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" aria-hidden="true" />
              <span>Star StrataOS on GitHub</span>
            </a>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  hidePopoverById('plasma-kickoff')
                  setBootPhase('uefi-setup')
                }}
                title="Reboot to StrataUEFI Firmware Setup"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
                <span>UEFI</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  hidePopoverById('plasma-kickoff')
                  setLocked(true)
                }}
                title="Lock Session"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Lock</span>
              </button>
              <button
                type="button"
                onClick={() => void handleRestartKernel()}
                title="Sync Disk & Restart Debian Linux Kernel"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/15 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Restart</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== QUICK SETTINGS (FEATHER MODE, THEMES, PANEL & SHARE) ==================== */}
      <div
        id="plasma-quick-settings"
        {...({ popover: 'auto' } as React.HTMLAttributes<HTMLDivElement>)}
        className={`plasma-popover ${popoverEndClass} w-[344px] max-w-[calc(100vw-20px)]`}
      >
        <div className="breeze-popover rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--breeze-border)] pb-2">
            <span className="text-xs font-semibold">Plasma / LXQt Quick Settings</span>
            <button
              type="button"
              onClick={() => {
                hidePopoverById('plasma-quick-settings')
                openApp('settings')
              }}
              className="text-[11px] plasma-accent-text hover:underline cursor-pointer"
            >
              All Settings
            </button>
          </div>

          {/* Instant LXQt Feather Mode + Compact 32px Panel Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              id="quick-feather-toggle"
              type="button"
              onClick={() => {
                const next = !settings.featherMode
                updateSettings({ featherMode: next, performanceMode: next })
                toast.info(
                  next
                    ? 'LXQt Feather Mode ON (zero blur, zero shadows)'
                    : 'LXQt Feather Mode OFF (Plasma translucency restored)'
                )
              }}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition duration-120 cursor-pointer ${
                settings.featherMode
                  ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                  : 'border-[var(--breeze-border)] bg-[var(--breeze-base)] hover:border-[var(--breeze-border-strong)]'
              }`}
            >
              <Feather className="h-4 w-4 plasma-accent-text shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-medium truncate">LXQt Feather</div>
                <div className="text-[10px] text-[var(--breeze-text-muted)]">
                  {settings.featherMode ? 'ON • 0 Blur' : 'OFF • Plasma'}
                </div>
              </div>
            </button>

            <button
              id="quick-panel-style-toggle"
              type="button"
              onClick={() =>
                updateSettings({
                  panelStyle: isCompactLxqt ? 'floating' : 'lxqt-compact',
                })
              }
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition duration-120 cursor-pointer ${
                isCompactLxqt
                  ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                  : 'border-[var(--breeze-border)] bg-[var(--breeze-base)] hover:border-[var(--breeze-border-strong)]'
              }`}
            >
              <PanelBottom className="h-4 w-4 plasma-accent-text shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-medium truncate">Panel Style</div>
                <div className="text-[10px] text-[var(--breeze-text-muted)]">
                  {isCompactLxqt ? 'LXQt 32px' : 'Floating 44px'}
                </div>
              </div>
            </button>
          </div>

          {/* 3 Custom Plasma/LXQt Global Themes */}
          <div>
            <div className="mb-1.5 text-[11px] text-[var(--breeze-text-muted)]">Global Theme</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['debian-crimson', 'strata-obsidian', 'lxqt-frost'] as GlobalThemeId[]).map((id) => {
                const preset = GLOBAL_THEMES[id]
                const active = settings.globalTheme === id
                return (
                  <button
                    key={id}
                    id={`quick-theme-${id}`}
                    type="button"
                    onClick={() => applyGlobalTheme(id)}
                    className={`flex flex-col items-start gap-1 rounded-lg border px-2 py-1.5 text-left transition duration-120 cursor-pointer ${
                      active
                        ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                        : 'border-[var(--breeze-border)] bg-[var(--breeze-base)]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className="h-3 w-3 rounded-full border border-white/25"
                        style={{ backgroundColor: preset.accentHex }}
                      />
                      {active && <Check className="h-3 w-3 plasma-accent-text" />}
                    </div>
                    <span className="truncate w-full text-[10px] font-semibold">
                      {id === 'debian-crimson'
                        ? 'Debian Red'
                        : id === 'strata-obsidian'
                          ? 'Obsidian'
                          : 'LXQt Frost'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Wallpaper quick swatches */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--breeze-text-muted)]">
              <span>Wallpaper</span>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ webgpuWallpaperEnabled: !settings.webgpuWallpaperEnabled })
                }
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] cursor-pointer ${
                  settings.webgpuWallpaperEnabled
                    ? 'plasma-accent-fill'
                    : 'border border-[var(--breeze-border)] hover:bg-[var(--breeze-hover)]'
                }`}
              >
                WebGPU {settings.webgpuWallpaperEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {WALLPAPER_SWATCHES.map((wp) => (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => updateSettings({ wallpaper: wp.id })}
                  title={wp.label}
                  className={`h-7 rounded-md border transition duration-120 cursor-pointer ${
                    settings.wallpaper === wp.id
                      ? 'border-[var(--plasma-accent)] ring-1 ring-[var(--plasma-accent)]'
                      : 'border-[var(--breeze-border)]'
                  }`}
                  style={{ background: wp.bg }}
                />
              ))}
            </div>
          </div>

          {/* Share / Flex Proof Card + Deep-Link Copier */}
          <div className="rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">Share / Flex Setup</span>
              <button
                type="button"
                onClick={() => {
                  hidePopoverById('plasma-quick-settings')
                  setFlexCardOpen(true)
                }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] plasma-accent-fill font-semibold cursor-pointer"
              >
                <Award className="h-3 w-3" aria-hidden="true" />
                PNG Flex Card
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  { id: 'showcase', label: 'Showcase' },
                  { id: 'active', label: 'Active' },
                  { id: 'webgpu', label: 'WebGPU' },
                  { id: 'uefi', label: 'UEFI' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSharePreset(p.id)}
                  className={`rounded py-1 font-mono text-[10px] transition duration-120 cursor-pointer ${
                    sharePreset === p.id
                      ? 'plasma-accent-fill font-semibold'
                      : 'bg-[var(--breeze-view)] text-[var(--breeze-text-muted)] hover:text-[var(--breeze-text)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                id="share-this-setup-btn"
                type="button"
                onClick={() => void handleShareSetup()}
                data-copied={copiedState === 'copied' ? '' : undefined}
                data-failed={copiedState === 'failed' ? '' : undefined}
                className="flex min-h-[28px] flex-1 items-center justify-center gap-1.5 rounded-lg plasma-accent-fill px-3 py-1.5 text-xs font-semibold hover:brightness-110 transition duration-120 cursor-pointer"
              >
                {copiedState === 'copied' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{copiedState === 'copied' ? 'Copied Setup Link' : 'Share This Setup'}</span>
              </button>
              <span
                role="status"
                className={`text-[10px] font-mono transition-opacity ${
                  copyStatusMsg ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {copyStatusMsg}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== HIDDEN SYSTEM TRAY POPOVER (^) ==================== */}
      <div
        id="plasma-hidden-tray"
        {...({ popover: 'auto' } as React.HTMLAttributes<HTMLDivElement>)}
        className={`plasma-popover ${popoverEndClass} w-[240px] max-w-[calc(100vw-20px)]`}
      >
        <div className="breeze-popover rounded-xl p-2 space-y-1 text-xs">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--breeze-text-muted)]">
            Status &amp; Desktop Tools
          </div>
          <button
            type="button"
            onClick={() => {
              hidePopoverById('plasma-hidden-tray')
              setEditMode(!editMode)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span>{editMode ? 'Exit Edit Mode' : 'Enter Desktop Edit Mode'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hidePopoverById('plasma-hidden-tray')
              toggleMissionControl()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Layers className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span>Plasma Overview (Ctrl+Up)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hidePopoverById('plasma-hidden-tray')
              setStrataPetActive(!strataPetActive)
            }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
              StrataPet Mascot
            </span>
            <span className="font-mono text-[10px] text-[var(--breeze-text-muted)]">
              {strataPetActive ? 'ON' : 'OFF'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              hidePopoverById('plasma-hidden-tray')
              setMelt93Active(true)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Flame className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span>Launch Melt93 Shader</span>
          </button>
          <button
            type="button"
            onClick={() => {
              hidePopoverById('plasma-hidden-tray')
              openApp('monitor')
            }}
            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              Wake Lock
            </span>
            <span className="font-mono text-[10px] text-[var(--breeze-text-muted)]">
              {wakeLockActive ? 'ACTIVE' : 'IDLE'}
            </span>
          </button>
          <div className="my-1 border-t border-[var(--breeze-border)]" />
          <button
            type="button"
            onClick={() => {
              hidePopoverById('plasma-hidden-tray')
              setAboutModalOpen(true)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Info className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span>About StrataOS v1.0</span>
          </button>
        </div>
      </div>

      {/* ==================== DIGITAL CLOCK & CALENDAR POPUP ==================== */}
      <div
        id="plasma-calendar"
        {...({ popover: 'auto' } as React.HTMLAttributes<HTMLDivElement>)}
        className={`plasma-popover ${popoverEndClass} w-[300px] max-w-[calc(100vw-20px)]`}
      >
        <div className="breeze-popover rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--breeze-border)] pb-2.5">
            <div>
              <div className="font-mono text-xl font-semibold leading-none">{timeString}</div>
              <div className="mt-1 text-[11px] text-[var(--breeze-text-muted)]">
                {now.toLocaleDateString([], {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => hidePopoverById('plasma-calendar')}
              aria-label="Close calendar"
              className="rounded-md p-1 text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
              }
              aria-label="Previous month"
              className="rounded p-1 hover:bg-[var(--breeze-hover)] cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <CalendarIcon className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
              {calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() =>
                setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
              }
              aria-label="Next month"
              className="rounded p-1 hover:bg-[var(--breeze-hover)] cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px]">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="py-1 font-semibold text-[var(--breeze-text-muted)]">
                {d}
              </div>
            ))}
            {calendarDays.map((cell, idx) => (
              <div
                key={idx}
                className={`flex h-7 items-center justify-center rounded-md text-[11px] ${
                  cell.isToday
                    ? 'plasma-accent-fill font-bold'
                    : cell.day
                      ? 'hover:bg-[var(--breeze-hover)]'
                      : ''
                }`}
              >
                {cell.day ?? ''}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--breeze-border)] pt-2 font-mono text-[10px] text-[var(--breeze-text-muted)]">
            <span className="flex items-center gap-1">
              <Monitor className="h-3 w-3 plasma-accent-text" aria-hidden="true" />
              Debian • Plasma/LXQt
            </span>
            <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </div>
        </div>
      </div>
    </>
  )
}
