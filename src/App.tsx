import { Edit3, Layers, Search, Sliders, Terminal } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { Toaster } from 'sonner'
import { kernelClient } from './kernel/kernelClient'
import { AboutModal } from './shell/AboutModal'
import { AppIcon } from './shell/AppIcon'
import { CommandPalette } from './shell/CommandPalette'
import { LiveProofCard } from './shell/LiveProofCard'
import { Melt93Overlay } from './shell/Melt93Overlay'
import { MissionControl } from './shell/MissionControl'
import { PlasmaPanel } from './shell/PlasmaPanel'
import { PlasmoidsLayer } from './shell/Plasmoids'
import { StrataPet } from './shell/StrataPet'
import { StrataUEFI } from './shell/StrataUEFI'
import { TimeMachineDrawer } from './shell/TimeMachineDrawer'
import { WebGpuComputeWallpaper } from './shell/WebGpuComputeWallpaper'
import { WindowManager } from './shell/WindowManager'
import {
  NATIVE_APPS,
  useOsStore,
  type NativeAppId,
  type ThemeMode,
  type WallpaperId,
} from './state/osStore'

const WALLPAPER_STYLES: Record<WallpaperId, string> = {
  'obsidian-grid':
    'radial-gradient(ellipse at 20% 14%, rgba(61, 174, 233, 0.14) 0%, rgba(27, 30, 32, 0.96) 52%, #111316 100%)',
  'carbon-slate':
    'radial-gradient(circle at 22% 20%, #232a34 0%, #14171c 76%)',
  'midnight-aurora':
    'radial-gradient(circle at 80% 15%, #102a36 0%, #11151b 70%)',
  'deep-abyss': 'linear-gradient(180deg, #111316 0%, #07080a 100%)',
  'webgpu-compute': 'radial-gradient(circle at 50% 50%, #121c28 0%, #111316 80%)',
}

const LIGHT_WALLPAPER_STYLES: Record<WallpaperId, string> = {
  'obsidian-grid':
    'radial-gradient(ellipse at 20% 14%, rgba(61, 174, 233, 0.22) 0%, #dfe5ec 55%, #cfd8e3 100%)',
  'carbon-slate':
    'radial-gradient(circle at 22% 20%, #e7edf4 0%, #cbd5e1 78%)',
  'midnight-aurora':
    'radial-gradient(circle at 80% 15%, #cbe9f6 0%, #dde6ef 70%)',
  'deep-abyss': 'linear-gradient(180deg, #eceff2 0%, #d8dfe7 100%)',
  'webgpu-compute': 'radial-gradient(circle at 50% 50%, #d7ecf7 0%, #e4e9ef 80%)',
}

const APP_DEEP_LINK_ALIASES: Record<string, NativeAppId> = {
  webgpu: 'gpu-studio',
  gpu: 'gpu-studio',
  ide: 'studio',
  ai: 'copilot',
  term: 'terminal',
  synth: 'bytescope',
  paint: 'paint93',
  arcade: 'termarcade',
}

function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'dark' || mode === 'light') return mode
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

export const App: React.FC = () => {
  const wallpaper = useOsStore((s) => s.settings.wallpaper)
  const theme = useOsStore((s) => s.settings.theme)
  const accentHex = useOsStore((s) => s.settings.accentHex)
  const panelPosition = useOsStore((s) => s.settings.panelPosition)
  const editMode = useOsStore((s) => s.editMode)
  const installedPackages = useOsStore((s) => s.installedPackages)

  const setKernelStatus = useOsStore((s) => s.setKernelStatus)
  const setWorkerLatency = useOsStore((s) => s.setWorkerLatency)
  const setInstalledPackages = useOsStore((s) => s.setInstalledPackages)
  const openApp = useOsStore((s) => s.openApp)
  const closeAppByPkgId = useOsStore((s) => s.closeAppByPkgId)
  const toggleCommandPalette = useOsStore((s) => s.toggleCommandPalette)
  const toggleMissionControl = useOsStore((s) => s.toggleMissionControl)
  const setWorkspace = useOsStore((s) => s.setActiveWorkspace)
  const setBootPhase = useOsStore((s) => s.setBootPhase)
  const setEditMode = useOsStore((s) => s.setEditMode)
  const updateSettings = useOsStore((s) => s.updateSettings)
  const hydratePreferences = useOsStore((s) => s.hydratePreferences)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [resolvedScheme, setResolvedScheme] = useState<'dark' | 'light'>(() => resolveTheme(theme))

  // Sync Breeze theme + Plasma accent + <meta name="color-scheme"> + cross-tab storage
  useEffect(() => {
    const resolved = resolveTheme(theme)
    setResolvedScheme(resolved)

    const root = document.documentElement
    root.setAttribute('data-theme', resolved)
    root.style.setProperty('--plasma-accent', accentHex || '#3daee9')

    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
    if (meta) {
      meta.content = theme === 'system' ? 'light dark' : theme
    }

    try {
      if (theme === 'system') {
        localStorage.removeItem('color-scheme')
      } else {
        localStorage.setItem('color-scheme', theme)
      }
    } catch {
      // ignore storage restrictions
    }
  }, [theme, accentHex])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'color-scheme') return
      if (e.newValue === 'light' || e.newValue === 'dark') {
        updateSettings({ theme: e.newValue })
      } else if (e.newValue === null) {
        updateSettings({ theme: 'system' })
      }
    }
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const onMqChange = () => {
      if (useOsStore.getState().settings.theme === 'system') {
        const next = resolveTheme('system')
        setResolvedScheme(next)
        document.documentElement.setAttribute('data-theme', next)
      }
    }
    window.addEventListener('storage', onStorage)
    mq?.addEventListener?.('change', onMqChange)
    return () => {
      window.removeEventListener('storage', onStorage)
      mq?.removeEventListener?.('change', onMqChange)
    }
  }, [updateSettings])

  // Boot Linux kernel worker & hydrate preferences
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__strata = {
      kernelClient,
      useOsStore,
    }
    void hydratePreferences()

    const unsubStatus = kernelClient.subscribeStatus((status, stage) => {
      setKernelStatus(status, stage)
    })

    const unsubPkgs = kernelClient.subscribePackages((pkgs) => {
      setInstalledPackages(pkgs)
    })

    const unsubActions = kernelClient.subscribeAppActions((action) => {
      if (action.type === 'launch') {
        openApp(`wasm:${action.pkgId}`, { args: action.args })
      } else if (action.type === 'close') {
        closeAppByPkgId(action.pkgId)
      }
    })

    void kernelClient
      .boot()
      .then(async () => {
        const pkgs = await kernelClient.getInstalledPackages()
        setInstalledPackages(pkgs)

        // Handle deep-link query parameters (?app=webgpu, ?app=store, ?install=pixelsynth)
        const params = new URLSearchParams(window.location.search)
        const appParam = params.get('app')?.trim().toLowerCase()
        const installParam = params.get('install')?.trim().toLowerCase()
        if (appParam) {
          if (appParam === 'uefi') {
            setBootPhase('uefi-setup')
          } else {
            const mapped = APP_DEEP_LINK_ALIASES[appParam] ?? appParam
            if (mapped in NATIVE_APPS) {
              openApp(mapped as NativeAppId)
            }
          }
        }
        if (installParam) {
          const record = await kernelClient.installPackage(installParam)
          if (record.type === 'wasm-gui') {
            openApp(`wasm:${record.id}`, {
              title: `${record.name} v${record.version}`,
              icon: record.icon,
            })
          }
        }
      })
      .catch(() => {})

    const pingInterval = setInterval(async () => {
      try {
        const ms = await kernelClient.pingLatencyMs()
        setWorkerLatency(ms)
      } catch {
        // ignore
      }
    }, 2500)

    return () => {
      unsubStatus()
      unsubPkgs()
      unsubActions()
      clearInterval(pingInterval)
    }
  }, [
    hydratePreferences,
    setKernelStatus,
    setInstalledPackages,
    openApp,
    closeAppByPkgId,
    setWorkerLatency,
    setBootPhase,
  ])

  // Global Plasma & KWin Shortcuts (Alt+Space / Ctrl+K -> KRunner, Ctrl+Up / Alt+Tab -> Overview, Alt+1/2/3)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      } else if (e.altKey && e.code === 'Space') {
        e.preventDefault()
        toggleCommandPalette()
      } else if ((e.ctrlKey && e.key === 'ArrowUp') || (e.altKey && e.key === 'Tab')) {
        e.preventDefault()
        toggleMissionControl()
      } else if (e.altKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
        e.preventDefault()
        setWorkspace(Number(e.key) as 1 | 2 | 3)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleCommandPalette, toggleMissionControl, setWorkspace])

  // Dismiss desktop context menu on outside click / Esc
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const desktopShortcuts = useMemo(() => {
    const base = Object.values(NATIVE_APPS).map((app) => ({
      id: app.id,
      label: app.name,
      icon: app.icon,
      badge: null as string | null,
      onOpen: () => openApp(app.id),
    }))

    const wasmShortcuts = installedPackages.map((pkg) => ({
      id: `wasm:${pkg.id}`,
      label: pkg.name,
      icon: pkg.icon,
      badge: pkg.type === 'wasm-cli' ? 'CLI' : 'WASM',
      onOpen: () => {
        if (pkg.type === 'wasm-cli') {
          openApp('terminal')
          setTimeout(() => {
            kernelClient.sendCommandToTerminal(`${pkg.id} "2^16 + sqrt(144)"`)
          }, 120)
        } else {
          openApp(`wasm:${pkg.id}`, {
            title: `${pkg.name} v${pkg.version}`,
            icon: pkg.icon,
          })
        }
      },
    }))

    return [...base, ...wasmShortcuts]
  }, [installedPackages, openApp])

  const handleDesktopContextMenu = (e: React.MouseEvent<HTMLElement>) => {
    // Only open desktop context menu when right-clicking the desktop backdrop (not inside windows)
    const target = e.target as HTMLElement
    if (target.closest('[data-window-id], #plasma-panel, [popover], #live-proof-card')) return
    e.preventDefault()
    const menuW = 220
    const menuH = 220
    const x = Math.min(e.clientX, window.innerWidth - menuW - 10)
    const y = Math.min(e.clientY, window.innerHeight - menuH - 10)
    setContextMenu({ x: Math.max(8, x), y: Math.max(8, y) })
  }

  const wallpaperBg =
    resolvedScheme === 'light'
      ? LIGHT_WALLPAPER_STYLES[wallpaper] ?? LIGHT_WALLPAPER_STYLES['obsidian-grid']
      : WALLPAPER_STYLES[wallpaper] ?? WALLPAPER_STYLES['obsidian-grid']

  return (
    <main
      id="plasma-desktop-root"
      onContextMenu={handleDesktopContextMenu}
      className="relative h-screen w-screen overflow-hidden select-none bg-[var(--breeze-base)]"
    >
      {/* Hidden h1 for accessibility & SEO */}
      <h1 className="sr-only">
        StrataOS v1.0.0 (Bedrock) — Real Linux 7.3 Kernel &amp; KDE Plasma 6 Desktop in One Tab
      </h1>

      {/* Sonner Toast Notifications (KDE Plasma bottom-right above System Tray) */}
      <Toaster
        theme={resolvedScheme}
        position="bottom-right"
        offset={58}
        richColors
        toastOptions={{
          style: {
            background: 'var(--breeze-view)',
            border: '1px solid var(--breeze-border-strong)',
            color: 'var(--breeze-text)',
          },
        }}
      />

      {/* StrataUEFI Pre-Boot Firmware & POST Splash */}
      <StrataUEFI />

      {/* Desktop Canvas (zooms out slightly in Plasma Desktop Edit Mode) */}
      <div
        data-edit-mode={editMode ? 'true' : 'false'}
        className="plasma-desktop-canvas relative h-full w-full overflow-hidden"
        style={{ background: wallpaperBg }}
      >
        {/* Optional WebGPU 120fps WGSL Compute Wallpaper */}
        <WebGpuComputeWallpaper />

        {/* Desktop Shortcut Icons Grid */}
        <section
          aria-label="Desktop Shortcuts"
          style={{
            top: panelPosition === 'top' ? '64px' : '16px',
          }}
          className="fixed left-3 z-[8] flex flex-col flex-wrap gap-1.5 max-h-[calc(100vh-88px)]"
        >
          {desktopShortcuts.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={sc.onOpen}
              className="group flex w-20 flex-col items-center gap-1 rounded-xl border border-transparent p-1.5 text-center hover:border-[var(--breeze-border-strong)] hover:bg-[var(--breeze-hover)] transition cursor-pointer"
            >
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--breeze-border)] bg-[var(--breeze-view)]/90 plasma-accent-text shadow-md group-hover:border-[var(--plasma-accent)]">
                <AppIcon name={sc.icon} appId={sc.id} className="h-4 w-4" />
                {sc.badge && (
                  <span className="absolute -top-1 -right-1 rounded bg-emerald-500 px-1 py-0.2 font-mono text-[8px] font-bold text-zinc-950">
                    {sc.badge}
                  </span>
                )}
              </div>
              <span
                className={`line-clamp-2 text-[11px] font-medium leading-tight drop-shadow ${
                  resolvedScheme === 'light' ? 'text-[#1b1e20]' : 'text-[#eff0f1]'
                }`}
              >
                {sc.label}
              </span>
            </button>
          ))}
        </section>

        {/* Window Manager Surface (KWin Breeze) */}
        <WindowManager />

        {/* Persisted Draggable Plasmoids & Desktop Edit Mode Toolbar */}
        <PlasmoidsLayer />
      </div>

      {/* Right-Click Desktop Context Menu */}
      {contextMenu && (
        <div
          id="desktop-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          className="breeze-popover plasma-panel-blur fixed z-[9400] w-56 rounded-xl p-1.5 text-xs select-none"
        >
          <button
            id="ctx-enter-edit-mode"
            type="button"
            onClick={() => {
              setContextMenu(null)
              setEditMode(!editMode)
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span className="font-medium">
              {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null)
              toggleCommandPalette()
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Search className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span>Open KRunner</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null)
              toggleMissionControl()
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Layers className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span>Plasma Overview</span>
          </button>
          <div className="my-1 border-t border-[var(--breeze-border)]" />
          <button
            type="button"
            onClick={() => {
              setContextMenu(null)
              openApp('terminal')
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Terminal className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span>Open Strata Terminal</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setContextMenu(null)
              openApp('settings')
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--breeze-hover)] cursor-pointer"
          >
            <Sliders className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
            <span>Configure Breeze &amp; Display</span>
          </button>
        </div>
      )}

      {/* 10-Second First-Visit Live Proof Card */}
      <LiveProofCard />

      {/* Floating KDE Plasma 6 Panel (Kickoff + Task Manager + System Tray + Clock + Peek) */}
      <PlasmaPanel />

      {/* Plasma Overview & Virtual Desktops 1–3 (Ctrl+Up / Alt+Tab) */}
      <MissionControl />

      {/* Time Machine Snapshots & System Control Drawer */}
      <TimeMachineDrawer />

      {/* Top-Center KRunner Overlay (Alt+Space / Ctrl+K) */}
      <CommandPalette />

      {/* About StrataOS Modal */}
      <AboutModal />

      {/* Windows 93-Inspired Extras Overlays */}
      <Melt93Overlay />
      <StrataPet />
    </main>
  )
}

export default App
