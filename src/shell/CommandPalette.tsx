import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CornerDownLeft,
  FileText,
  Package,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { kernelClient } from '../kernel/kernelClient'
import { NATIVE_APPS, useOsStore } from '../state/osStore'
import { AppIcon } from './AppIcon'

interface PaletteItem {
  id: string
  category: 'Native App' | 'Installed WASM App' | 'System Action' | 'Linux File'
  title: string
  subtitle: string
  icon: string
  run: () => void
}

export const CommandPalette: React.FC = () => {
  const isOpen = useOsStore((s) => s.commandPaletteOpen)
  const setOpen = useOsStore((s) => s.setCommandPaletteOpen)
  const installedPackages = useOsStore((s) => s.installedPackages)
  const openApp = useOsStore((s) => s.openApp)
  const setActiveWorkspace = useOsStore((s) => s.setActiveWorkspace)
  const performanceMode = useOsStore((s) => s.settings.performanceMode)
  const updateSettings = useOsStore((s) => s.updateSettings)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [userFiles, setUserFiles] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      void kernelClient.searchUserFiles().then(setUserFiles).catch(() => {})
    }
  }, [isOpen])

  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = []

    // 1. Native Apps
    for (const app of Object.values(NATIVE_APPS)) {
      items.push({
        id: `native-${app.id}`,
        category: 'Native App',
        title: app.name,
        subtitle: app.subtitle,
        icon: app.icon,
        run: () => openApp(app.id),
      })
    }

    // 2. Installed strataget WASM packages
    for (const pkg of installedPackages) {
      items.push({
        id: `wasm-${pkg.id}`,
        category: 'Installed WASM App',
        title: `${pkg.name} (v${pkg.version})`,
        subtitle: `${pkg.installPath}/${pkg.entry} • ${pkg.type}`,
        icon: pkg.icon,
        run: () => {
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
      })
    }

    // 3. System Actions
    items.push(
      {
        id: 'act-strataget-update',
        category: 'System Action',
        title: 'Run strataget update in Terminal',
        subtitle: 'Refresh package index from /etc/strata/registry.json',
        icon: 'RefreshCw',
        run: () => {
          openApp('terminal')
          setTimeout(() => kernelClient.sendCommandToTerminal('strataget update'), 120)
        },
      },
      {
        id: 'act-inspect-apps-dir',
        category: 'System Action',
        title: 'Inspect /opt/strata/apps in Strata Files',
        subtitle: 'Browse installed WebAssembly application binaries',
        icon: 'FolderTree',
        run: () => openApp('files', { filePath: '/opt/strata/apps' }),
      },
      {
        id: 'act-perf-mode',
        category: 'System Action',
        title: `Toggle Performance Mode (${performanceMode ? 'Currently ON' : 'Currently OFF'})`,
        subtitle: 'Disable backdrop-filter blur across all windows for lower-end GPUs',
        icon: 'Sliders',
        run: () => updateSettings({ performanceMode: !performanceMode }),
      },
      {
        id: 'act-sync-disk',
        category: 'System Action',
        title: 'Flush & Sync ext4 Persistent Disk',
        subtitle: 'Commit dirty ext4 blocks to IndexedDB kwdisk:kwdata-v1',
        icon: 'HardDrive',
        run: () => {
          void kernelClient.syncDisk()
        },
      },
      {
        id: 'act-ws-1',
        category: 'System Action',
        title: 'Switch to Workspace 1',
        subtitle: 'Desktop Workspace 1 (Alt+1)',
        icon: 'Box',
        run: () => setActiveWorkspace(1),
      },
      {
        id: 'act-ws-2',
        category: 'System Action',
        title: 'Switch to Workspace 2',
        subtitle: 'Desktop Workspace 2 (Alt+2)',
        icon: 'Box',
        run: () => setActiveWorkspace(2),
      },
      {
        id: 'act-ws-3',
        category: 'System Action',
        title: 'Switch to Workspace 3',
        subtitle: 'Desktop Workspace 3 (Alt+3)',
        icon: 'Box',
        run: () => setActiveWorkspace(3),
      }
    )

    // 4. Linux Files in /root, /home, /etc/strata, /opt/strata/apps
    for (const filePath of userFiles) {
      const fileName = filePath.split('/').pop() ?? filePath
      items.push({
        id: `file-${filePath}`,
        category: 'Linux File',
        title: fileName,
        subtitle: filePath,
        icon: filePath.endsWith('.wasm') ? 'Binary' : 'FileText',
        run: () => {
          if (filePath.endsWith('.wasm') && installedPackages.some((p) => p.id === 'hexforge')) {
            openApp('wasm:hexforge', { filePath })
          } else {
            openApp('code', { filePath })
          }
        },
      })
    }

    return items
  }, [installedPackages, openApp, performanceMode, updateSettings, setActiveWorkspace, userFiles])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    )
  }, [allItems, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 48,
    overscan: 8,
  })

  if (!isOpen) return null

  const executeItem = (item?: PaletteItem) => {
    if (!item) return
    setOpen(false)
    item.run()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        filteredItems.length > 0
          ? (prev - 1 + filteredItems.length) % filteredItems.length
          : 0
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executeItem(filteredItems[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[9500] flex items-start justify-center bg-black/60 pt-20 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className={`w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.9)] ${
          performanceMode ? 'bg-zinc-950' : 'bg-zinc-950/95 backdrop-blur-2xl'
        }`}
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search className="h-4 w-4 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Fuzzy search apps, strataget packages, actions, or files in /home & /root..."
            className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Virtualized Results List */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No matching apps, packages, or Linux files found.
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = filteredItems[virtualRow.index]
                const isSelected = virtualRow.index === selectedIndex

                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      onMouseEnter={() => setSelectedIndex(virtualRow.index)}
                      onClick={() => executeItem(item)}
                      className={`flex h-full cursor-pointer items-center justify-between rounded-lg px-3 transition ${
                        isSelected
                          ? 'bg-cyan-500/20 text-zinc-100 border border-cyan-500/35'
                          : 'text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 border border-white/10 text-cyan-300">
                          <AppIcon name={item.icon} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">{item.title}</div>
                          <div className="truncate font-mono text-[10px] text-zinc-400">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-white/5">
                          {item.category === 'Installed WASM App' ? (
                            <Package className="h-2.5 w-2.5 text-emerald-400" />
                          ) : item.category === 'Linux File' ? (
                            <FileText className="h-2.5 w-2.5 text-cyan-400" />
                          ) : item.category === 'System Action' ? (
                            <Wrench className="h-2.5 w-2.5 text-amber-400" />
                          ) : (
                            <Sparkles className="h-2.5 w-2.5 text-cyan-400" />
                          )}
                          {item.category}
                        </span>
                        {isSelected && (
                          <CornerDownLeft className="h-3.5 w-3.5 text-cyan-300" />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
