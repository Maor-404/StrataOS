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
  CheckCircle2,
  Code2,
  FileCode,
  FolderOpen,
  Play,
  Save,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'
import { useOsStore } from '../../state/osStore'

export interface StrataCodeProps {
  initialFilePath?: string
}

const QUICK_FILES = [
  '/root/sysbench.sh',
  '/root/README.md',
  '/home/strata/strata-config.json',
  '/home/strata/architecture.md',
  '/etc/strata/installed.json',
  '/usr/local/bin/strataget',
]

function getLanguageExtension(filePath: string) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.json')) return json()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return markdown()
  if (lower.endsWith('.py') || lower.endsWith('.sh')) return python()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return html()
  if (lower.endsWith('.css')) return css()
  return javascript({ typescript: lower.endsWith('.ts') || lower.endsWith('.tsx') })
}

export const StrataCode: React.FC<StrataCodeProps> = ({ initialFilePath }) => {
  const openApp = useOsStore((s) => s.openApp)

  const [filePath, setFilePath] = useState(initialFilePath ?? '/root/sysbench.sh')
  const [isDirty, setIsDirty] = useState(false)
  const [statusMsg, setStatusMsg] = useState('CodeMirror 6 Ready')
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1, length: 0 })

  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const langCompartmentRef = useRef(new Compartment())
  const filePathRef = useRef(filePath)
  filePathRef.current = filePath

  const saveCurrentFile = useCallback(async () => {
    const view = editorViewRef.current
    if (!view) return
    const text = view.state.doc.toString()
    const target = filePathRef.current
    try {
      await kernelClient.writeFileText(target, text)
      setIsDirty(false)
      setStatusMsg(`Saved ${target} (${text.length} bytes) to persistent ext4`)
    } catch (err) {
      setStatusMsg(`Save error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const loadFileIntoEditor = useCallback(async (targetPath: string) => {
    try {
      const content = await kernelClient.readFileText(targetPath)
      setFilePath(targetPath)
      filePathRef.current = targetPath
      setIsDirty(false)
      setStatusMsg(`Opened ${targetPath}`)

      const view = editorViewRef.current
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
          effects: langCompartmentRef.current.reconfigure(getLanguageExtension(targetPath)),
        })
      }
    } catch (err) {
      setStatusMsg(`Cannot open ${targetPath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  // Initialize CodeMirror 6 instance
  useEffect(() => {
    const host = editorHostRef.current
    if (!host) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          void saveCurrentFile()
          return true
        },
      },
    ])

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setIsDirty(true)
      }
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head
        const lineObj = update.state.doc.lineAt(pos)
        setCursorInfo({
          line: lineObj.number,
          col: pos - lineObj.from + 1,
          length: update.state.doc.length,
        })
      }
    })

    const customTheme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '12.5px',
        backgroundColor: '#09090b',
      },
      '.cm-scroller': {
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
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
        customTheme,
        saveKeymap,
        updateListener,
        langCompartmentRef.current.of(getLanguageExtension(filePathRef.current)),
      ],
    })

    const view = new EditorView({
      state,
      parent: host,
    })
    editorViewRef.current = view

    void loadFileIntoEditor(initialFilePath ?? '/root/sysbench.sh')

    return () => {
      view.destroy()
      editorViewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle updated initialFilePath prop when user opens a file from Strata Files or Command Palette
  useEffect(() => {
    if (initialFilePath && editorViewRef.current) {
      void loadFileIntoEditor(initialFilePath)
    }
  }, [initialFilePath, loadFileIntoEditor])

  const handleRunInTerminal = async () => {
    await saveCurrentFile()
    const target = filePathRef.current
    openApp('terminal')
    setTimeout(() => {
      if (target.endsWith('.sh') || target.startsWith('/usr/local/bin/')) {
        kernelClient.sendCommandToTerminal(`sh "${target}"`)
      } else if (target.endsWith('.json')) {
        kernelClient.sendCommandToTerminal(`cat "${target}"`)
      } else {
        kernelClient.sendCommandToTerminal(`head -n 30 "${target}"`)
      }
    }, 140)
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 select-none">
      {/* Top Editor Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/70 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
          <Code2 className="h-4 w-4 text-cyan-400 shrink-0" />
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadFileIntoEditor(filePath)}
            className="flex-1 rounded border border-white/10 bg-zinc-950 px-2.5 py-1 font-mono text-xs text-zinc-100 focus:border-cyan-500 focus:outline-none"
          />
          <button
            onClick={() => void loadFileIntoEditor(filePath)}
            className="inline-flex items-center gap-1 rounded bg-zinc-800 border border-white/10 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            <FolderOpen className="h-3.5 w-3.5 text-cyan-400" /> Open
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void saveCurrentFile()}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-xs font-medium transition ${
              isDirty
                ? 'border-cyan-500/40 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
                : 'border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Ctrl+S to Save to Linux FS"
          >
            <Save className="h-3.5 w-3.5" />
            Save {isDirty ? '*' : ''}
            <span className="ml-1 rounded bg-black/40 px-1 py-0.2 font-mono text-[10px] text-zinc-400">
              Ctrl+S
            </span>
          </button>

          <button
            onClick={() => void handleRunInTerminal()}
            className="inline-flex items-center gap-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
          >
            <Play className="h-3.5 w-3.5" /> Run in Terminal
          </button>
        </div>
      </div>

      {/* Quick Linux Files Strip */}
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-zinc-900/30 px-3 py-1 overflow-x-auto text-[11px]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mr-1">
          Quick Buffers:
        </span>
        {QUICK_FILES.map((qf) => {
          const active = filePath === qf
          return (
            <button
              key={qf}
              onClick={() => void loadFileIntoEditor(qf)}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono transition ${
                active
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <FileCode className="h-3 w-3" />
              {qf.split('/').pop()}
            </button>
          )
        })}
      </div>

      {/* CodeMirror 6 Host Container */}
      <div ref={editorHostRef} className="flex-1 overflow-hidden bg-[#09090b] select-text" />

      {/* Bottom Status Bar */}
      <div className="flex items-center justify-between border-t border-white/10 bg-zinc-900/80 px-3 py-1 font-mono text-[11px] text-zinc-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>{statusMsg}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            Ln {cursorInfo.line}, Col {cursorInfo.col}
          </span>
          <span>{cursorInfo.length} chars</span>
          <span className="text-cyan-400">UTF-8 • LF</span>
        </div>
      </div>
    </div>
  )
}
