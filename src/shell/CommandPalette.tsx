import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Calculator,
  CornerDownLeft,
  Download,
  FileText,
  Package,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { kernelClient } from '../kernel/kernelClient'
import type { PackageManifest } from '../kernel/types'
import { NATIVE_APPS, PANEL_HEIGHT, PANEL_MARGIN, useOsStore } from '../state/osStore'
import { copyTextToClipboard } from '../utils/clipboard'
import { AppIcon } from './AppIcon'

interface PaletteItem {
  id: string
  category:
    | 'Calculator'
    | 'Native App'
    | 'Installed WASM App'
    | 'strataget Package'
    | 'System Action'
    | 'Linux File'
  title: string
  subtitle: string
  icon: string
  run: () => void
}

/**
 * Safe shunting-yard arithmetic evaluator (no eval/Function).
 * Supports +, -, *, /, %, ^, unary minus, decimals, and parentheses.
 * Returns null unless the input contains at least one operator and parses cleanly.
 */
function evaluateSafeMath(expr: string): string | null {
  const cleaned = expr.trim()
  if (!cleaned || !/^[0-9.+\-*/%^()\s]+$/.test(cleaned)) return null
  if (!/[+\-*/%^]/.test(cleaned)) return null

  const tokens: string[] = []
  let i = 0
  while (i < cleaned.length) {
    const ch = cleaned[i]
    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let num = ''
      let dots = 0
      while (i < cleaned.length && /[0-9.]/.test(cleaned[i])) {
        if (cleaned[i] === '.') dots++
        if (dots > 1) return null
        num += cleaned[i++]
      }
      if (num === '.') return null
      tokens.push(num)
      continue
    }
    if ('+-*/%^()'.includes(ch)) {
      const prev = tokens[tokens.length - 1]
      if (ch === '-' && (!prev || '+-*/%^('.includes(prev))) {
        tokens.push('u-')
      } else {
        tokens.push(ch)
      }
      i++
      continue
    }
    return null
  }

  const prec: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    '%': 2,
    '^': 3,
    'u-': 4,
  }
  const rightAssoc = new Set(['^', 'u-'])

  const output: string[] = []
  const ops: string[] = []

  for (const tok of tokens) {
    if (!isNaN(Number(tok))) {
      output.push(tok)
    } else if (tok === '(') {
      ops.push(tok)
    } else if (tok === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        output.push(ops.pop()!)
      }
      if (ops.pop() !== '(') return null
    } else if (tok in prec) {
      while (
        ops.length &&
        ops[ops.length - 1] !== '(' &&
        (prec[ops[ops.length - 1]] > prec[tok] ||
          (prec[ops[ops.length - 1]] === prec[tok] && !rightAssoc.has(tok)))
      ) {
        output.push(ops.pop()!)
      }
      ops.push(tok)
    } else {
      return null
    }
  }

  while (ops.length) {
    const op = ops.pop()!
    if (op === '(' || op === ')') return null
    output.push(op)
  }

  const stack: number[] = []
  for (const tok of output) {
    if (!isNaN(Number(tok))) {
      stack.push(Number(tok))
    } else if (tok === 'u-') {
      if (stack.length < 1) return null
      stack.push(-stack.pop()!)
    } else {
      if (stack.length < 2) return null
      const b = stack.pop()!
      const a = stack.pop()!
      let res: number
      if (tok === '+') res = a + b
      else if (tok === '-') res = a - b
      else if (tok === '*') res = a * b
      else if (tok === '/') {
        if (b === 0) return null
        res = a / b
      } else if (tok === '%') {
        if (b === 0) return null
        res = a % b
      } else if (tok === '^') {
        res = Math.pow(a, b)
      } else {
        return null
      }
      if (!Number.isFinite(res)) return null
      stack.push(res)
    }
  }

  if (stack.length !== 1) return null
  const val = stack[0]
  return Number.isInteger(val) ? String(val) : String(Number(val.toFixed(8)))
}

export const CommandPalette: React.FC = () => {
  const isOpen = useOsStore((s) => s.commandPaletteOpen)
  const setOpen = useOsStore((s) => s.setCommandPaletteOpen)
  const installedPackages = useOsStore((s) => s.installedPackages)
  const openApp = useOsStore((s) => s.openApp)
  const setActiveWorkspace = useOsStore((s) => s.setActiveWorkspace)
  const setBootPhase = useOsStore((s) => s.setBootPhase)
  const setEditMode = useOsStore((s) => s.setEditMode)
  const setMissionControlOpen = useOsStore((s) => s.setMissionControlOpen)
  const settings = useOsStore((s) => s.settings)
  const updateSettings = useOsStore((s) => s.updateSettings)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [userFiles, setUserFiles] = useState<string[]>([])
  const [catalog, setCatalog] = useState<PackageManifest[]>([])

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
      void kernelClient.getRegistryCatalog().then(setCatalog).catch(() => {})
    }
  }, [isOpen])

  const installedIds = useMemo(
    () => new Set(installedPackages.map((p) => p.id)),
    [installedPackages]
  )

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

    // 3. Available strataget Registry Packages (installable directly from KRunner)
    for (const pkg of catalog) {
      if (installedIds.has(pkg.id)) continue
      items.push({
        id: `reg-${pkg.id}`,
        category: 'strataget Package',
        title: `strataget install ${pkg.id} (${pkg.name})`,
        subtitle: `${pkg.category} • v${pkg.version} • ${pkg.description}`,
        icon: pkg.icon,
        run: () => {
          toast.info(`Installing ${pkg.name} via strataget...`)
          void kernelClient
            .installPackage(pkg.id)
            .then((rec) => {
              toast.success(`Installed ${rec.name} v${rec.version}`)
              if (rec.type === 'wasm-gui') {
                openApp(`wasm:${rec.id}`, { title: `${rec.name} v${rec.version}`, icon: rec.icon })
              }
            })
            .catch((err: unknown) => {
              toast.error(`strataget install failed: ${err instanceof Error ? err.message : String(err)}`)
            })
        },
      })
    }

    // 4. System Actions
    items.push(
      {
        id: 'act-edit-mode',
        category: 'System Action',
        title: 'Enter Desktop Edit Mode (Add Plasmoids)',
        subtitle: 'Add draggable System Monitor, Clock, Sticky Note, or Quick Launch widgets',
        icon: 'Sliders',
        run: () => setEditMode(true),
      },
      {
        id: 'act-overview',
        category: 'System Action',
        title: 'Open Plasma Overview & Virtual Desktops',
        subtitle: 'Inspect all windows across Virtual Desktops 1–3 (Ctrl+Up / Alt+Tab)',
        icon: 'Layout',
        run: () => setMissionControlOpen(true),
      },
      {
        id: 'act-theme-toggle',
        category: 'System Action',
        title: `Switch to ${settings.theme === 'light' ? 'Breeze Dark' : 'Breeze Light'} Theme`,
        subtitle: 'Toggle KDE Plasma Breeze Dark / Breeze Light appearance',
        icon: 'Palette',
        run: () => updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' }),
      },
      {
        id: 'act-uefi',
        category: 'System Action',
        title: 'Reboot into StrataUEFI Firmware Setup',
        subtitle: 'Configure boot priority, Secure Boot, and UEFI interactive shell',
        icon: 'Shield',
        run: () => setBootPhase('uefi-setup'),
      },
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
        title: `Toggle Performance Mode (${settings.performanceMode ? 'Currently ON' : 'Currently OFF'})`,
        subtitle: 'Disable backdrop-filter blur on Plasma Panel and KRunner',
        icon: 'Sliders',
        run: () => updateSettings({ performanceMode: !settings.performanceMode }),
      },
      {
        id: 'act-sync-disk',
        category: 'System Action',
        title: 'Flush & Sync ext4 Persistent Disk',
        subtitle: 'Commit dirty ext4 blocks to IndexedDB kwdisk:kwdata-v1',
        icon: 'HardDrive',
        run: () => {
          void kernelClient.syncDisk().then(() => toast.success('ext4 disk synced to IndexedDB'))
        },
      },
      {
        id: 'act-ws-1',
        category: 'System Action',
        title: 'Switch to Virtual Desktop 1',
        subtitle: 'Virtual Desktop 1 (Alt+1)',
        icon: 'Box',
        run: () => setActiveWorkspace(1),
      },
      {
        id: 'act-ws-2',
        category: 'System Action',
        title: 'Switch to Virtual Desktop 2',
        subtitle: 'Virtual Desktop 2 (Alt+2)',
        icon: 'Box',
        run: () => setActiveWorkspace(2),
      },
      {
        id: 'act-ws-3',
        category: 'System Action',
        title: 'Switch to Virtual Desktop 3',
        subtitle: 'Virtual Desktop 3 (Alt+3)',
        icon: 'Box',
        run: () => setActiveWorkspace(3),
      }
    )

    // 5. Linux Files in /root, /home, /etc/strata, /opt/strata/apps
    for (const filePath of userFiles) {
      const fileName = filePath.split('/').pop() ?? filePath
      items.push({
        id: `file-${filePath}`,
        category: 'Linux File',
        title: fileName,
        subtitle: filePath,
        icon: filePath.endsWith('.wasm') ? 'Binary' : 'FileText',
        run: () => {
          if (filePath.endsWith('.wasm') && installedIds.has('hexforge')) {
            openApp('wasm:hexforge', { filePath })
          } else {
            openApp('code', { filePath })
          }
        },
      })
    }

    return items
  }, [
    installedPackages,
    catalog,
    installedIds,
    openApp,
    settings.performanceMode,
    settings.theme,
    updateSettings,
    setActiveWorkspace,
    setBootPhase,
    setEditMode,
    setMissionControlOpen,
    userFiles,
  ])

  const filteredItems = useMemo(() => {
    const q = query.trim()
    const mathAnswer = evaluateSafeMath(q)
    const mathItem: PaletteItem | null = mathAnswer
      ? {
          id: `math-${q}`,
          category: 'Calculator',
          title: `= ${mathAnswer}`,
          subtitle: `${q}  •  Press Enter to copy result`,
          icon: 'Cpu',
          run: () => {
            void copyTextToClipboard(mathAnswer).then((ok) => {
              if (ok) toast.success(`Copied ${mathAnswer} to clipboard`)
            })
          },
        }
      : null

    if (!q) return allItems
    const ql = q.toLowerCase()
    const matches = allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(ql) ||
        item.subtitle.toLowerCase().includes(ql) ||
        item.category.toLowerCase().includes(ql)
    )
    return mathItem ? [mathItem, ...matches] : matches
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

  const topOffset =
    settings.panelPosition === 'top' ? PANEL_HEIGHT + PANEL_MARGIN * 2 + 8 : 14

  return (
    <div
      id="plasma-krunner-backdrop"
      onClick={() => setOpen(false)}
      style={{ paddingTop: `${topOffset}px` }}
      className="fixed inset-0 z-[9500] flex items-start justify-center bg-black/35 px-3 select-none"
    >
      <div
        id="plasma-krunner"
        role="dialog"
        aria-label="KRunner Command & Search Bar"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className={`w-full max-w-[600px] overflow-hidden rounded-xl border border-[var(--breeze-border-strong)] shadow-[0_22px_70px_rgba(0,0,0,0.65)] ${
          settings.performanceMode ? 'plasma-panel-solid' : 'plasma-panel-blur'
        }`}
      >
        {/* Top-Center KRunner Input Bar */}
        <div className="flex items-center gap-3 border-b border-[var(--breeze-border)] bg-[var(--breeze-header)]/80 px-4 py-3">
          <Search className="h-4 w-4 plasma-accent-text shrink-0" aria-hidden="true" />
          <input
            id="krunner-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="KRunner — launch apps, search /root, strataget packages, or type math (256 * 12)..."
            className="w-full bg-transparent text-xs text-[var(--breeze-text)] placeholder:text-[var(--breeze-text-muted)] focus:outline-none"
          />
          <kbd className="rounded border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--breeze-text-muted)]">
            ESC
          </kbd>
        </div>

        {/* Virtualized KRunner Results */}
        <div ref={listRef} className="max-h-[min(360px,calc(100vh-140px))] overflow-y-auto p-1.5">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--breeze-text-muted)]">
              No matching apps, strataget packages, files, or math expression.
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
                          ? 'border border-[var(--plasma-accent)] bg-[var(--breeze-hover)] text-[var(--breeze-text)]'
                          : 'text-[var(--breeze-text)]/85 hover:bg-[var(--breeze-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--breeze-border)] ${
                            item.category === 'Calculator'
                              ? 'plasma-accent-fill'
                              : 'bg-[var(--breeze-base)] plasma-accent-text'
                          }`}
                        >
                          {item.category === 'Calculator' ? (
                            <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <AppIcon name={item.icon} className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div
                            className={`truncate text-xs ${
                              item.category === 'Calculator'
                                ? 'font-mono font-bold plasma-accent-text'
                                : 'font-medium'
                            }`}
                          >
                            {item.title}
                          </div>
                          <div className="truncate font-mono text-[10px] text-[var(--breeze-text-muted)]">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="inline-flex items-center gap-1 rounded border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--breeze-text-muted)]">
                          {item.category === 'Calculator' ? (
                            <Calculator className="h-2.5 w-2.5 plasma-accent-text" />
                          ) : item.category === 'Installed WASM App' ? (
                            <Package className="h-2.5 w-2.5 text-emerald-400" />
                          ) : item.category === 'strataget Package' ? (
                            <Download className="h-2.5 w-2.5 plasma-accent-text" />
                          ) : item.category === 'Linux File' ? (
                            <FileText className="h-2.5 w-2.5 plasma-accent-text" />
                          ) : item.category === 'System Action' ? (
                            <Wrench className="h-2.5 w-2.5 text-amber-400" />
                          ) : (
                            <Sparkles className="h-2.5 w-2.5 plasma-accent-text" />
                          )}
                          {item.category}
                        </span>
                        {isSelected && (
                          <CornerDownLeft className="h-3.5 w-3.5 plasma-accent-text" />
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
