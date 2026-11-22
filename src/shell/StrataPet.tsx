import { Bot, X } from 'lucide-react'
import React, { useState } from 'react'
import { useOsStore } from '../state/osStore'

const QUIPS = [
  'Tip: Run `strataget update && strataget install hexforge` in Strata Terminal!',
  'Did you know? `/opt/strata/apps` is bind-mounted onto persistent IndexedDB ext4!',
  'Press `Alt+Tab` for Mission Control or `Ctrl+K` for the Command Palette.',
  'Press `F2` during boot (or visit `/?boot=uefi`) to configure StrataUEFI NVRAM!',
  'Try creating a compressed ext4 checkpoint in the Time Machine Drawer!',
]

export const StrataPet: React.FC = () => {
  const active = useOsStore((s) => s.strataPetActive)
  const setActive = useOsStore((s) => s.setStrataPetActive)
  const [quipIndex, setQuipIndex] = useState(0)

  if (!active) return null

  return (
    <div className="fixed bottom-20 right-5 z-[8950] flex items-end gap-2.5 select-none">
      <div className="max-w-xs rounded-xl border border-white/10 bg-[#121215]/95 p-3 text-xs text-zinc-200 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase text-cyan-400">
            StrataPet Kernel Buddy
          </span>
          <button
            onClick={() => setActive(false)}
            className="text-zinc-500 hover:text-zinc-200"
            title="Dismiss StrataPet"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <p className="leading-relaxed text-zinc-300">{QUIPS[quipIndex]}</p>
      </div>

      <button
        onClick={() => setQuipIndex((i) => (i + 1) % QUIPS.length)}
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/40 bg-[#1c1c21] text-cyan-300 shadow-xl hover:scale-105 transition"
        title="Click for next Linux kernel tip"
      >
        <Bot className="h-6 w-6" />
      </button>
    </div>
  )
}
