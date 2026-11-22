import React from 'react';
import { useOsStore } from '../state/osStore';
import { AppIcon } from './AppIcon';
import { Layers, X, Plus, Maximize2 } from 'lucide-react';

export const MissionControl: React.FC = () => {
  const missionControlOpen = useOsStore((s) => s.missionControlOpen);
  const setMissionControlOpen = useOsStore((s) => s.setMissionControlOpen);
  const activeWorkspace = useOsStore((s) => s.activeWorkspace);
  const setWorkspace = useOsStore((s) => s.setActiveWorkspace);
  const windows = useOsStore((s) => s.windows);
  const focusWindow = useOsStore((s) => s.focusWindow);
  const closeWindow = useOsStore((s) => s.closeWindow);
  const openApp = useOsStore((s) => s.openApp);

  if (!missionControlOpen) return null;

  const allWindows = Object.values(windows);

  const handleSelectWindow = (winId: string, ws: 1 | 2 | 3) => {
    setWorkspace(ws);
    focusWindow(winId);
    setMissionControlOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[8500] strata-chrome-blur bg-black/80 flex flex-col p-6 select-none animate-in fade-in duration-150"
      onClick={() => setMissionControlOpen(false)}
    >
      {/* Header & Workspace Switcher Bar */}
      <div
        className="flex items-center justify-between max-w-5xl w-full mx-auto mb-6 px-4 py-2.5 rounded-xl bg-[#121215]/95 border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold text-zinc-100">Mission Control &amp; Workspaces</span>
          <span className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-900 border border-white/5">
            Alt+Tab / Esc
          </span>
        </div>

        <div className="flex items-center gap-2">
          {([1, 2, 3] as const).map((ws) => {
            const count = allWindows.filter((w) => w.workspace === ws).length;
            const active = activeWorkspace === ws;
            return (
              <button
                key={ws}
                onClick={() => setWorkspace(ws)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/5'
                }`}
              >
                <span>Workspace {ws}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/40 text-zinc-400">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setMissionControlOpen(false)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
          title="Close Mission Control"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Workspaces Grid */}
      <div
        className="flex-1 max-w-6xl w-full mx-auto grid grid-cols-3 gap-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {([1, 2, 3] as const).map((ws) => {
          const wsWindows = allWindows
            .filter((w) => w.workspace === ws)
            .sort((a, b) => b.zIndex - a.zIndex);
          const isCurrent = activeWorkspace === ws;

          return (
            <div
              key={ws}
              className={`rounded-xl border p-4 flex flex-col transition-all ${
                isCurrent
                  ? 'bg-[#121215]/95 border-sky-500/30 shadow-xl'
                  : 'bg-[#0e0e11]/90 border-white/10 hover:border-white/15'
              }`}
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
                <button
                  onClick={() => {
                    setWorkspace(ws);
                    setMissionControlOpen(false);
                  }}
                  className="flex items-center gap-2 text-xs font-semibold text-zinc-200 hover:text-sky-300"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isCurrent ? 'bg-sky-400' : 'bg-zinc-600'
                    }`}
                  />
                  Workspace {ws}
                  {isCurrent && (
                    <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                      ACTIVE
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setWorkspace(ws);
                    openApp('terminal');
                    setMissionControlOpen(false);
                  }}
                  className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-zinc-200"
                  title={`Open Terminal in Workspace ${ws}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {wsWindows.length === 0 ? (
                <div
                  onClick={() => {
                    setWorkspace(ws);
                    setMissionControlOpen(false);
                  }}
                  className="flex-1 flex flex-col items-center justify-center text-zinc-600 text-xs py-12 cursor-pointer hover:text-zinc-400"
                >
                  No active windows in Workspace {ws}
                </div>
              ) : (
                <div className="space-y-2.5 overflow-y-auto">
                  {wsWindows.map((win) => (
                    <div
                      key={win.id}
                      onClick={() => handleSelectWindow(win.id, ws)}
                      className="group p-3 rounded-lg bg-[#1c1c21] border border-white/10 hover:border-sky-500/40 cursor-pointer transition-all flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0">
                          <AppIcon appId={win.appId} className="w-3.5 h-3.5 text-sky-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-100 truncate">
                            {win.title}
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500">
                            {win.width}×{win.height}{' '}
                            {win.isMinimized ? '• Minimized' : win.isMaximized ? '• Maximized' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                        <span className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-sky-400">
                          <Maximize2 className="w-3 h-3" />
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            closeWindow(win.id);
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                          title="Close Window"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
