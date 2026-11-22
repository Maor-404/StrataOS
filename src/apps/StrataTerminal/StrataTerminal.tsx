import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Plus, Terminal as TerminalIcon, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'
import { useOsStore } from '../../state/osStore'

interface TerminalTab {
  id: string
  title: string
  pts: number | null
}

interface TabRuntime {
  term: Terminal
  fitAddon: FitAddon
  webglAddon: WebglAddon | null
  containerEl: HTMLDivElement | null
  initialized: boolean
}

export const StrataTerminal: React.FC = () => {
  const fontSize = useOsStore((s) => s.settings.terminalFontSize)
  const updateSettings = useOsStore((s) => s.updateSettings)
  const kernelStatus = useOsStore((s) => s.kernelStatus)

  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'pty-tab-1', title: 'bash (pts/0)', pts: 0 },
  ])
  const [activeTabId, setActiveTabId] = useState<string>('pty-tab-1')
  const tabCounterRef = useRef(1)

  const runtimesRef = useRef<Map<string, TabRuntime>>(new Map())
  const viewportHostRef = useRef<HTMLDivElement | null>(null)
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId

  const initTabTerminal = useCallback(
    async (tabId: string, hostEl: HTMLDivElement) => {
      if (runtimesRef.current.has(tabId)) return

      const termDiv = document.createElement('div')
      termDiv.className = 'h-full w-full'
      termDiv.style.display = tabId === activeTabIdRef.current ? 'block' : 'none'
      hostEl.appendChild(termDiv)

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: useOsStore.getState().settings.terminalFontSize,
        lineHeight: 1.24,
        scrollback: 5000,
        allowProposedApi: true,
        theme: {
          background: '#09090b',
          foreground: '#e4e4e7',
          cursor: '#22d3ee',
          cursorAccent: '#09090b',
          selectionBackground: 'rgba(34, 211, 238, 0.25)',
          black: '#18181b',
          red: '#f87171',
          green: '#34d399',
          yellow: '#fbbf24',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#22d3ee',
          white: '#e4e4e7',
          brightBlack: '#52525b',
          brightRed: '#fca5a5',
          brightGreen: '#6ee7b7',
          brightYellow: '#fde68a',
          brightBlue: '#93c5fd',
          brightMagenta: '#d8b4fe',
          brightCyan: '#67e8f9',
          brightWhite: '#fafafa',
        },
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termDiv)

      let webglAddon: WebglAddon | null = null
      try {
        webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          webglAddon?.dispose()
        })
        term.loadAddon(webglAddon)
      } catch {
        // Fallback to standard canvas/DOM renderer if WebGL2 context unavailable
        webglAddon = null
      }

      try {
        fitAddon.fit()
      } catch {
        // ignore if hidden
      }

      const runtime: TabRuntime = {
        term,
        fitAddon,
        webglAddon,
        containerEl: termDiv,
        initialized: true,
      }
      runtimesRef.current.set(tabId, runtime)

      term.onData((data) => {
        void kernelClient.writeTerminalInput(tabId, data)
      })

      term.onResize(({ cols, rows }) => {
        void kernelClient.resizeTerminal(tabId, cols, rows)
      })

      const cols = Math.max(40, term.cols || 90)
      const rows = Math.max(12, term.rows || 26)

      try {
        const { pts } = await kernelClient.createTerminalSession(tabId, cols, rows, (bytes) => {
          term.write(bytes)
        })
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, pts, title: `sh (pts/${pts})` } : t))
        )
        term.focus()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        term.writeln(`\r\n\x1b[1;31m[Kernel PTY Error]\x1b[0m ${msg}`)
      }
    },
    []
  )

  // Mount initial & newly added tabs once kernel is online
  useEffect(() => {
    const hostEl = viewportHostRef.current
    if (!hostEl || kernelStatus !== 'online') return

    for (const tab of tabs) {
      if (!runtimesRef.current.has(tab.id)) {
        void initTabTerminal(tab.id, hostEl)
      }
    }
  }, [tabs, kernelStatus, initTabTerminal])

  // Toggle visibility & refit when switching tabs
  useEffect(() => {
    for (const [id, rt] of runtimesRef.current.entries()) {
      if (rt.containerEl) {
        const isActive = id === activeTabId
        rt.containerEl.style.display = isActive ? 'block' : 'none'
        if (isActive) {
          requestAnimationFrame(() => {
            try {
              rt.fitAddon.fit()
              rt.term.focus()
            } catch {
              // ignore
            }
          })
        }
      }
    }
  }, [activeTabId])

  // Update font size across all tabs
  useEffect(() => {
    for (const rt of runtimesRef.current.values()) {
      rt.term.options.fontSize = fontSize
      try {
        rt.fitAddon.fit()
      } catch {
        // ignore
      }
    }
  }, [fontSize])

  // ResizeObserver for responsive terminal fitting
  useEffect(() => {
    const hostEl = viewportHostRef.current
    if (!hostEl) return

    let rafId = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const activeRt = runtimesRef.current.get(activeTabIdRef.current)
        if (activeRt) {
          try {
            activeRt.fitAddon.fit()
          } catch {
            // ignore
          }
        }
      })
    })
    observer.observe(hostEl)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  // Subscribe to external "Run in Terminal" commands (from Strata Code or Strata Store)
  useEffect(() => {
    return kernelClient.onTerminalCommand((command) => {
      const targetTab = activeTabIdRef.current
      void kernelClient.writeTerminalInput(targetTab, `${command}\n`)
      const rt = runtimesRef.current.get(targetTab)
      rt?.term.focus()
    })
  }, [])

  // Cleanup all PTY sessions on unmount
  useEffect(() => {
    const runtimes = runtimesRef.current
    return () => {
      for (const [tabId, rt] of runtimes.entries()) {
        void kernelClient.closeTerminalSession(tabId)
        rt.webglAddon?.dispose()
        rt.term.dispose()
      }
      runtimes.clear()
    }
  }, [])

  const handleAddTab = () => {
    tabCounterRef.current += 1
    const newId = `pty-tab-${tabCounterRef.current}`
    setTabs((prev) => [
      ...prev,
      { id: newId, title: `sh (pts/${prev.length})`, pts: prev.length },
    ])
    setActiveTabId(newId)
  }

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length <= 1) return

    const rt = runtimesRef.current.get(tabId)
    if (rt) {
      void kernelClient.closeTerminalSession(tabId)
      rt.webglAddon?.dispose()
      rt.term.dispose()
      rt.containerEl?.remove()
      runtimesRef.current.delete(tabId)
    }

    const remaining = tabs.filter((t) => t.id !== tabId)
    setTabs(remaining)
    if (activeTabId === tabId && remaining.length > 0) {
      setActiveTabId(remaining[remaining.length - 1].id)
    }
  }

  const runQuickCommand = (cmd: string) => {
    void kernelClient.writeTerminalInput(activeTabId, `${cmd}\n`)
    runtimesRef.current.get(activeTabId)?.term.focus()
  }

  return (
    <div className="flex h-full flex-col bg-[#09090b] text-zinc-200 select-none">
      {/* Terminal Tab & Controls Bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-2 py-1 text-xs">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`group flex items-center gap-2 rounded px-2.5 py-1 font-mono text-xs cursor-pointer transition ${
                  isActive
                    ? 'bg-zinc-800 text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <TerminalIcon className="h-3 w-3 text-cyan-400" />
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="rounded p-0.5 text-zinc-500 hover:bg-red-500/20 hover:text-red-300"
                    title="Close PTY tab"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            )
          })}
          <button
            onClick={handleAddTab}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-cyan-300"
            title="New PTY Shell Tab"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Quick Command Pills & Font Zoom */}
        <div className="flex items-center gap-1.5">
          <div className="hidden md:flex items-center gap-1 mr-1">
            <button
              onClick={() => runQuickCommand('strataget update')}
              className="rounded bg-zinc-800/90 border border-white/5 px-2 py-0.5 font-mono text-[10px] text-cyan-300 hover:bg-zinc-700"
            >
              strataget update
            </button>
            <button
              onClick={() => runQuickCommand('strataget list')}
              className="rounded bg-zinc-800/90 border border-white/5 px-2 py-0.5 font-mono text-[10px] text-emerald-300 hover:bg-zinc-700"
            >
              strataget list
            </button>
            <button
              onClick={() => runQuickCommand('uname -a')}
              className="rounded bg-zinc-800/90 border border-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-700"
            >
              uname -a
            </button>
          </div>

          <div className="flex items-center rounded border border-white/10 bg-zinc-950/80 px-1 py-0.5">
            <button
              onClick={() =>
                updateSettings({ terminalFontSize: Math.max(10, fontSize - 1) })
              }
              className="p-0.5 text-zinc-400 hover:text-zinc-100"
              title="Decrease Font Size"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[10px] text-zinc-300">{fontSize}px</span>
            <button
              onClick={() =>
                updateSettings({ terminalFontSize: Math.min(22, fontSize + 1) })
              }
              className="p-0.5 text-zinc-400 hover:text-zinc-100"
              title="Increase Font Size"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="relative flex-1 overflow-hidden p-1.5 bg-[#09090b]">
        {kernelStatus !== 'online' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/90 font-mono text-xs text-cyan-300">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <div>Booting Linux 7.3.4 unkernel in WebWorker...</div>
          </div>
        )}
        <div ref={viewportHostRef} className="h-full w-full overflow-hidden" />
      </div>
    </div>
  )
}
