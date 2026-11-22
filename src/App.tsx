import React, { useEffect, useMemo } from 'react'
import { kernelClient } from './kernel/kernelClient'
import { AboutModal } from './shell/AboutModal'
import { AppIcon } from './shell/AppIcon'
import { CommandPalette } from './shell/CommandPalette'
import { FloatingDock } from './shell/FloatingDock'
import { Melt93Overlay } from './shell/Melt93Overlay'
import { MissionControl } from './shell/MissionControl'
import { StrataPet } from './shell/StrataPet'
import { StrataUEFI } from './shell/StrataUEFI'
import { TimeMachineDrawer } from './shell/TimeMachineDrawer'
import { TopStatusBar } from './shell/TopStatusBar'
import { WebGpuComputeWallpaper } from './shell/WebGpuComputeWallpaper'
import { WindowManager } from './shell/WindowManager'
import { NATIVE_APPS, useOsStore, type WallpaperId } from './state/osStore'

const WALLPAPER_STYLES: Record<WallpaperId, string> = {
  'obsidian-grid':
    'radial-gradient(ellipse at 18% 12%, rgba(24, 34, 46, 0.45) 0%, rgba(9, 9, 11, 1) 65%)',
  'carbon-slate':
    'radial-gradient(circle at 20% 20%, #14181f 0%, #09090b 78%)',
  'midnight-aurora':
    'radial-gradient(circle at 80% 15%, #0c1d24 0%, #09090b 70%)',
  'deep-abyss': 'linear-gradient(180deg, #09090b 0%, #050507 100%)',
  'webgpu-compute': 'radial-gradient(circle at 50% 50%, #0d1520 0%, #09090b 80%)',
}

export const App: React.FC = () => {
  const wallpaper = useOsStore((s) => s.settings.wallpaper)
  const installedPackages = useOsStore((s) => s.installedPackages)

  const setKernelStatus = useOsStore((s) => s.setKernelStatus)
  const setWorkerLatency = useOsStore((s) => s.setWorkerLatency)
  const setInstalledPackages = useOsStore((s) => s.setInstalledPackages)
  const openApp = useOsStore((s) => s.openApp)
  const closeAppByPkgId = useOsStore((s) => s.closeAppByPkgId)
  const toggleCommandPalette = useOsStore((s) => s.toggleCommandPalette)
  const toggleMissionControl = useOsStore((s) => s.toggleMissionControl)
  const setWorkspace = useOsStore((s) => s.setActiveWorkspace)
  const hydratePreferences = useOsStore((s) => s.hydratePreferences)

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

        // Handle deep-link query parameters (?app=store or ?install=hexforge)
        const params = new URLSearchParams(window.location.search)
        const appParam = params.get('app')?.trim().toLowerCase()
        const installParam = params.get('install')?.trim().toLowerCase()
        if (appParam && appParam in NATIVE_APPS) {
          openApp(appParam as keyof typeof NATIVE_APPS)
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
  ])

  // Global Keyboard Shortcuts (Ctrl+K, Alt+Space, Alt+Tab, Alt+1/2/3)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      } else if (e.altKey && e.code === 'Space') {
        e.preventDefault()
        toggleCommandPalette()
      } else if (e.altKey && e.key === 'Tab') {
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

  return (
    <main
      className="relative h-screen w-screen overflow-hidden select-none bg-[#09090b]"
      style={{ background: WALLPAPER_STYLES[wallpaper] ?? WALLPAPER_STYLES['obsidian-grid'] }}
    >
      {/* Hidden h1 for accessibility & SEO */}
      <h1 className="sr-only">
        StrataOS v1.0.0 (Bedrock) — Browser-Native Linux 7.3 Web Operating System &amp; strataget WASM Ecosystem
      </h1>

      {/* StrataUEFI Pre-Boot Firmware & POST Splash */}
      <StrataUEFI />

      {/* Optional WebGPU 120fps WGSL Compute Wallpaper */}
      <WebGpuComputeWallpaper />

      {/* Top Status Bar */}
      <TopStatusBar />

      {/* Desktop Shortcut Icons Grid */}
      <section
        aria-label="Desktop Shortcuts"
        className="fixed top-11 left-3 z-10 flex flex-col flex-wrap gap-1.5 max-h-[calc(100vh-115px)]"
      >
        {desktopShortcuts.map((sc) => (
          <button
            key={sc.id}
            onClick={sc.onOpen}
            className="group flex w-20 flex-col items-center gap-1 rounded-xl border border-transparent p-1.5 text-center hover:border-white/10 hover:bg-white/[0.04] transition"
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[#121215]/90 text-sky-400 shadow-md group-hover:border-sky-500/40 group-hover:text-sky-300">
              <AppIcon name={sc.icon} appId={sc.id} className="h-4 w-4" />
              {sc.badge && (
                <span className="absolute -top-1 -right-1 rounded bg-emerald-500 px-1 py-0.2 font-mono text-[8px] font-bold text-zinc-950">
                  {sc.badge}
                </span>
              )}
            </div>
            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-zinc-200 drop-shadow">
              {sc.label}
            </span>
          </button>
        ))}
      </section>

      {/* Window Manager Surface */}
      <WindowManager />

      {/* Floating Bottom Dock */}
      <FloatingDock />

      {/* Mission Control & Workspaces Overview (Alt+Tab) */}
      <MissionControl />

      {/* Time Machine Snapshots & System Control Drawer */}
      <TimeMachineDrawer />

      {/* Command Palette Overlay */}
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
