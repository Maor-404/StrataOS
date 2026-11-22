import React, { useMemo } from 'react'
import { kernelClient } from '../kernel/kernelClient'
import {
  NATIVE_APPS,
  useOsStore,
  type AppId,
  type NativeAppId,
} from '../state/osStore'
import { AppIcon } from './AppIcon'

interface DockItem {
  appId: AppId
  name: string
  icon: string
  isCommunityWasm: boolean
  isCli?: boolean
  pkgId?: string
}

export const FloatingDock: React.FC = () => {
  const pinnedApps = useOsStore((s) => s.pinnedApps)
  const installedPackages = useOsStore((s) => s.installedPackages)
  const windows = useOsStore((s) => s.windows)
  const focusedWindowId = useOsStore((s) => s.focusedWindowId)
  const activeWorkspace = useOsStore((s) => s.activeWorkspace)
  const performanceMode = useOsStore((s) => s.settings.performanceMode)

  const openApp = useOsStore((s) => s.openApp)
  const focusWindow = useOsStore((s) => s.focusWindow)
  const toggleMinimizeWindow = useOsStore((s) => s.toggleMinimizeWindow)

  const { nativeItems, communityItems } = useMemo(() => {
    const nativeList: DockItem[] = []
    for (const id of pinnedApps) {
      if (!id.startsWith('wasm:')) {
        const meta = NATIVE_APPS[id as NativeAppId]
        if (meta) {
          nativeList.push({
            appId: meta.id,
            name: meta.name,
            icon: meta.icon,
            isCommunityWasm: false,
          })
        }
      }
    }

    const communityList: DockItem[] = installedPackages.map((pkg) => ({
      appId: `wasm:${pkg.id}`,
      name: `${pkg.name} (${pkg.version})`,
      icon: pkg.icon,
      isCommunityWasm: true,
      isCli: pkg.type === 'wasm-cli',
      pkgId: pkg.id,
    }))

    return { nativeItems: nativeList, communityItems: communityList }
  }, [pinnedApps, installedPackages])

  const handleDockClick = (item: DockItem) => {
    if (item.isCli && item.pkgId) {
      openApp('terminal')
      setTimeout(() => {
        kernelClient.sendCommandToTerminal(`${item.pkgId} "2^16 + sqrt(144)"`)
      }, 120)
      return
    }

    const winId = `win-${item.appId}`
    const existing = windows[winId]
    if (existing) {
      if (
        focusedWindowId === winId &&
        !existing.isMinimized &&
        existing.workspace === activeWorkspace
      ) {
        toggleMinimizeWindow(winId)
      } else {
        openApp(item.appId)
        focusWindow(winId)
      }
    } else {
      openApp(item.appId)
    }
  }

  return (
    <div className="fixed bottom-3 left-1/2 z-[8900] -translate-x-1/2 select-none">
      <nav
        aria-label="StrataOS Dock"
        className={`flex items-center gap-1.5 rounded-2xl border border-white/[0.08] px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.85)] ${
          performanceMode ? 'bg-[#121215]' : 'bg-[#121215]/85 strata-chrome-blur'
        }`}
      >
        {nativeItems.map((item) => {
          const winId = `win-${item.appId}`
          const win = windows[winId]
          const isRunning = Boolean(win)
          const isFocused = focusedWindowId === winId && !win?.isMinimized

          return (
            <button
              key={item.appId}
              id={`dock-item-${item.appId}`}
              onClick={() => handleDockClick(item)}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-150 ${
                isFocused
                  ? 'border-sky-500/45 bg-sky-500/15 text-sky-300 -translate-y-0.5'
                  : isRunning
                  ? 'border-white/10 bg-[#1c1c21] text-zinc-100 hover:-translate-y-0.5 hover:bg-zinc-800'
                  : 'border-transparent bg-[#1c1c21]/60 text-zinc-400 hover:-translate-y-0.5 hover:border-white/10 hover:bg-[#1c1c21] hover:text-zinc-100'
              }`}
              title={item.name}
            >
              <AppIcon name={item.icon} appId={item.appId} className="h-4 w-4" />
              {/* Tooltip */}
              <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#121215] px-2 py-0.5 text-[11px] font-medium text-zinc-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {item.name}
              </span>
              {/* Active Indicator Dot */}
              {isRunning && (
                <span
                  className={`absolute -bottom-1 h-1 w-1.5 rounded-full ${
                    isFocused ? 'bg-sky-400 w-3' : 'bg-zinc-400'
                  } transition-all`}
                />
              )}
            </button>
          )
        })}

        {communityItems.length > 0 && (
          <>
            <div className="mx-1 h-6 w-px bg-white/10" />
            {communityItems.map((item) => {
              const winId = `win-${item.appId}`
              const win = windows[winId]
              const isRunning = Boolean(win)
              const isFocused = focusedWindowId === winId && !win?.isMinimized

              return (
                <button
                  key={item.appId}
                  id={`dock-item-${item.appId}`}
                  onClick={() => handleDockClick(item)}
                  className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-150 ${
                    isFocused
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 -translate-y-0.5'
                      : isRunning
                      ? 'border-emerald-500/30 bg-[#1c1c21] text-emerald-300 hover:-translate-y-0.5'
                      : 'border-white/10 bg-[#1c1c21]/70 text-sky-300 hover:-translate-y-0.5 hover:border-sky-500/40'
                  }`}
                  title={item.name}
                >
                  <AppIcon name={item.icon} className="h-4 w-4" />
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#121215] px-2 py-0.5 text-[11px] font-medium text-emerald-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {item.name}
                  </span>
                  <span
                    className={`absolute -bottom-1 h-1 rounded-full ${
                      isFocused
                        ? 'w-3 bg-emerald-400'
                        : isRunning
                        ? 'w-1.5 bg-emerald-400'
                        : 'w-1 bg-sky-500/60'
                    } transition-all`}
                  />
                </button>
              )
            })}
          </>
        )}
      </nav>
    </div>
  )
}
