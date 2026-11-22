import React, { useEffect, useState, useCallback } from 'react';
import { useOsStore } from '../state/osStore';
import {
  createTimeMachineSnapshot,
  listTimeMachineSnapshots,
  restoreTimeMachineSnapshot,
  deleteTimeMachineSnapshot,
  type TimeMachineRecord,
} from '../kernel/timeMachine';
import {
  History,
  Plus,
  RotateCcw,
  Trash2,
  X,
  Sun,
  HardDrive,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

export const TimeMachineDrawer: React.FC = () => {
  const open = useOsStore((s) => s.notificationDrawerOpen);
  const setOpen = useOsStore((s) => s.setNotificationDrawerOpen);
  const wakeLockActive = useOsStore((s) => s.wakeLockActive);
  const setWakeLockActive = useOsStore((s) => s.setWakeLockActive);
  const nvram = useOsStore((s) => s.nvram);

  const [snapshots, setSnapshots] = useState<TimeMachineRecord[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listTimeMachineSnapshots();
      setSnapshots(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  const handleCreateSnapshot = async () => {
    setBusy(true);
    setStatusMsg('Compressing /root and /var/lib/strataget with fflate...');
    try {
      const snap = await createTimeMachineSnapshot(
        labelInput.trim() || `Bedrock Snapshot #${snapshots.length + 1}`
      );
      setLabelInput('');
      await refresh();
      setStatusMsg(
        `Created "${snap.label}" (${snap.fileCount} files, ${(snap.sizeBytes / 1024).toFixed(1)} KB)`
      );
    } catch (err) {
      setStatusMsg(`Snapshot error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (snap: TimeMachineRecord) => {
    if (!snap.id) return;
    setBusy(true);
    setStatusMsg(`Restoring "${snap.label}" to Linux ext4 filesystem...`);
    try {
      const res = await restoreTimeMachineSnapshot(snap.id);
      setStatusMsg(`Restored ${res.restoredFiles} files from "${snap.label}"`);
    } catch (err) {
      setStatusMsg(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    await deleteTimeMachineSnapshot(id);
    await refresh();
  };

  const toggleWakeLock = async () => {
    try {
      if (!wakeLockActive && 'wakeLock' in navigator) {
        await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<unknown> } }).wakeLock.request('screen');
        setWakeLockActive(true);
        setStatusMsg('Screen Wake Lock engaged — kernel tasks will not sleep.');
      } else {
        setWakeLockActive(false);
        setStatusMsg('Screen Wake Lock released.');
      }
    } catch {
      // Fallback simulated indicator if browser blocks WakeLock in headless/iframe
      setWakeLockActive(!wakeLockActive);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[8200] bg-black/40 flex justify-end"
      onClick={() => setOpen(false)}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-96 h-full pt-8 pb-4 px-4 strata-chrome-blur bg-[#121215]/95 border-l border-white/10 flex flex-col justify-between select-none shadow-2xl"
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-sky-400" />
              <div>
                <h2 className="text-xs font-semibold text-zinc-100">
                  Time Machine &amp; System Control
                </h2>
                <p className="text-[10px] text-zinc-400">
                  Dexie + fflate Compressed Linux Filesystem Snapshots
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick System Controls */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={toggleWakeLock}
              className={`p-2.5 rounded-lg border text-left transition-colors ${
                wakeLockActive
                  ? 'bg-sky-500/15 border-sky-500/30 text-sky-200'
                  : 'bg-[#1c1c21] border-white/10 text-zinc-300 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Sun className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[9px] font-mono uppercase">
                  {wakeLockActive ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
              <div className="text-[11px] font-medium">Screen Wake Lock</div>
              <div className="text-[9px] text-zinc-500">Prevent sleep during compile</div>
            </button>

            <div className="p-2.5 rounded-lg bg-[#1c1c21] border border-white/10 text-zinc-300">
              <div className="flex items-center justify-between mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[9px] font-mono text-emerald-400">
                  {nvram.secureBoot ? 'ENFORCED' : 'DISABLED'}
                </span>
              </div>
              <div className="text-[11px] font-medium">UEFI Secure Boot</div>
              <div className="text-[9px] text-zinc-500">WASM signature policy</div>
            </div>
          </div>

          {/* Create Snapshot Bar */}
          <div className="p-3 rounded-lg bg-[#1c1c21] border border-white/10 mb-3">
            <div className="text-[11px] font-medium text-zinc-200 mb-2 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-sky-400" />
              Create Instant Snapshot
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="Snapshot label (e.g., Pre-experiment)"
                className="flex-1 bg-zinc-900 border border-white/10 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-sky-500/50"
              />
              <button
                onClick={handleCreateSnapshot}
                disabled={busy}
                className="px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center gap-1 shrink-0"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>

          {statusMsg && (
            <div className="mb-3 px-2.5 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-300 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{statusMsg}</span>
            </div>
          )}

          {/* Snapshots List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {snapshots.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-xs">
                No Time Machine snapshots saved yet. Click Save above to snapshot `/root` and installed packages.
              </div>
            ) : (
              snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="p-2.5 rounded-lg bg-[#1c1c21] border border-white/10 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-200 truncate">{snap.label}</div>
                    <div className="text-[10px] font-mono text-zinc-400">
                      {new Date(snap.createdAt).toLocaleTimeString()} • {snap.fileCount} files •{' '}
                      {(snap.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleRestore(snap)}
                      disabled={busy}
                      className="px-2 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[10px] font-medium flex items-center gap-1"
                      title="Restore Snapshot"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                    <button
                      onClick={() => handleDelete(snap.id)}
                      disabled={busy}
                      className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                      title="Delete Snapshot"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>StrataOS v1.0.0 (Bedrock)</span>
          <span>Dexie IndexedDB Engine</span>
        </div>
      </aside>
    </div>
  );
};
