import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowUp,
  ChevronRight,
  Code2,
  Download,
  Edit3,
  File,
  FileCode,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  Monitor,
  RefreshCw,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'
import type { FsEntry } from '../../kernel/types'
import { useOsStore } from '../../state/osStore'

export interface StrataFilesProps {
  initialPath?: string
}

const TRASH_DIR = '/root/.local/share/Trash'

const SYSTEM_BOOKMARKS = [
  { label: 'WASM Apps', path: '/opt/strata/apps' },
  { label: 'Strata Config', path: '/etc/strata' },
  { label: 'Local Binaries', path: '/usr/local/bin' },
  { label: 'ext4 /data', path: '/data' },
  { label: 'Filesystem /', path: '/' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const StrataFiles: React.FC<StrataFilesProps> = ({ initialPath }) => {
  const openApp = useOsStore((s) => s.openApp)
  const installedPackages = useOsStore((s) => s.installedPackages)

  const [currentDir, setCurrentDir] = useState(initialPath ?? '/root')
  const [editingPath, setEditingPath] = useState(false)
  const [pathDraft, setPathDraft] = useState(initialPath ?? '/root')
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Synced with Debian ext4 filesystem')
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [newPromptType, setNewPromptType] = useState<'file' | 'dir' | null>(null)
  const [newPromptName, setNewPromptName] = useState('')

  const loadDirectory = useCallback(async (dirPath: string) => {
    const clean = dirPath.trim() || '/'
    setLoading(true)
    try {
      const list = await kernelClient.listDirectory(clean)
      setEntries(list)
      setCurrentDir(clean)
      setPathDraft(clean)
      setEditingPath(false)
      setSelectedPath(null)
      setStatusMsg(`${list.length} items in ${clean}`)
    } catch (err) {
      setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialPath) {
      void loadDirectory(initialPath)
    } else {
      void loadDirectory(currentDir)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPath])

  // Two-way live sync when files or packages change in Terminal or Store
  useEffect(() => {
    const unsubFs = kernelClient.subscribeFs(() => {
      void loadDirectory(currentDir)
    })
    const unsubPkg = kernelClient.subscribePackages(() => {
      void loadDirectory(currentDir)
    })
    return () => {
      unsubFs()
      unsubPkg()
    }
  }, [currentDir, loadDirectory])

  const breadcrumbs = useMemo(() => {
    const normalized = currentDir === '/' ? '/' : currentDir.replace(/\/+$/, '')
    if (normalized === '/') return [{ label: '/', path: '/' }]
    const parts = normalized.split('/').filter(Boolean)
    const list = [{ label: '/', path: '/' }]
    let acc = ''
    for (const part of parts) {
      acc += `/${part}`
      list.push({ label: part, path: acc })
    }
    return list
  }, [currentDir])

  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 10,
  })

  const navigateUp = () => {
    if (currentDir === '/') return
    const lastSlash = currentDir.lastIndexOf('/')
    const parent = lastSlash <= 0 ? '/' : currentDir.slice(0, lastSlash)
    void loadDirectory(parent)
  }

  const handleOpenEntry = (entry: FsEntry) => {
    if (entry.type === 'dir') {
      void loadDirectory(entry.path)
      return
    }
    const hasHexForge = installedPackages.some((p) => p.id === 'hexforge')
    const hasMarkView = installedPackages.some((p) => p.id === 'markview')
    const hasJsonLab = installedPackages.some((p) => p.id === 'jsonlab')

    if (entry.name.endsWith('.wasm') && hasHexForge) {
      openApp('wasm:hexforge', { filePath: entry.path })
      return
    }
    if (entry.name.endsWith('.md') && hasMarkView) {
      openApp('wasm:markview', { filePath: entry.path })
      return
    }
    if (entry.name.endsWith('.json') && hasJsonLab) {
      openApp('wasm:jsonlab', { filePath: entry.path })
      return
    }
    openApp('code', { filePath: entry.path })
  }

  const handleDownloadToHost = async (entry: FsEntry) => {
    if (entry.type === 'dir') return
    try {
      const bytes = await kernelClient.readFileBytes(entry.path)
      const blob = new Blob([bytes.slice().buffer], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = entry.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setStatusMsg(`Downloaded ${entry.name} (${bytes.byteLength} bytes) to host PC`)
    } catch (err) {
      setStatusMsg(`Download error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    for (const file of Array.from(fileList)) {
      const ab = await file.arrayBuffer()
      const targetPath =
        currentDir === '/' ? `/${file.name}` : `${currentDir}/${file.name}`
      await kernelClient.writeFileBytes(targetPath, new Uint8Array(ab))
      setStatusMsg(`Uploaded ${file.name} (${ab.byteLength} B) to ${targetPath}`)
    }
    await loadDirectory(currentDir)
  }

  const handleMountHostFolder = async () => {
    try {
      const winWithPicker = window as Window & {
        showDirectoryPicker?: () => Promise<{
          name: string
          values: () => AsyncIterable<{
            kind: 'file' | 'directory'
            name: string
            getFile?: () => Promise<File>
          }>
        }>
      }
      await kernelClient.createDirectory('/mnt/host')
      if (typeof winWithPicker.showDirectoryPicker === 'function') {
        const dirHandle = await winWithPicker.showDirectoryPicker()
        let count = 0
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file' && entry.getFile) {
            const file = await entry.getFile()
            if (file.size <= 4 * 1024 * 1024) {
              const ab = await file.arrayBuffer()
              await kernelClient.writeFileBytes(`/mnt/host/${entry.name}`, new Uint8Array(ab))
              count++
            }
          }
        }
        setStatusMsg(`Mounted host folder "${dirHandle.name}" (${count} files) at /mnt/host`)
        await loadDirectory('/mnt/host')
      } else {
        await kernelClient.writeFileText(
          '/mnt/host/HOST_MOUNT_README.txt',
          'File System Access API (window.showDirectoryPicker) mount point at /mnt/host.\nUse Upload or Chromium showDirectoryPicker to sync host files directly into Debian Linux.\n'
        )
        setStatusMsg('Initialized /mnt/host mount point')
        await loadDirectory('/mnt/host')
      }
    } catch (err) {
      setStatusMsg(`Host mount cancelled or unavailable: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleCreateSubmit = async () => {
    const clean = newPromptName.trim()
    if (!clean || !newPromptType) return
    const targetPath = currentDir === '/' ? `/${clean}` : `${currentDir}/${clean}`
    try {
      if (newPromptType === 'dir') {
        await kernelClient.createDirectory(targetPath)
      } else {
        await kernelClient.writeFileText(targetPath, '')
      }
      setNewPromptType(null)
      setNewPromptName('')
      await loadDirectory(currentDir)
    } catch (err) {
      setStatusMsg(`Create failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDeleteSelected = async () => {
    if (!selectedPath) return
    const name = selectedPath.split('/').pop() ?? 'item'
    try {
      if (currentDir === TRASH_DIR || selectedPath.startsWith(`${TRASH_DIR}/`)) {
        await kernelClient.deletePath(selectedPath)
        setStatusMsg(`Permanently deleted ${name}`)
      } else {
        await kernelClient.createDirectory(TRASH_DIR)
        await kernelClient.renamePath(selectedPath, `${TRASH_DIR}/${name}`)
        setStatusMsg(`Moved ${name} to Trash`)
      }
      await loadDirectory(currentDir)
    } catch (err) {
      setStatusMsg(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const selectedEntry = entries.find((e) => e.path === selectedPath) ?? null

  return (
    <div
      className="flex h-full flex-col bg-[var(--breeze-base)] text-[var(--breeze-text)] select-none"
      onDragOver={(e) => {
        e.preventDefault()
        setIsDraggingOver(true)
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDraggingOver(false)
        void handleUploadFiles(e.dataTransfer.files)
      }}
    >
      {/* PCManFM-Qt Top Breadcrumb & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--breeze-border)] bg-[var(--breeze-header)]/80 px-2.5 py-1.5 text-xs">
        <div className="flex items-center gap-1 flex-1 min-w-[240px]">
          <button
            type="button"
            onClick={navigateUp}
            disabled={currentDir === '/'}
            className="rounded border border-[var(--breeze-border)] bg-[var(--breeze-view)] p-1.5 text-[var(--breeze-text-muted)] hover:text-[var(--breeze-text)] disabled:opacity-40 cursor-pointer"
            title="Parent Directory"
            aria-label="Parent Directory"
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* Fast Path Breadcrumb Bar OR Inline Path Input */}
          {editingPath ? (
            <input
              type="text"
              autoFocus
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onBlur={() => setEditingPath(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadDirectory(pathDraft)
                if (e.key === 'Escape') {
                  setPathDraft(currentDir)
                  setEditingPath(false)
                }
              }}
              className="flex-1 rounded border border-[var(--plasma-accent)] bg-[var(--breeze-base)] px-2.5 py-1 font-mono text-xs text-[var(--breeze-text)] focus:outline-none"
            />
          ) : (
            <div
              aria-label="Path Breadcrumbs"
              className="flex flex-1 items-center gap-0.5 overflow-x-auto rounded border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-1.5 py-0.5 font-mono text-xs"
            >
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.path}>
                  {idx > 0 && (
                    <ChevronRight
                      className="h-3 w-3 shrink-0 text-[var(--breeze-text-muted)]"
                      aria-hidden="true"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void loadDirectory(crumb.path)}
                    className={`shrink-0 rounded px-1.5 py-0.5 transition duration-120 cursor-pointer ${
                      idx === breadcrumbs.length - 1
                        ? 'font-semibold plasma-accent-text bg-[var(--breeze-hover)]'
                        : 'text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)]'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPathDraft(currentDir)
                  setEditingPath(true)
                }}
                title="Edit path directly"
                aria-label="Edit path directly"
                className="ml-auto rounded p-1 text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
              >
                <Edit3 className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void loadDirectory(currentDir)}
            className="rounded border border-[var(--breeze-border)] bg-[var(--breeze-view)] p-1.5 text-[var(--breeze-text-muted)] hover:text-[var(--breeze-text)] cursor-pointer"
            title="Refresh Directory"
            aria-label="Refresh Directory"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin plasma-accent-text' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setNewPromptType('file')
              setNewPromptName('untitled.txt')
            }}
            className="inline-flex items-center gap-1 rounded border border-[var(--breeze-border)] bg-[var(--breeze-view)] px-2 py-1 text-xs hover:border-[var(--plasma-accent)] cursor-pointer"
          >
            <FilePlus className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" /> File
          </button>
          <button
            type="button"
            onClick={() => {
              setNewPromptType('dir')
              setNewPromptName('new-folder')
            }}
            className="inline-flex items-center gap-1 rounded border border-[var(--breeze-border)] bg-[var(--breeze-view)] px-2 py-1 text-xs hover:border-[var(--plasma-accent)] cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" /> Folder
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded plasma-accent-fill px-2.5 py-1 text-xs font-semibold hover:brightness-110">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Upload
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void handleUploadFiles(e.target.files)}
            />
          </label>
        </div>
      </div>

      {/* Inline New File / Folder Prompt */}
      {newPromptType && (
        <div className="flex items-center gap-2 border-b border-[var(--plasma-accent)] bg-[var(--breeze-view)] px-3 py-1.5 text-xs">
          <span className="plasma-accent-text font-medium">
            Create {newPromptType === 'dir' ? 'Directory' : 'File'} in {currentDir}:
          </span>
          <input
            type="text"
            autoFocus
            value={newPromptName}
            onChange={(e) => setNewPromptName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreateSubmit()}
            className="rounded border border-[var(--breeze-border-strong)] bg-[var(--breeze-base)] px-2 py-0.5 font-mono text-xs text-[var(--breeze-text)]"
          />
          <button
            type="button"
            onClick={() => void handleCreateSubmit()}
            className="rounded plasma-accent-fill px-2.5 py-0.5 text-xs font-semibold cursor-pointer"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setNewPromptType(null)}
            className="text-[var(--breeze-text-muted)] hover:text-[var(--breeze-text)] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Main Layout: Compact PCManFM-Qt Places Sidebar + Virtualized File Table */}
      <div className="grid flex-1 grid-cols-12 divide-x divide-[var(--breeze-border)] overflow-hidden">
        {/* Compact Places Sidebar */}
        <aside className="col-span-3 flex flex-col justify-between bg-[var(--breeze-view)]/70 p-2 text-xs overflow-y-auto">
          <div className="space-y-3">
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--breeze-text-muted)]">
                Places
              </div>

              <button
                type="button"
                onClick={() => void loadDirectory('/root')}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition duration-120 cursor-pointer ${
                  currentDir === '/root'
                    ? 'plasma-accent-fill font-semibold'
                    : 'hover:bg-[var(--breeze-hover)]'
                }`}
              >
                <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Home</span>
              </button>

              <button
                type="button"
                onClick={() => void loadDirectory('/root/Desktop')}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition duration-120 cursor-pointer ${
                  currentDir === '/root/Desktop'
                    ? 'plasma-accent-fill font-semibold'
                    : 'hover:bg-[var(--breeze-hover)]'
                }`}
              >
                <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Desktop</span>
              </button>

              <button
                type="button"
                onClick={() => void loadDirectory(TRASH_DIR)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition duration-120 cursor-pointer ${
                  currentDir === TRASH_DIR
                    ? 'plasma-accent-fill font-semibold'
                    : 'hover:bg-[var(--breeze-hover)]'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Trash</span>
              </button>

              <button
                type="button"
                onClick={() => void handleMountHostFolder()}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition duration-120 cursor-pointer ${
                  currentDir === '/mnt/host'
                    ? 'plasma-accent-fill font-semibold'
                    : 'hover:bg-[var(--breeze-hover)]'
                }`}
                title="Mount Host Folder into /mnt/host via File System Access API"
              >
                <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">Mount Host Folder</span>
              </button>
            </div>

            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--breeze-text-muted)]">
                Debian System
              </div>
              {SYSTEM_BOOKMARKS.map((bm) => {
                const active = currentDir === bm.path
                return (
                  <button
                    key={bm.path}
                    type="button"
                    onClick={() => void loadDirectory(bm.path)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition duration-120 cursor-pointer ${
                      active
                        ? 'border border-[var(--plasma-accent)] bg-[var(--breeze-hover)] font-medium'
                        : 'text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)]'
                    }`}
                  >
                    <span className="truncate text-[11px]">{bm.label}</span>
                    <span className="truncate font-mono text-[9px] opacity-65">{bm.path}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-dashed border-[var(--breeze-border-strong)] bg-[var(--breeze-base)]/60 p-2 text-center text-[10px] text-[var(--breeze-text-muted)]">
            Drop host files anywhere to copy into{' '}
            <span className="font-mono plasma-accent-text">{currentDir}</span>
          </div>
        </aside>

        {/* Right: Virtualized Directory Contents */}
        <div className="col-span-9 flex h-full flex-col overflow-hidden bg-[var(--breeze-base)]">
          {/* Table Header */}
          <div className="grid grid-cols-12 border-b border-[var(--breeze-border)] bg-[var(--breeze-view)] px-3 py-1.5 font-mono text-[10px] text-[var(--breeze-text-muted)]">
            <div className="col-span-6">NAME</div>
            <div className="col-span-2">SIZE</div>
            <div className="col-span-2">MODE</div>
            <div className="col-span-2 text-right">ACTIONS</div>
          </div>

          {/* Virtualized Rows */}
          <div ref={parentRef} className="relative flex-1 overflow-y-auto p-1">
            {isDraggingOver && (
              <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--plasma-accent)] bg-[var(--breeze-view)]/90 text-sm font-semibold">
                Drop files to upload straight into {currentDir}
              </div>
            )}

            {entries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-[var(--breeze-text-muted)]">
                Empty directory
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
                  const entry = entries[virtualRow.index]
                  const isSelected = selectedPath === entry.path

                  return (
                    <div
                      key={entry.path}
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
                        onClick={() => setSelectedPath(entry.path)}
                        onDoubleClick={() => handleOpenEntry(entry)}
                        className={`grid h-full grid-cols-12 items-center rounded px-3 text-xs cursor-pointer transition duration-120 ${
                          isSelected
                            ? 'border border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                            : 'hover:bg-[var(--breeze-hover)]'
                        }`}
                      >
                        <div className="col-span-6 flex items-center gap-2 min-w-0">
                          {entry.type === 'dir' ? (
                            <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                          ) : entry.name.endsWith('.wasm') ? (
                            <FileCode className="h-4 w-4 shrink-0 plasma-accent-text" />
                          ) : entry.name.endsWith('.md') || entry.name.endsWith('.json') ? (
                            <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
                          ) : (
                            <File className="h-4 w-4 shrink-0 text-[var(--breeze-text-muted)]" />
                          )}
                          <span className="truncate font-mono">{entry.name}</span>
                        </div>
                        <div className="col-span-2 font-mono text-[11px] text-[var(--breeze-text-muted)]">
                          {entry.type === 'dir' ? 'DIR' : formatBytes(entry.size)}
                        </div>
                        <div className="col-span-2 font-mono text-[11px] text-[var(--breeze-text-muted)]">
                          {entry.permissions}
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-1">
                          {entry.type !== 'dir' && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openApp('code', { filePath: entry.path })
                                }}
                                className="rounded p-1 text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-[var(--breeze-text)] cursor-pointer"
                                title="Edit in Strata Code"
                              >
                                <Code2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleDownloadToHost(entry)
                                }}
                                className="rounded p-1 text-[var(--breeze-text-muted)] hover:bg-[var(--breeze-hover)] hover:text-emerald-400 cursor-pointer"
                                title="Download to Host PC"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bottom Action & Status Bar */}
          <div className="flex items-center justify-between border-t border-[var(--breeze-border)] bg-[var(--breeze-view)] px-3 py-1.5 text-xs">
            <span className="truncate font-mono text-[11px] text-[var(--breeze-text-muted)]">
              {statusMsg}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  openApp('terminal')
                  setTimeout(() => {
                    kernelClient.sendCommandToTerminal(`cd "${currentDir}" && ls -la`)
                  }, 120)
                }}
                className="inline-flex items-center gap-1 rounded border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-2 py-0.5 font-mono text-[11px] hover:border-[var(--plasma-accent)] cursor-pointer"
              >
                <Terminal className="h-3 w-3 plasma-accent-text" /> Open in Terminal
              </button>
              {selectedEntry && (
                <button
                  type="button"
                  onClick={() => void handleDeleteSelected()}
                  className="inline-flex items-center gap-1 rounded bg-red-500/15 border border-red-500/35 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-500/25 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  {currentDir === TRASH_DIR ? 'Delete Permanently' : 'Move to Trash'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
