import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { kernelClient } from '../../kernel/kernelClient'
import type { DmesgEntry, KernelMetrics } from '../../kernel/types'
import { useOsStore } from '../../state/osStore'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatUptime(ms: number): string {
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const StrataMonitor: React.FC = () => {
  const workerLatencyMs = useOsStore((s) => s.workerLatencyMs)
  const showTimestamps = useOsStore((s) => s.settings.showKernelTimestamps)

  const [metrics, setMetrics] = useState<KernelMetrics | null>(null)
  const [dmesgLogs, setDmesgLogs] = useState<DmesgEntry[]>([])
  const [filterQuery, setFilterQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<'all' | 'notice' | 'warn' | 'err'>('all')
  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, persisted: false })
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const refreshTelemetry = useCallback(async () => {
    try {
      const [m, logs] = await Promise.all([
        kernelClient.getMetrics(),
        kernelClient.getDmesgLogs(),
      ])
      setMetrics(m)
      setDmesgLogs(logs)

      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate()
        const persisted = navigator.storage.persisted
          ? await navigator.storage.persisted()
          : false
        setStorageInfo({
          usage: est.usage ?? 0,
          quota: est.quota ?? 1024 * 1024 * 1024,
          persisted,
        })
      }
    } catch {
      // ignore if rebooting
    }
  }, [])

  useEffect(() => {
    void refreshTelemetry()
    const timer = setInterval(() => {
      void refreshTelemetry()
    }, 1500)
    const unsubDmesg = kernelClient.subscribeDmesg((newEntries) => {
      setDmesgLogs((prev) => [...prev, ...newEntries].slice(-5000))
    })
    return () => {
      clearInterval(timer)
      unsubDmesg()
    }
  }, [refreshTelemetry])

  const filteredLogs = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    return dmesgLogs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false
      if (!q) return true
      return (
        entry.raw.toLowerCase().includes(q) ||
        entry.subsystem.toLowerCase().includes(q)
      )
    })
  }, [dmesgLogs, filterQuery, levelFilter])

  const logParentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => logParentRef.current,
    estimateSize: () => 24,
    overscan: 16,
  })

  const handleRequestPersistentStorage = async () => {
    if (navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist()
      setStorageInfo((prev) => ({ ...prev, persisted: granted }))
      setStatusMsg(
        granted
          ? 'Browser granted Persistent Storage lock for IndexedDB ext4 blocks'
          : 'Persistent Storage request was declined by browser'
      )
    }
  }

  const handleFlushExt4 = async () => {
    setStatusMsg('Flushing ext4 disk buffers to IndexedDB...')
    const ok = await kernelClient.syncDisk()
    setStatusMsg(ok ? 'ext4 disk blocks flushed and committed to IndexedDB.' : 'Sync completed.')
    await refreshTelemetry()
  }

  const handleFactoryResetDisk = async () => {
    setConfirmReset(false)
    setStatusMsg('Wiping IndexedDB ext4 data disk and rebooting Linux kernel...')
    await kernelClient.factoryResetDisk()
    setStatusMsg('Factory reset complete. Fresh ext4 disk mounted.')
    await refreshTelemetry()
  }

  const quotaPercent =
    storageInfo.quota > 0
      ? Math.min(100, Math.max(0.5, (storageInfo.usage / storageInfo.quota) * 100))
      : 1

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 select-none">
      {/* Telemetry Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 border-b border-white/10 bg-zinc-900/60 p-3 text-xs">
        <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-3">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            <span>Worker Heartbeat</span>
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-300">
            {workerLatencyMs.toFixed(2)} ms
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-zinc-400">
            Uptime: {formatUptime(metrics?.uptimeMs ?? 0)}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-3">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            <span>Kernel RAM & CPUs</span>
            <Cpu className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-cyan-300">
            {metrics?.memoryMiB ?? 512} MiB
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-zinc-400">
            {metrics?.cpus ?? 1} vCPU • Boot {Math.round(metrics?.compileMs ?? 0)}ms
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-3">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            <span>kwemu aarch64 JIT</span>
            <Zap className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-amber-300">
            {metrics?.jitCompiled ?? 0} <span className="text-xs font-normal">blocks</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-zinc-400">
            Live: {metrics?.jitLive ?? 0} • {Math.round(metrics?.jitCompileMs ?? 0)}ms JIT time
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-3">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            <span>ext4 Block I/O</span>
            <HardDrive className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div className="mt-1 font-mono text-lg font-bold text-zinc-100">
            {metrics?.blockFlushes ?? 0} <span className="text-xs font-normal text-zinc-400">commits</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-zinc-400">
            R: {formatBytes(metrics?.bytesRead ?? 0)} • W: {formatBytes(metrics?.bytesWritten ?? 0)}
          </div>
        </div>
      </div>

      {/* Browser Storage Quota & Persistent Disk Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-900/30 px-4 py-2.5 text-xs">
        <div className="flex flex-1 items-center gap-3 min-w-[260px]">
          <Database className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
              <span className="text-zinc-300">
                IndexedDB Quota (<span className="text-cyan-300">kwdisk:kwdata-v1</span>)
              </span>
              <span className="text-zinc-400">
                {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-cyan-400 transition-all"
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleRequestPersistentStorage()}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition ${
              storageInfo.persisted
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                : 'border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {storageInfo.persisted ? 'Persistent Storage Locked' : 'Enable Persistent Storage'}
          </button>

          <button
            onClick={() => void handleFlushExt4()}
            className="inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            <RefreshCw className="h-3.5 w-3.5 text-cyan-400" /> Sync ext4
          </button>

          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/25"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Disk
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded border border-red-500/50 bg-red-950/50 px-2 py-0.5">
              <span className="text-[11px] text-red-200">Wipe ext4?</span>
              <button
                onClick={() => void handleFactoryResetDisk()}
                className="rounded bg-red-500 px-2 py-0.5 text-[11px] font-bold text-zinc-950"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-1.5 text-[11px] text-zinc-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Virtualized dmesg Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/70 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
            dmesg Ring Buffer ({filteredLogs.length} lines)
          </span>
          <div className="flex items-center gap-1 rounded bg-zinc-950 p-0.5 border border-white/10">
            {(['all', 'notice', 'warn', 'err'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase transition ${
                  levelFilter === lvl
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter kernel stream..."
            className="w-56 rounded border border-white/10 bg-zinc-950 pl-7 pr-2.5 py-0.5 font-mono text-xs text-zinc-100 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Virtualized dmesg Stream */}
      <div
        ref={logParentRef}
        className="flex-1 overflow-y-auto bg-[#09090b] p-2 font-mono text-xs select-text"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const log = filteredLogs[virtualRow.index]
            const levelColor =
              log.level === 'err'
                ? 'text-red-400'
                : log.level === 'warn'
                ? 'text-amber-300'
                : log.level === 'notice'
                ? 'text-cyan-300'
                : 'text-zinc-300'

            return (
              <div
                key={log.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-center gap-2 whitespace-nowrap px-2 hover:bg-zinc-900/80 rounded"
              >
                {showTimestamps && (
                  <span className="text-emerald-400/80 shrink-0">[{log.timestamp}]</span>
                )}
                <span className="w-24 shrink-0 truncate text-zinc-500">{log.subsystem}:</span>
                <span className={`truncate ${levelColor}`}>{log.message}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer Status */}
      <div className="flex items-center justify-between border-t border-white/10 bg-zinc-900/80 px-3 py-1 font-mono text-[11px] text-zinc-400">
        <span className="truncate">{statusMsg ?? metrics?.kernelBanner}</span>
        <span className="text-emerald-400 shrink-0">
          COOP/COEP Isolated: {String(globalThis.crossOriginIsolated)}
        </span>
      </div>
    </div>
  )
}
