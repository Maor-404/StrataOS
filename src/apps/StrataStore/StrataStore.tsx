import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Package,
  RefreshCw,
  Search,
  Shield,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'
import type {
  InstalledPackageRecord,
  PackageManifest,
  StratagetProgressEvent,
} from '../../kernel/types'
import { AppIcon } from '../../shell/AppIcon'
import { useOsStore } from '../../state/osStore'

type StoreCategoryTab =
  | 'Featured'
  | 'Developer Tools'
  | 'WASM Utilities'
  | 'CLI / WASI'
  | 'Games & Demos'
  | 'Installed'

const CATEGORY_TABS: StoreCategoryTab[] = [
  'Featured',
  'Developer Tools',
  'WASM Utilities',
  'CLI / WASI',
  'Games & Demos',
  'Installed',
]

export const StrataStore: React.FC = () => {
  const installedPackages = useOsStore((s) => s.installedPackages)
  const openApp = useOsStore((s) => s.openApp)

  const [catalog, setCatalog] = useState<PackageManifest[]>([])
  const [activeTab, setActiveTab] = useState<StoreCategoryTab>('Featured')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPkgId, setSelectedPkgId] = useState<string>('hexforge')
  const [refreshing, setRefreshing] = useState(false)
  const [progressMap, setProgressMap] = useState<Record<string, StratagetProgressEvent>>({})
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({})
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const [sideloadOpen, setSideloadOpen] = useState(false)

  // Sideload state
  const [sideloadManifestText, setSideloadManifestText] = useState(
    JSON.stringify(
      {
        id: 'custom-bench',
        name: 'CustomWASM Bench',
        version: '1.0.0',
        author: 'Local Developer',
        category: 'WASM Utilities',
        type: 'wasm-gui',
        entry: 'custom.wasm',
        icon: 'Cpu',
        description: 'Sideloaded custom WebAssembly module running inside StrataOS.',
        permissions: ['fs:read', 'canvas'],
      },
      null,
      2
    )
  )
  const [sideloadWasmFile, setSideloadWasmFile] = useState<{
    name: string
    bytes: Uint8Array
  } | null>(null)

  const loadCatalog = useCallback(async () => {
    try {
      const list = await kernelClient.getRegistryCatalog()
      setCatalog(list)
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const installedMap = useMemo(() => {
    const map: Record<string, InstalledPackageRecord> = {}
    for (const p of installedPackages) {
      map[p.id] = p
    }
    return map
  }, [installedPackages])

  // Merge catalog + any sideloaded installed apps
  const mergedCatalog = useMemo(() => {
    const byId = new Map<string, PackageManifest>()
    for (const pkg of catalog) {
      byId.set(pkg.id, pkg)
    }
    for (const inst of installedPackages) {
      if (!byId.has(inst.id)) {
        byId.set(inst.id, {
          id: inst.id,
          name: inst.name,
          version: inst.version,
          author: inst.author,
          category: inst.category,
          type: inst.type,
          entry: inst.entry,
          icon: inst.icon,
          sizeBytes: inst.sizeBytes,
          description: inst.description,
          permissions: inst.permissions,
          featured: false,
        })
      }
    }
    return Array.from(byId.values())
  }, [catalog, installedPackages])

  const filteredPackages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return mergedCatalog.filter((pkg) => {
      if (activeTab === 'Installed' && !installedMap[pkg.id]) return false
      if (activeTab === 'Featured' && !pkg.featured && !installedMap[pkg.id]) {
        // In Featured tab, show featured + installed or all if searching
        if (!q && !pkg.featured) return false
      } else if (
        activeTab !== 'Featured' &&
        activeTab !== 'Installed' &&
        pkg.category !== activeTab
      ) {
        return false
      }

      if (!q) return true
      return (
        pkg.id.toLowerCase().includes(q) ||
        pkg.name.toLowerCase().includes(q) ||
        pkg.description.toLowerCase().includes(q) ||
        pkg.category.toLowerCase().includes(q) ||
        (pkg.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [mergedCatalog, activeTab, searchQuery, installedMap])

  const selectedPackage = useMemo(() => {
    return (
      mergedCatalog.find((p) => p.id === selectedPkgId) ??
      filteredPackages[0] ??
      mergedCatalog[0] ??
      null
    )
  }, [mergedCatalog, selectedPkgId, filteredPackages])

  // Virtualized catalog list
  const listParentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: filteredPackages.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 82,
    overscan: 6,
  })

  const handleUpdateRegistry = async () => {
    setRefreshing(true)
    setErrorBanner(null)
    try {
      const idx = await kernelClient.updateRegistryIndex()
      setCatalog(idx.packages)
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  const handleInstall = async (pkg: PackageManifest) => {
    setBusyMap((prev) => ({ ...prev, [pkg.id]: true }))
    setErrorBanner(null)
    try {
      await kernelClient.installPackage(pkg.id, (ev) => {
        setProgressMap((prev) => ({ ...prev, [pkg.id]: ev }))
      })
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyMap((prev) => ({ ...prev, [pkg.id]: false }))
      setTimeout(() => {
        setProgressMap((prev) => {
          const next = { ...prev }
          delete next[pkg.id]
          return next
        })
      }, 1500)
    }
  }

  const handleRemove = async (pkgId: string) => {
    setBusyMap((prev) => ({ ...prev, [pkgId]: true }))
    setErrorBanner(null)
    try {
      await kernelClient.removePackage(pkgId)
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyMap((prev) => ({ ...prev, [pkgId]: false }))
    }
  }

  const handleLaunch = (pkg: PackageManifest) => {
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
  }

  const handleDropFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      if (file.name.endsWith('.json')) {
        const text = await file.text()
        setSideloadManifestText(text)
      } else if (file.name.endsWith('.wasm')) {
        const ab = await file.arrayBuffer()
        setSideloadWasmFile({ name: file.name, bytes: new Uint8Array(ab) })
      }
    }
  }

  const handleSideloadInstall = async () => {
    setErrorBanner(null)
    try {
      let wasmBytes = sideloadWasmFile?.bytes
      if (!wasmBytes) {
        // Generate a minimal valid WebAssembly module exporting add(a, b) -> a + b if user didn't pick a local .wasm
        wasmBytes = new Uint8Array([
          0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
          0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
          0x03, 0x02, 0x01, 0x00,
          0x05, 0x03, 0x01, 0x00, 0x01,
          0x07, 0x11, 0x02, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
          0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
        ])
      }
      const record = await kernelClient.sideloadPackage(sideloadManifestText, wasmBytes)
      setSideloadOpen(false)
      setSelectedPkgId(record.id)
      setActiveTab('Installed')
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 select-none">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-900/70 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Strata Store</h2>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 border border-white/5">
                strataget synced
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Single source of truth: <span className="font-mono text-zinc-300">/etc/strata/installed.json</span> &{' '}
              <span className="font-mono text-zinc-300">/opt/strata/apps/</span>
            </p>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search WASM packages..."
              className="w-52 rounded-md border border-white/10 bg-zinc-950 pl-8 pr-3 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <button
            onClick={() => setSideloadOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-800/90 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            <Upload className="h-3.5 w-3.5 text-cyan-400" />
            Sideload .wasm
          </button>

          <button
            onClick={() => void handleUpdateRegistry()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
            title="Run strataget update"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Sync Index
          </button>

          <a
            id="store-submit-wasm-cta"
            href="https://github.com/Maor-404/StrataOS/issues/new?title=WASM%20App%20Submission%3A%20&body=App%20ID%3A%0ARepo%20URL%3A%0AWASM%20Entry%3A%0ACategory%3A%20(wasm-gui%20%7C%20wasm-cli)%0ADescription%3A"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Submit a WASM App
          </a>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/40 px-4 py-1.5 text-xs">
        <div className="flex items-center gap-1 overflow-x-auto">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab
            const count =
              tab === 'Installed'
                ? installedPackages.length
                : tab === 'Featured'
                ? mergedCatalog.filter((p) => p.featured).length
                : mergedCatalog.filter((p) => p.category === tab).length
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/35'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
              >
                <span>{tab}</span>
                <span className="rounded bg-black/40 px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => openApp('files', { filePath: '/opt/strata/apps' })}
          className="hidden lg:inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 hover:text-cyan-300"
        >
          <FolderOpen className="h-3.5 w-3.5" /> Inspect /opt/strata/apps
        </button>
      </div>

      {errorBanner && (
        <div className="border-b border-red-500/30 bg-red-950/30 px-4 py-1.5 font-mono text-xs text-red-300">
          {errorBanner}
        </div>
      )}

      {/* Sideload Dropzone Drawer */}
      {sideloadOpen && (
        <div className="border-b border-cyan-500/30 bg-zinc-900/95 p-4 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold text-cyan-300">
              Sideload Community .wasm Binary + manifest.json into /opt/strata/apps/
            </div>
            <button
              onClick={() => setSideloadOpen(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void handleDropFiles(e.dataTransfer.files)
              }}
              className="flex flex-col items-center justify-center rounded-lg border border-dashed border-cyan-500/40 bg-zinc-950/70 p-4 text-center"
            >
              <Upload className="mb-2 h-6 w-6 text-cyan-400" />
              <div className="font-medium text-zinc-200">
                Drag & drop <span className="font-mono text-cyan-300">.wasm</span> and{' '}
                <span className="font-mono text-cyan-300">manifest.json</span> here
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                {sideloadWasmFile
                  ? `Selected binary: ${sideloadWasmFile.name} (${sideloadWasmFile.bytes.byteLength} bytes)`
                  : 'Or use the pre-filled sample WASM module below to test sideloading immediately.'}
              </p>
              <label className="mt-2 cursor-pointer rounded bg-zinc-800 px-3 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700">
                Browse Host Files
                <input
                  type="file"
                  multiple
                  accept=".wasm,.json"
                  className="hidden"
                  onChange={(e) => void handleDropFiles(e.target.files)}
                />
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <textarea
                value={sideloadManifestText}
                onChange={(e) => setSideloadManifestText(e.target.value)}
                rows={6}
                className="w-full rounded border border-white/10 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-200 focus:outline-none select-text"
              />
              <button
                onClick={() => void handleSideloadInstall()}
                className="self-end rounded bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
              >
                Install Sideloaded Package to /opt/strata/apps
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Split View: Virtualized Package List + Detailed Package Inspector */}
      <div className="grid flex-1 grid-cols-12 divide-x divide-white/10 overflow-hidden">
        {/* Left: Virtualized Catalog List */}
        <div
          ref={listParentRef}
          className="col-span-5 h-full overflow-y-auto bg-zinc-950/60 p-2"
        >
          {filteredPackages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-zinc-500">
              No packages found in this category.
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
                const pkg = filteredPackages[virtualRow.index]
                const isSelected = selectedPackage?.id === pkg.id
                const isInstalled = Boolean(installedMap[pkg.id])
                const prog = progressMap[pkg.id]

                return (
                  <div
                    key={pkg.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="p-1"
                  >
                    <div
                      onClick={() => setSelectedPkgId(pkg.id)}
                      className={`flex h-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition ${
                        isSelected
                          ? 'border-cyan-500/40 bg-zinc-900'
                          : 'border-white/5 bg-zinc-900/40 hover:bg-zinc-900/80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                            isInstalled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-white/10 bg-zinc-800/80 text-cyan-300'
                          }`}
                        >
                          <AppIcon name={pkg.icon} className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-zinc-100">
                              {pkg.name}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-400">
                              v{pkg.version}
                            </span>
                          </div>
                          <div className="truncate text-[11px] text-zinc-400">
                            {pkg.category} •{' '}
                            <span className="font-mono text-[10px] text-zinc-500">{pkg.type}</span>
                          </div>
                          {prog && (
                            <div className="mt-1 h-1 w-32 overflow-hidden rounded bg-zinc-800">
                              <div
                                className="h-full bg-cyan-400 transition-all"
                                style={{ width: `${prog.percent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 ml-2">
                        {isInstalled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> Installed
                          </span>
                        ) : (
                          <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                            {((pkg.sizeBytes ?? 16384) / 1024).toFixed(1)} KB
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Detailed Package View */}
        <div className="col-span-7 flex h-full flex-col overflow-y-auto p-5 bg-zinc-950">
          {selectedPackage ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                    <AppIcon name={selectedPackage.icon} className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-zinc-100">
                        {selectedPackage.name}
                      </h3>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-cyan-300 border border-white/10">
                        v{selectedPackage.version}
                      </span>
                      <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400 border border-white/10">
                        {selectedPackage.type}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-400">
                      By <span className="text-zinc-200">{selectedPackage.author}</span> •{' '}
                      {selectedPackage.category}
                    </div>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2">
                  {installedMap[selectedPackage.id] ? (
                    <>
                      <button
                        onClick={() => handleLaunch(selectedPackage)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 transition"
                      >
                        {selectedPackage.type === 'wasm-cli' ? (
                          <>
                            <Terminal className="h-3.5 w-3.5" /> Run in Terminal
                          </>
                        ) : (
                          <>
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => void handleRemove(selectedPackage.id)}
                        disabled={busyMap[selectedPackage.id]}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Uninstall
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => void handleInstall(selectedPackage)}
                      disabled={busyMap[selectedPackage.id]}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50 transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {busyMap[selectedPackage.id] ? 'Installing...' : 'Install Package'}
                    </button>
                  )}
                </div>
              </div>

              {/* Live Installation Progress Indicator */}
              {progressMap[selectedPackage.id] && (
                <div className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs">
                  <div className="mb-1.5 flex items-center justify-between font-mono">
                    <span className="text-cyan-300">
                      {progressMap[selectedPackage.id].message}
                    </span>
                    <span className="font-bold text-cyan-200">
                      {progressMap[selectedPackage.id].percent}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-150"
                      style={{ width: `${progressMap[selectedPackage.id].percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Overview
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
                  {selectedPackage.description}
                </p>
              </div>

              {/* CLI Equivalence Box */}
              <div className="mt-4 rounded-lg border border-white/10 bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="font-semibold uppercase tracking-wider text-zinc-500">
                    CLI Package Manager Equivalent
                  </span>
                  <span className="font-mono text-[10px] text-cyan-400">/usr/local/bin/strataget</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between rounded bg-zinc-950 px-3 py-2 font-mono text-xs text-cyan-300 border border-white/5">
                  <span>
                    $ strataget {installedMap[selectedPackage.id] ? 'run' : 'install'}{' '}
                    {selectedPackage.id}
                  </span>
                  <button
                    onClick={() => {
                      openApp('terminal')
                      setTimeout(() => {
                        const cmd = installedMap[selectedPackage.id]
                          ? `strataget run ${selectedPackage.id}`
                          : `strataget install ${selectedPackage.id}`
                        kernelClient.sendCommandToTerminal(cmd)
                      }, 120)
                    }}
                    className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-700"
                  >
                    Execute in Terminal
                  </button>
                </div>
              </div>

              {/* Permissions & Filesystem Metadata */}
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-white/10 bg-zinc-900/40 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <Shield className="h-3.5 w-3.5 text-emerald-400" /> Sandbox Permissions
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPackage.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-emerald-300 border border-white/5"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-zinc-900/40 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <HardDrive className="h-3.5 w-3.5 text-cyan-400" /> Linux Filesystem Layout
                  </div>
                  <div className="space-y-1 font-mono text-[11px] text-zinc-300">
                    <div className="truncate">
                      <span className="text-zinc-500">Dir:</span> /opt/strata/apps/{selectedPackage.id}/
                    </div>
                    <div className="truncate">
                      <span className="text-zinc-500">Entry:</span> {selectedPackage.entry} (
                      {selectedPackage.sizeBytes ?? 512} B)
                    </div>
                    <div className="truncate">
                      <span className="text-zinc-500">Bin:</span> /usr/local/bin/{selectedPackage.id}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
