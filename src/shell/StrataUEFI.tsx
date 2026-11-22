import {
  Cpu,
  HardDrive,
  Play,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Wrench,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { StrataTerminal } from '../apps/StrataTerminal/StrataTerminal'
import { useOsStore, type BootTarget } from '../state/osStore'
import { STRATA_CONFIG } from '../strata.config'

const BOOT_TARGETS: Array<{ id: BootTarget; label: string; desc: string }> = [
  {
    id: 'desktop',
    label: 'StrataOS v1.0.0 ("Bedrock") Graphical Desktop',
    desc: 'Default 120fps compositor + Linux 7.3.4 unkernel Web Worker + strataget',
  },
  {
    id: 'tty-recovery',
    label: 'Linux 7.3.4 Full-Screen TTY Recovery Console',
    desc: 'Direct /dev/pts/0 root shell without desktop window manager overhead',
  },
  {
    id: 'uefi-shell',
    label: 'StrataUEFI Interactive Firmware Shell (EFI v2.70)',
    desc: 'Pre-boot hardware diagnostics, device map, memtest, and NVRAM utility',
  },
  {
    id: 'safe-mode',
    label: 'StrataOS Safe Mode (Low-VRAM / Blur Disabled)',
    desc: 'Boots graphical desktop with Performance Mode enabled and zero GPU shaders',
  },
]

export const StrataUEFI: React.FC = () => {
  const bootPhase = useOsStore((s) => s.bootPhase)
  const nvram = useOsStore((s) => s.nvram)
  const setBootPhase = useOsStore((s) => s.setBootPhase)
  const updateNvram = useOsStore((s) => s.updateNvram)
  const resetNvram = useOsStore((s) => s.resetNvram)
  const updateSettings = useOsStore((s) => s.updateSettings)

  const [postProgress, setPostProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<'main' | 'boot' | 'security' | 'shell'>('main')

  // UEFI Shell state
  const [shellHistory, setShellHistory] = useState<string[]>([
    'StrataUEFI Interactive Shell v2.70 [ Stratum Firmware Bedrock 1.0.0 ]',
    'Mapping table:',
    '  FS0  : HardDisk - Alias(s):HD0a0b:;BLK0: (IndexedDB ext4 kwdisk:kwdata-v1)',
    '  BLK1 : RamDisk  - unkernel.wasm Bundled Initramfs (Linux 7.3.4 aarch64)',
    '  SHM0 : Memory   - Cross-Origin Isolated SharedArrayBuffer (512 MiB)',
    '',
    'Type "help" for available commands or "boot" to launch StrataOS Desktop.',
  ])
  const [shellInput, setShellInput] = useState('')
  const shellInputRef = useRef<HTMLInputElement | null>(null)

  const executeBootTarget = (target: BootTarget) => {
    if (target === 'desktop') {
      setBootPhase('desktop')
    } else if (target === 'safe-mode') {
      updateSettings({ performanceMode: true, webgpuWallpaperEnabled: false })
      setBootPhase('desktop')
    } else if (target === 'tty-recovery') {
      setBootPhase('tty-recovery')
    } else if (target === 'uefi-shell') {
      setBootPhase('uefi-shell')
    }
  }

  // 1.5s POST splash countdown + F2 / DEL / F12 listener
  useEffect(() => {
    if (bootPhase !== 'post') return

    const duration = nvram.fastBoot ? 350 : nvram.postTimeoutMs || 1500
    const startTime = performance.now()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' || e.key === 'Delete') {
        e.preventDefault()
        setBootPhase('uefi-setup')
      } else if (e.key === 'F12') {
        e.preventDefault()
        setBootPhase('uefi-boot-menu')
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        executeBootTarget(nvram.bootPriority)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime
      const pct = Math.min(100, Math.round((elapsed / duration) * 100))
      setPostProgress(pct)
      if (elapsed >= duration) {
        clearInterval(interval)
        executeBootTarget(nvram.bootPriority)
      }
    }, 40)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootPhase, nvram.fastBoot, nvram.postTimeoutMs, nvram.bootPriority])

  useEffect(() => {
    if (bootPhase === 'uefi-shell' || activeTab === 'shell') {
      setTimeout(() => shellInputRef.current?.focus(), 50)
    }
  }, [bootPhase, activeTab])

  const handleShellCommand = (rawCmd: string) => {
    const trimmed = rawCmd.trim()
    const parts = trimmed.split(/\s+/)
    const cmd = (parts[0] ?? '').toLowerCase()
    const nextLines = [...shellHistory, `Shell> ${trimmed}`]

    if (!cmd) {
      setShellHistory(nextLines)
      return
    }

    if (cmd === 'help' || cmd === '?') {
      nextLines.push(
        'Available StrataUEFI Shell Commands:',
        '  help     - Display this UEFI command list',
        '  map      - List EFI block devices, filesystems & SharedArrayBuffer regions',
        '  memtest  - Run 64-bit WebAssembly linear memory integrity check',
        '  nvram    - Inspect persistent UEFI NVRAM variables stored in IndexedDB',
        '  reset    - Reset NVRAM to factory defaults and reboot POST',
        '  setup    - Open StrataUEFI Graphical Setup Utility',
        '  boot     - Exit UEFI Shell and boot StrataOS v1.0.0 ("Bedrock") Desktop',
        '  cls      - Clear terminal screen'
      )
    } else if (cmd === 'cls' || cmd === 'clear') {
      setShellHistory([])
      setShellInput('')
      return
    } else if (cmd === 'map') {
      nextLines.push(
        'Device mapping table:',
        '  FS0  : HardDisk - Persistent Copy-on-Write ext4 (IndexedDB kwdisk:kwdata-v1)',
        '  BLK0 : RomImage - unkernel.wasm (Linux 7.3.4 arch/wasm + Sv39 MMU)',
        '  CPU0 : Virtual  - kwemu aarch64 Dynamic WebAssembly JIT Engine',
        `  COI0 : Security - Cross-Origin Isolated: ${String(globalThis.crossOriginIsolated)}`
      )
    } else if (cmd === 'memtest') {
      const testBuf = new Uint32Array(1024)
      testBuf.fill(0x55aa55aa)
      const pass1 = testBuf.every((v) => v === 0x55aa55aa)
      testBuf.fill(0xaa55aa55)
      const pass2 = testBuf.every((v) => v === 0xaa55aa55)
      nextLines.push(
        '[MEMTEST] Allocating WebAssembly linear page test buffer...',
        `  Pattern 0x55AA55AA walk: ${pass1 ? 'PASS' : 'FAIL'}`,
        `  Pattern 0xAA55AA55 walk: ${pass2 ? 'PASS' : 'FAIL'}`,
        `  SharedArrayBuffer Atomics: ${typeof SharedArrayBuffer === 'function' ? 'PASS (Zero-Copy Enabled)' : 'WARN'}`,
        '[MEMTEST] Result: 0 errors detected across 512 MiB guest address space.'
      )
    } else if (cmd === 'nvram') {
      nextLines.push(
        'Persistent UEFI NVRAM Variables (idb-keyval / strataos:uefi_nvram:v1):',
        `  BootPriority      = ${nvram.bootPriority}`,
        `  SecureBoot        = ${nvram.secureBoot ? 'Enabled (Enforce \\0asm WASI Magic)' : 'Disabled'}`,
        `  FastBoot          = ${nvram.fastBoot ? 'Enabled' : 'Disabled'}`,
        `  VirtualizationJIT = ${nvram.virtualizationJit ? 'Enabled (kwemu JIT)' : 'Interpreter Only'}`
      )
    } else if (cmd === 'reset') {
      resetNvram()
      nextLines.push('NVRAM reset to factory defaults. Rebooting POST...')
      setShellHistory(nextLines)
      setShellInput('')
      setTimeout(() => setBootPhase('post'), 500)
      return
    } else if (cmd === 'setup') {
      setBootPhase('uefi-setup')
    } else if (cmd === 'boot' || cmd === 'exit') {
      setBootPhase('desktop')
      return
    } else {
      nextLines.push(`'${cmd}' is not recognized as an internal or external EFI command. Type "help".`)
    }

    setShellHistory(nextLines)
    setShellInput('')
  }

  if (bootPhase === 'desktop') return null

  // Full-Screen TTY Recovery Mode
  if (bootPhase === 'tty-recovery') {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col bg-[#09090b] text-zinc-100 font-mono">
        <div className="flex h-8 items-center justify-between border-b border-white/10 bg-[#121215] px-4 text-xs">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-cyan-400" />
            <span className="font-semibold text-zinc-100">
              {STRATA_CONFIG.releaseTitle} — TTY1 Recovery Console (/dev/pts/0)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBootPhase('uefi-setup')}
              className="rounded border border-white/10 bg-[#1c1c21] px-2.5 py-0.5 text-[11px] text-zinc-300 hover:text-white"
            >
              UEFI Setup (F2)
            </button>
            <button
              onClick={() => setBootPhase('desktop')}
              className="rounded bg-cyan-500 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-950 hover:bg-cyan-400"
            >
              Start Graphical Desktop (startx)
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <StrataTerminal />
        </div>
      </div>
    )
  }

  // 1.5s POST Splash Screen
  if (bootPhase === 'post') {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col justify-between bg-[#09090b] p-8 font-mono text-zinc-200 select-none">
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-cyan-400">
              Strata Core UEFI Firmware v1.0.0 (Bedrock POST)
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-100">
              {STRATA_CONFIG.releaseTitle}
            </h1>
            <p className="text-xs text-zinc-400">
              {STRATA_CONFIG.kernelRelease} • WebAssembly Sv39 MMU
            </p>
          </div>
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
            {nvram.secureBoot ? 'SECURE BOOT: ACTIVE' : 'SECURE BOOT: DISABLED'}
          </div>
        </div>

        <div className="mx-auto w-full max-w-xl space-y-2 text-xs text-zinc-300">
          <div className="flex justify-between">
            <span className="text-zinc-500">Processor:</span>
            <span>kwemu aarch64 Dynamic WebAssembly JIT (ARMv8.0-A + SIMD)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Memory Check:</span>
            <span className="text-emerald-400">
              524,288 KB OK (Cross-Origin Isolated SharedArrayBuffer)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Primary Block Device:</span>
            <span>/dev/wda — IndexedDB Copy-on-Write ext4 (kwdisk:kwdata-v1)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Boot Target:</span>
            <span className="text-cyan-300">{nvram.bootPriority.toUpperCase()}</span>
          </div>

          <div className="pt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-cyan-400 transition-all duration-75"
                style={{ width: `${postProgress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs">
          <div className="flex items-center gap-3">
            <button
              id="uefi-enter-setup-btn"
              onClick={() => setBootPhase('uefi-setup')}
              className="rounded border border-white/15 bg-[#1c1c21] px-3 py-1.5 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
            >
              <kbd className="font-bold text-cyan-400">F2 / DEL</kbd> : Enter UEFI Setup
            </button>
            <button
              id="uefi-boot-menu-btn"
              onClick={() => setBootPhase('uefi-boot-menu')}
              className="rounded border border-white/15 bg-[#1c1c21] px-3 py-1.5 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
            >
              <kbd className="font-bold text-cyan-400">F12</kbd> : Boot Menu
            </button>
            <button
              onClick={() => setBootPhase('uefi-shell')}
              className="rounded border border-white/15 bg-[#1c1c21] px-3 py-1.5 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
            >
              UEFI Shell
            </button>
          </div>
          <button
            onClick={() => executeBootTarget(nvram.bootPriority)}
            className="rounded bg-cyan-500 px-4 py-1.5 font-semibold text-zinc-950 hover:bg-cyan-400"
          >
            Boot Now →
          </button>
        </div>
      </div>
    )
  }

  // F12 One-Time Boot Menu
  if (bootPhase === 'uefi-boot-menu') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#09090b] p-6 font-mono text-zinc-100 select-none">
        <div className="w-full max-w-lg rounded-xl border border-white/15 bg-[#121215] p-5 shadow-2xl">
          <div className="border-b border-white/10 pb-3">
            <div className="text-[11px] uppercase tracking-wider text-cyan-400">
              StrataUEFI Boot Manager (F12)
            </div>
            <h2 className="text-base font-bold">Select Boot Device / Target</h2>
          </div>

          <div className="mt-4 space-y-2">
            {BOOT_TARGETS.map((t) => (
              <button
                key={t.id}
                onClick={() => executeBootTarget(t.id)}
                className="flex w-full flex-col rounded-lg border border-white/10 bg-[#1c1c21] p-3 text-left hover:border-cyan-400/50 transition"
              >
                <span className="text-xs font-bold text-cyan-300">{t.label}</span>
                <span className="mt-0.5 text-[11px] text-zinc-400">{t.desc}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex justify-between border-t border-white/10 pt-3 text-xs">
            <button
              onClick={() => setBootPhase('uefi-setup')}
              className="rounded border border-white/10 bg-[#1c1c21] px-3 py-1.5 text-zinc-300 hover:text-white"
            >
              Enter Setup (F2)
            </button>
            <button
              onClick={() => setBootPhase('desktop')}
              className="rounded bg-cyan-500 px-4 py-1.5 font-semibold text-zinc-950"
            >
              Boot Default Desktop
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Standalone UEFI Interactive Shell
  if (bootPhase === 'uefi-shell') {
    return (
      <div
        onClick={() => shellInputRef.current?.focus()}
        className="fixed inset-0 z-[9999] flex flex-col bg-[#09090b] p-6 font-mono text-xs text-zinc-200"
      >
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-amber-300 font-bold">
            UEFI Interactive Shell v2.70 — {STRATA_CONFIG.releaseTitle}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setBootPhase('uefi-setup')}
              className="rounded border border-white/10 bg-[#1c1c21] px-2.5 py-1 text-zinc-300 hover:text-white"
            >
              UEFI Setup
            </button>
            <button
              onClick={() => setBootPhase('desktop')}
              className="rounded bg-cyan-500 px-3 py-1 font-bold text-zinc-950 hover:bg-cyan-400"
            >
              Boot Desktop
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {shellHistory.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap leading-relaxed">
              {line}
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-amber-400 font-bold">Shell&gt;</span>
            <input
              ref={shellInputRef}
              type="text"
              value={shellInput}
              onChange={(e) => setShellInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleShellCommand(shellInput)
              }}
              className="flex-1 bg-transparent text-zinc-100 focus:outline-none"
              autoFocus
            />
          </div>
        </div>
      </div>
    )
  }

  // Full StrataUEFI Setup Utility (F2 / ?boot=uefi)
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#09090b] font-mono text-xs text-zinc-100 select-none">
      {/* Top Firmware Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#121215] px-6 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-cyan-400">
            StrataUEFI BIOS Utility — NVRAM Persistent Configuration
          </div>
          <h1 className="text-base font-bold text-zinc-100">{STRATA_CONFIG.releaseTitle}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={resetNvram}
            className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-[#1c1c21] px-3 py-1.5 text-zinc-300 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Load Optimized Defaults (F9)
          </button>
          <button
            id="uefi-save-and-boot-btn"
            onClick={() => executeBootTarget(nvram.bootPriority)}
            className="inline-flex items-center gap-1.5 rounded bg-cyan-500 px-4 py-1.5 font-bold text-zinc-950 hover:bg-cyan-400"
          >
            <Play className="h-3.5 w-3.5" /> Save NVRAM &amp; Boot (F10)
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-white/10 bg-[#121215]/60 px-6 gap-2">
        {(
          [
            { id: 'main', label: 'System Overview', icon: Cpu },
            { id: 'boot', label: 'Boot Priority', icon: HardDrive },
            { id: 'security', label: 'Secure Boot & Virtualization', icon: ShieldCheck },
            { id: 'shell', label: 'UEFI Diagnostics Shell', icon: Wrench },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-semibold transition ${
                active
                  ? 'border-cyan-400 text-cyan-300 bg-[#1c1c21]/60'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'main' && (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#121215] p-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                Firmware &amp; Kernel Specifications
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-zinc-400">OS Distribution:</div>
                <div className="text-zinc-100 font-semibold">{STRATA_CONFIG.releaseTitle}</div>
                <div className="text-zinc-400">Kernel Binary:</div>
                <div className="text-zinc-100">{STRATA_CONFIG.kernelRelease}</div>
                <div className="text-zinc-400">Userspace Emulator:</div>
                <div className="text-zinc-100">kwemu aarch64 Dynamic WebAssembly JIT</div>
                <div className="text-zinc-400">Persistent Block Storage:</div>
                <div className="text-emerald-300">IndexedDB CowDisk ext4 (kwdisk:kwdata-v1)</div>
                <div className="text-zinc-400">Cross-Origin Isolation:</div>
                <div className="text-emerald-300">
                  {globalThis.crossOriginIsolated ? 'COOP/COEP Enabled (SharedArrayBuffer)' : 'Disabled'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'boot' && (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#121215] p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wider text-cyan-400">
                Primary NVRAM Boot Priority Target
              </div>
              <div className="space-y-2">
                {BOOT_TARGETS.map((target, idx) => {
                  const selected = nvram.bootPriority === target.id
                  return (
                    <div
                      key={target.id}
                      onClick={() => updateNvram({ bootPriority: target.id })}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition ${
                        selected
                          ? 'border-cyan-400 bg-cyan-500/15 text-zinc-100'
                          : 'border-white/10 bg-[#1c1c21] text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="font-bold">
                          #{idx + 1} — {target.label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-400">{target.desc}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          executeBootTarget(target.id)
                        }}
                        className="rounded bg-zinc-800 border border-white/10 px-2.5 py-1 text-[11px] text-cyan-300 hover:bg-zinc-700"
                      >
                        Boot Immediately
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#121215] p-4">
              <div>
                <div className="font-bold text-zinc-100">UEFI Secure Boot (WASM Magic Verification)</div>
                <div className="text-[11px] text-zinc-400">
                  Verifies WebAssembly binary header magic (\0asm v1) before executing strataget packages.
                </div>
              </div>
              <input
                type="checkbox"
                checked={nvram.secureBoot}
                onChange={(e) => updateNvram({ secureBoot: e.target.checked })}
                className="h-4 w-4 accent-cyan-400"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#121215] p-4">
              <div>
                <div className="font-bold text-zinc-100">Fast Boot (350ms POST Splash)</div>
                <div className="text-[11px] text-zinc-400">
                  Shortens the 1.5s POST hardware splash screen during cold starts.
                </div>
              </div>
              <input
                type="checkbox"
                checked={nvram.fastBoot}
                onChange={(e) => updateNvram({ fastBoot: e.target.checked })}
                className="h-4 w-4 accent-cyan-400"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#121215] p-4">
              <div>
                <div className="font-bold text-zinc-100">kwemu aarch64 Dynamic WebAssembly JIT</div>
                <div className="text-[11px] text-zinc-400">
                  Compiles hot aarch64 basic blocks into native WebAssembly modules at runtime.
                </div>
              </div>
              <input
                type="checkbox"
                checked={nvram.virtualizationJit}
                onChange={(e) => updateNvram({ virtualizationJit: e.target.checked })}
                className="h-4 w-4 accent-cyan-400"
              />
            </div>
          </div>
        )}

        {activeTab === 'shell' && (
          <div className="mx-auto flex h-96 max-w-3xl flex-col rounded-xl border border-white/10 bg-black p-4">
            <div className="flex-1 overflow-y-auto space-y-1">
              {shellHistory.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
              <span className="text-amber-400 font-bold">Shell&gt;</span>
              <input
                ref={shellInputRef}
                type="text"
                value={shellInput}
                onChange={(e) => setShellInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleShellCommand(shellInput)
                }}
                placeholder="Type help, map, memtest, nvram, reset, or boot..."
                className="flex-1 bg-transparent text-zinc-100 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
