import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import {
  Columns,
  FileCode,
  Folder,
  FolderOpen,
  PackagePlus,
  Play,
  RefreshCw,
  Save,
  Terminal,
  X,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { kernelClient } from '../../kernel/kernelClient'
import type { FsEntry } from '../../kernel/types'
import { useOsStore } from '../../state/osStore'

export interface StrataStudioProps {
  initialFilePath?: string
}

interface StudioTab {
  path: string
  name: string
  content: string
  dirty: boolean
}

const TREE_ROOTS = ['/root', '/home/strata', '/etc/strata', '/opt/strata/apps', '/usr/local/bin']

function getLangExt(path: string) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json')) return json()
  if (lower.endsWith('.md')) return markdown()
  if (lower.endsWith('.py') || lower.endsWith('.sh')) return python()
  if (lower.endsWith('.html')) return html()
  if (lower.endsWith('.css')) return css()
  return javascript({ typescript: true })
}

export const StrataStudio: React.FC<StrataStudioProps> = ({ initialFilePath }) => {
  const studioDraft = useOsStore((s) => s.studioDraft)
  const setStudioDraft = useOsStore((s) => s.setStudioDraft)
  const openApp = useOsStore((s) => s.openApp)

  const [activeRoot, setActiveRoot] = useState('/root')
  const [treeEntries, setTreeEntries] = useState<FsEntry[]>([])
  const [tabs, setTabs] = useState<StudioTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string>('/root/sysbench.sh')
  const [splitEditorOpen, setSplitEditorOpen] = useState<boolean>(false)
  const [splitContent, setSplitContent] = useState<string>('')
  const [splitPath, setSplitPath] = useState<string>('/etc/strata/installed.json')

  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    '[Strata Studio v1.0.0 ("Bedrock")] Connected to Linux 7.3.4 unkernel worker.',
  ])
  const [runningScript, setRunningScript] = useState(false)
  const [scaffolderOpen, setScaffolderOpen] = useState(false)
  const [scaffoldId, setScaffoldId] = useState('matrix-probe')
  const [scaffoldName, setScaffoldName] = useState('MatrixProbe WASM')

  const primaryHostRef = useRef<HTMLDivElement | null>(null)
  const primaryViewRef = useRef<EditorView | null>(null)
  const langCompRef = useRef(new Compartment())
  const activeTabPathRef = useRef(activeTabPath)
  activeTabPathRef.current = activeTabPath

  const refreshTree = useCallback(async (dir: string) => {
    try {
      const list = await kernelClient.listDirectory(dir)
      setTreeEntries(list)
      setActiveRoot(dir)
    } catch {
      setTreeEntries([])
    }
  }, [])

  const openFileTab = useCallback(async (filePath: string) => {
    try {
      const content = await kernelClient.readFileText(filePath)
      const name = filePath.split('/').pop() || filePath
      setTabs((prev) => {
        const exists = prev.find((t) => t.path === filePath)
        if (exists) {
          return prev.map((t) => (t.path === filePath ? { ...t, content, dirty: false } : t))
        }
        return [...prev, { path: filePath, name, content, dirty: false }]
      })
      setActiveTabPath(filePath)
      activeTabPathRef.current = filePath

      const view = primaryViewRef.current
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
          effects: langCompRef.current.reconfigure(getLangExt(filePath)),
        })
      }
    } catch (err) {
      setConsoleLogs((prev) => [
        ...prev,
        `[Error opening ${filePath}] ${err instanceof Error ? err.message : String(err)}`,
      ])
    }
  }, [])

  const saveActiveTab = useCallback(async () => {
    const view = primaryViewRef.current
    const currentPath = activeTabPathRef.current
    if (!view || !currentPath) return
    const text = view.state.doc.toString()
    await kernelClient.writeFileText(currentPath, text)
    setTabs((prev) =>
      prev.map((t) => (t.path === currentPath ? { ...t, content: text, dirty: false } : t))
    )
    setConsoleLogs((prev) => [
      ...prev,
      `[Saved] ${currentPath} (${text.length} bytes flushed to ext4)`,
    ])
  }, [])

  // Mount CodeMirror 6 primary editor
  useEffect(() => {
    const host = primaryHostRef.current
    if (!host) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          void saveActiveTab()
          return true
        },
      },
    ])

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        const cur = activeTabPathRef.current
        const text = u.state.doc.toString()
        setTabs((prev) =>
          prev.map((t) => (t.path === cur ? { ...t, content: text, dirty: true } : t))
        )
      }
    })

    const theme = EditorView.theme({
      '&': { height: '100%', fontSize: '12.5px', backgroundColor: '#09090b' },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.55',
      },
      '.cm-gutters': {
        backgroundColor: '#09090b',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        color: '#52525b',
      },
    })

    const state = EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        oneDark,
        theme,
        saveKeymap,
        updateListener,
        langCompRef.current.of(getLangExt(activeTabPathRef.current)),
      ],
    })

    const view = new EditorView({ state, parent: host })
    primaryViewRef.current = view

    void refreshTree('/root')
    void openFileTab(initialFilePath ?? '/root/sysbench.sh')
    void kernelClient
      .readFileText('/etc/strata/installed.json')
      .then(setSplitContent)
      .catch(() => {})

    return () => {
      view.destroy()
      primaryViewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync incoming draft from Strata Copilot ("Apply to Strata Studio")
  useEffect(() => {
    if (studioDraft) {
      void openFileTab(studioDraft.filePath)
      setStudioDraft(null)
    }
  }, [studioDraft, openFileTab, setStudioDraft])

  const handleSwitchTab = (tab: StudioTab) => {
    setActiveTabPath(tab.path)
    activeTabPathRef.current = tab.path
    const view = primaryViewRef.current
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: tab.content },
        effects: langCompRef.current.reconfigure(getLangExt(tab.path)),
      })
    }
  }

  const handleCloseTab = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = tabs.filter((t) => t.path !== path)
    setTabs(next)
    if (activeTabPath === path && next.length > 0) {
      handleSwitchTab(next[next.length - 1])
    }
  }

  const handleRunActiveScript = async () => {
    await saveActiveTab()
    const target = activeTabPathRef.current
    setRunningScript(true)
    setConsoleLogs((prev) => [...prev, `$ sh "${target}"`])
    try {
      const res = await kernelClient.execCommand('/bin/sh', [target])
      if (res.stdout) {
        setConsoleLogs((prev) => [...prev, ...res.stdout.trim().split('\n')])
      }
      if (res.stderr) {
        setConsoleLogs((prev) => [...prev, `[stderr] ${res.stderr.trim()}`])
      }
      setConsoleLogs((prev) => [...prev, `[Exit code: ${res.exitCode}]`])
    } catch (err) {
      setConsoleLogs((prev) => [
        ...prev,
        `[Execution Error] ${err instanceof Error ? err.message : String(err)}`,
      ])
    } finally {
      setRunningScript(false)
    }
  }

  const handleScaffoldWasmApp = async () => {
    const cleanId = scaffoldId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'custom-wasm'
    const manifest = {
      id: cleanId,
      name: scaffoldName.trim() || 'Custom WASM App',
      version: '1.0.0',
      author: 'Strata Studio IDE',
      category: 'Developer Tools',
      type: 'wasm-gui',
      entry: `${cleanId}.wasm`,
      icon: 'Cpu',
      description: `Scaffolded inside Strata Studio IDE and installed to /opt/strata/apps/${cleanId}.`,
      permissions: ['fs:read', 'canvas'],
    }
    // Minimal valid WebAssembly module exporting compute_score(a, b) -> a * b + 42
    const wasmBinary = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
      0x03, 0x02, 0x01, 0x00,
      0x05, 0x03, 0x01, 0x00, 0x01,
      0x07, 0x1b, 0x02, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00,
      0x0d, 0x63, 0x6f, 0x6d, 0x70, 0x75, 0x74, 0x65, 0x5f, 0x73, 0x63, 0x6f, 0x72, 0x65, 0x00, 0x00,
      0x0a, 0x0c, 0x01, 0x0a, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6c, 0x41, 0x2a, 0x6a, 0x0b,
    ])

    const record = await kernelClient.sideloadPackage(JSON.stringify(manifest, null, 2), wasmBinary)
    setScaffolderOpen(false)
    setConsoleLogs((prev) => [
      ...prev,
      `[Scaffolder] Built & registered ${record.name} -> ${record.installPath}/${record.entry}`,
    ])
    await refreshTree('/opt/strata/apps')
    await openFileTab(`${record.installPath}/manifest.json`)
    openApp(`wasm:${record.id}`, { title: `${record.name} v1.0.0`, icon: 'Cpu' })
  }

  return (
    <div className="flex h-full flex-col bg-[#121215] text-zinc-100 select-none">
      {/* Top IDE Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#1c1c21] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-100">Strata Studio IDE</span>
          <span className="rounded bg-zinc-900 border border-white/10 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
            {activeTabPath}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void saveActiveTab()}
            className="inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            <Save className="h-3.5 w-3.5 text-cyan-400" /> Save (Ctrl+S)
          </button>

          <button
            onClick={() => setSplitEditorOpen((s) => !s)}
            className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs transition ${
              splitEditorOpen
                ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                : 'border-white/10 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <Columns className="h-3.5 w-3.5" /> Split Editor
          </button>

          <button
            id="studio-scaffold-wasm-btn"
            onClick={() => setScaffolderOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/25"
          >
            <PackagePlus className="h-3.5 w-3.5" /> Scaffold WASM App
          </button>

          <button
            id="studio-run-script-btn"
            onClick={() => void handleRunActiveScript()}
            disabled={runningScript}
            className="inline-flex items-center gap-1 rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" /> {runningScript ? 'Running...' : 'Run Script'}
          </button>
        </div>
      </div>

      {/* strataget WASM App Scaffolder Modal Bar */}
      {scaffolderOpen && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-[#1c1c21]/95 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-300">strataget WASM App Scaffolder:</span>
            <input
              type="text"
              value={scaffoldId}
              onChange={(e) => setScaffoldId(e.target.value)}
              placeholder="package-id"
              className="w-32 rounded border border-white/10 bg-[#09090b] px-2 py-1 font-mono text-xs text-zinc-100"
            />
            <input
              type="text"
              value={scaffoldName}
              onChange={(e) => setScaffoldName(e.target.value)}
              placeholder="Display Name"
              className="w-44 rounded border border-white/10 bg-[#09090b] px-2 py-1 text-xs text-zinc-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleScaffoldWasmApp()}
              className="rounded bg-amber-400 px-3 py-1 font-semibold text-zinc-950 hover:bg-amber-300"
            >
              Compile &amp; Install to /opt/strata/apps
            </button>
            <button
              onClick={() => setScaffolderOpen(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resizable Multi-Pane IDE Workspace */}
      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal">
          {/* Left Panel: Linux File Tree */}
          <Panel defaultSize="24%" minSize="16%">
            <div className="flex h-full flex-col bg-[#121215] text-xs">
              <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Linux File Tree
                </span>
                <button
                  onClick={() => void refreshTree(activeRoot)}
                  className="text-zinc-400 hover:text-cyan-300"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-white/10 p-1.5">
                {TREE_ROOTS.map((r) => (
                  <button
                    key={r}
                    onClick={() => void refreshTree(r)}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                      activeRoot === r
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                {treeEntries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => {
                      if (entry.type === 'dir') {
                        void refreshTree(entry.path)
                      } else {
                        void openFileTab(entry.path)
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs transition ${
                      activeTabPath === entry.path
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    {entry.type === 'dir' ? (
                      <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    ) : (
                      <FileCode className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Separator className="w-1 bg-white/5 hover:bg-cyan-500/40 transition cursor-col-resize" />

          {/* Right Panel: Vertical Split between Editor Tabs & Embedded Terminal Drawer */}
          <Panel defaultSize="76%" minSize="45%">
            <Group orientation="vertical">
              {/* Top: Multi-Tab CodeMirror 6 + Optional Split Editor */}
              <Panel defaultSize="68%" minSize="30%">
                <div className="flex h-full flex-col bg-[#09090b]">
                  {/* Tab Bar */}
                  <div className="flex items-center gap-1 border-b border-white/10 bg-[#121215] px-2 py-1 overflow-x-auto">
                    {tabs.map((tab) => {
                      const active = tab.path === activeTabPath
                      return (
                        <div
                          key={tab.path}
                          onClick={() => handleSwitchTab(tab)}
                          className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-xs cursor-pointer transition ${
                            active
                              ? 'bg-[#1c1c21] text-cyan-300 border border-cyan-500/30'
                              : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                          }`}
                        >
                          <FileCode className="h-3 w-3 text-cyan-400" />
                          <span>
                            {tab.name}
                            {tab.dirty ? ' *' : ''}
                          </span>
                          {tabs.length > 1 && (
                            <button
                              onClick={(e) => handleCloseTab(tab.path, e)}
                              className="text-zinc-500 hover:text-red-300"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Primary + Secondary Split Editor Area */}
                  <div
                    className={`grid flex-1 overflow-hidden ${
                      splitEditorOpen ? 'grid-cols-2 divide-x divide-white/10' : 'grid-cols-1'
                    }`}
                  >
                    <div ref={primaryHostRef} className="h-full w-full overflow-hidden select-text" />
                    {splitEditorOpen && (
                      <div className="flex h-full flex-col bg-[#09090b]">
                        <div className="flex items-center justify-between border-b border-white/10 bg-[#121215] px-2.5 py-1 text-[11px] font-mono text-zinc-400">
                          <span className="inline-flex items-center gap-1">
                            <FolderOpen className="h-3 w-3 text-cyan-400" /> Split Reference:{' '}
                            {splitPath}
                          </span>
                          <button
                            onClick={async () => {
                              await kernelClient.writeFileText(splitPath, splitContent)
                              setConsoleLogs((p) => [...p, `[Saved Split Buffer] ${splitPath}`])
                            }}
                            className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-zinc-700"
                          >
                            Save Split
                          </button>
                        </div>
                        <textarea
                          value={splitContent}
                          onChange={(e) => setSplitContent(e.target.value)}
                          onFocus={() => setSplitPath('/etc/strata/installed.json')}
                          className="flex-1 w-full resize-none bg-[#09090b] p-3 font-mono text-xs text-zinc-200 focus:outline-none select-text"
                          spellCheck={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              <Separator className="h-1 bg-white/5 hover:bg-cyan-500/40 transition cursor-row-resize" />

              {/* Bottom: Embedded Execution Console & Terminal Drawer */}
              <Panel defaultSize="32%" minSize="18%">
                <div className="flex h-full flex-col bg-[#09090b] font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-white/10 bg-[#121215] px-3 py-1 text-[11px] text-zinc-400">
                    <span className="inline-flex items-center gap-1.5 text-cyan-300">
                      <Terminal className="h-3.5 w-3.5" /> Embedded Kernel Execution Drawer
                    </span>
                    <button
                      onClick={() => setConsoleLogs([])}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      Clear Output
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1 text-zinc-300 select-text">
                    {consoleLogs.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </div>
  )
}
