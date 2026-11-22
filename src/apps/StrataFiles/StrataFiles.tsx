import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowUp,
  Code2,
  Download,
  File,
  FileCode,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  RefreshCw,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'
import type { FsEntry } from '../../kernel/types'
import { useOsStore } from '../../state/osStore'

export interface StrataFilesProps {
  initialPath?: string
}

const BOOKMARK_PATHS = [
  { label: '/root', path: '/root', desc: 'Root Home' },
  { label: '/home/strata', path: '/home/strata', desc: 'User Workspace' },
  { label: '/opt/strata/apps', path: '/opt/strata/apps', desc: 'WASM Packages' },
  { label: '/etc/strata', path: '/etc/strata', desc: 'Registry & Config' },
  { label: '/usr/local/bin', path: '/usr/local/bin', desc: 'CLI Wrappers' },
  { label: '/data', path: '/data', desc: 'ext4 Persistent Disk' },
  { label: '/', path: '/', desc: 'Root Filesystem' },
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
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Synced with Linux ext4 filesystem')
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [newPromptType, setNewPromptType] = useState<'file' | 'dir' | null>(null)
  const [newPromptName, setNewPromptName] = useState('')

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true)
    try {
      const list = await kernelClient.listDirectory(dirPath)
      setEntries(list)
      setCurrentDir(dirPath)
      setSelectedPath(null)
      setStatusMsg(`${list.length} items in ${dirPath}`)
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

  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
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
    // Check if an installed community WASM app handles this extension
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
    try {
      await kernelClient.deletePath(selectedPath)
      setStatusMsg(`Deleted ${selectedPath}`)
      await loadDirectory(currentDir)
    } catch (err) {
      setStatusMsg(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const selectedEntry = entries.find((e) => e.path === selectedPath) ?? null

  return (
    <div
      className="flex h-full flex-col bg-zinc-950 text-zinc-100 select-none"
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
      {/* Top Path & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/70 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
          <button
            onClick={navigateUp}
            disabled={currentDir === '/'}
            className="rounded border border-white/10 bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
            title="Parent Directory"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <input
            type="text"
            value={currentDir}
            onChange={(e) => setCurrentDir(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadDirectory(currentDir)}
            className="flex-1 rounded border border-white/10 bg-zinc-950 px-2.5 py-1 font-mono text-xs text-zinc-100 focus:border-cyan-500 focus:outline-none"
          />
          <button
            onClick={() => void loadDirectory(currentDir)}
            className="rounded border border-white/10 bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700"
            title="Refresh Directory"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setNewPromptType('file')
              setNewPromptName('untitled.txt')
            }}
            className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            <FilePlus className="h-3.5 w-3.5 text-cyan-400" /> New File
          </button>
          <button
            onClick={() => {
              setNewPromptType('dir')
              setNewPromptName('new-folder')
            }}
            className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            <FolderPlus className="h-3.5 w-3.5 text-amber-400" /> New Folder
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25">
            <Upload className="h-3.5 w-3.5" /> Upload
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
        <div className="flex items-center gap-2 border-b border-cyan-500/30 bg-zinc-900 px-3 py-1.5 text-xs">
          <span className="text-cyan-300">
            Create {newPromptType === 'dir' ? 'Directory' : 'File'} in {currentDir}:
          </span>
          <input
            type="text"
            autoFocus
            value={newPromptName}
            onChange={(e) => setNewPromptName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreateSubmit()}
            className="rounded border border-white/15 bg-zinc-950 px-2 py-0.5 font-mono text-xs text-zinc-100"
          />
          <button
            onClick={() => void handleCreateSubmit()}
            className="rounded bg-cyan-500 px-2.5 py-0.5 text-xs font-semibold text-zinc-950"
          >
            Create
          </button>
          <button
            onClick={() => setNewPromptType(null)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Main Layout: Sidebar Bookmarks + Virtualized File Table */}
      <div className="grid flex-1 grid-cols-12 divide-x divide-white/10 overflow-hidden">
        {/* Sidebar Bookmarks */}
        <div className="col-span-3 flex flex-col justify-between bg-zinc-900/40 p-2 text-xs overflow-y-auto">
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Linux Mounts & Paths
            </div>
            {BOOKMARK_PATHS.map((bm) => {
              const active = currentDir === bm.path
              return (
                <button
                  key={bm.path}
                  onClick={() => void loadDirectory(bm.path)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <HardDrive className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-medium">{bm.label}</div>
                    <div className="truncate text-[10px] text-zinc-500">{bm.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="rounded-lg border border-dashed border-white/10 bg-zinc-950/60 p-2.5 text-center text-[11px] text-zinc-400">
            Drag & drop files from your host PC anywhere to upload into{' '}
            <span className="font-mono text-cyan-300">{currentDir}</span>
          </div>
        </div>

        {/* Right: Virtualized Directory Contents */}
        <div className="col-span-9 flex h-full flex-col overflow-hidden bg-zinc-950">
          {/* Table Header */}
          <div className="grid grid-cols-12 border-b border-white/10 bg-zinc-900/60 px-3 py-1.5 font-mono text-[11px] text-zinc-400">
            <div className="col-span-6">NAME</div>
            <div className="col-span-2">SIZE</div>
            <div className="col-span-2">PERMISSIONS</div>
            <div className="col-span-2 text-right">ACTIONS</div>
          </div>

          {/* Virtualized Rows */}
          <div ref={parentRef} className="relative flex-1 overflow-y-auto p-1">
            {isDraggingOver && (
              <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-950/40 text-sm font-semibold text-cyan-200">
                Drop files to upload straight into {currentDir}
              </div>
            )}

            {entries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">
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
                        className={`grid h-full grid-cols-12 items-center rounded px-3 text-xs cursor-pointer transition ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30'
                            : 'hover:bg-zinc-900/80 text-zinc-200'
                        }`}
                      >
                        <div className="col-span-6 flex items-center gap-2 min-w-0">
                          {entry.type === 'dir' ? (
                            <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                          ) : entry.name.endsWith('.wasm') ? (
                            <FileCode className="h-4 w-4 shrink-0 text-cyan-400" />
                          ) : entry.name.endsWith('.md') || entry.name.endsWith('.json') ? (
                            <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
                          ) : (
                            <File className="h-4 w-4 shrink-0 text-zinc-400" />
                          )}
                          <span className="truncate font-mono">{entry.name}</span>
                        </div>
                        <div className="col-span-2 font-mono text-[11px] text-zinc-400">
                          {entry.type === 'dir' ? 'DIR' : formatBytes(entry.size)}
                        </div>
                        <div className="col-span-2 font-mono text-[11px] text-zinc-500">
                          {entry.permissions}
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-1">
                          {entry.type !== 'dir' && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openApp('code', { filePath: entry.path })
                                }}
                                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-cyan-300"
                                title="Edit in Strata Code"
                              >
                                <Code2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleDownloadToHost(entry)
                                }}
                                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300"
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
          <div className="flex items-center justify-between border-t border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs">
            <span className="font-mono text-[11px] text-zinc-400">{statusMsg}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  openApp('terminal')
                  setTimeout(() => {
                    kernelClient.sendCommandToTerminal(`cd "${currentDir}" && ls -la`)
                  }, 120)
                }}
                className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:bg-zinc-700"
              >
                <Terminal className="h-3 w-3 text-cyan-400" /> Open Dir in Terminal
              </button>
              {selectedEntry && (
                <button
                  onClick={() => void handleDeleteSelected()}
                  className="inline-flex items-center gap-1 rounded bg-red-500/15 border border-red-500/30 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/25"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
