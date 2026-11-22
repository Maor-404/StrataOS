import { CheckCircle2, Cpu, HardDrive, Layers, Package, ShieldCheck, X } from 'lucide-react'
import React from 'react'
import { useOsStore } from '../state/osStore'
import { STRATA_CONFIG } from '../strata.config'

export const AboutModal: React.FC = () => {
  const isOpen = useOsStore((s) => s.aboutModalOpen)
  const setOpen = useOsStore((s) => s.setAboutModalOpen)
  const installedCount = useOsStore((s) => s.installedPackages.length)
  const nvram = useOsStore((s) => s.nvram)

  if (!isOpen) return null

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[9600] flex items-center justify-center bg-black/65 p-4 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121215] p-5 text-zinc-100 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/15 text-sky-300">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                {STRATA_CONFIG.releaseTitle}
              </h2>
              <p className="font-mono text-xs text-sky-300">
                Browser-Native Linux 7.3.4 Web Operating System
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1c1c21] px-3 py-2">
            <span className="flex items-center gap-2 text-zinc-400">
              <Cpu className="h-3.5 w-3.5 text-sky-400" /> Kernel Engine
            </span>
            <span className="font-mono text-zinc-200">pithings/unkernel (arch/wasm)</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1c1c21] px-3 py-2">
            <span className="flex items-center gap-2 text-zinc-400">
              <HardDrive className="h-3.5 w-3.5 text-emerald-400" /> Persistent Root Disk
            </span>
            <span className="font-mono text-zinc-200">ext4 CowDisk + Time Machine</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1c1c21] px-3 py-2">
            <span className="flex items-center gap-2 text-zinc-400">
              <Package className="h-3.5 w-3.5 text-amber-400" /> Package Ecosystem
            </span>
            <span className="font-mono text-zinc-200">
              strataget CLI + Strata Store ({installedCount} installed)
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1c1c21] px-3 py-2">
            <span className="flex items-center gap-2 text-zinc-400">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-400" /> StrataUEFI Firmware
            </span>
            <span className="font-mono text-zinc-200">
              v1.0.0 • Secure Boot {nvram.secureBoot ? 'ON' : 'OFF'}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1c1c21] px-3 py-2">
            <span className="flex items-center gap-2 text-zinc-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Cross-Origin Isolation
            </span>
            <span className="font-mono text-emerald-300">
              {globalThis.crossOriginIsolated ? 'COOP/COEP Enabled (SAB Active)' : 'Inactive'}
            </span>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-sky-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
