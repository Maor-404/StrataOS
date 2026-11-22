import {
  Check,
  Gauge,
  Keyboard,
  Monitor,
  Palette,
  Terminal,
} from 'lucide-react'
import React from 'react'
import {
  useOsStore,
  type AccentColorId,
  type WallpaperId,
} from '../../state/osStore'

const WALLPAPERS: Array<{ id: WallpaperId; name: string; desc: string; previewStyle: string }> = [
  {
    id: 'obsidian-grid',
    name: 'Obsidian Matte',
    desc: 'Deep charcoal micro-grain studio surface',
    previewStyle: 'linear-gradient(145deg, #09090b 0%, #111318 55%, #08090c 100%)',
  },
  {
    id: 'carbon-slate',
    name: 'Carbon Slate',
    desc: 'Tactile dark slate with subtle radial falloff',
    previewStyle: 'radial-gradient(circle at 20% 20%, #161b22 0%, #090b0e 75%)',
  },
  {
    id: 'midnight-aurora',
    name: 'Nordic Horizon',
    desc: 'Muted deep teal-slate atmospheric glow',
    previewStyle: 'radial-gradient(circle at 80% 15%, #0d2128 0%, #090c10 65%, #060709 100%)',
  },
  {
    id: 'deep-abyss',
    name: 'Pure OLED Abyss',
    desc: 'Zero-luminance pitch black for maximum contrast',
    previewStyle: 'linear-gradient(180deg, #040405 0%, #000000 100%)',
  },
]

const ACCENT_COLORS: Array<{ id: AccentColorId; label: string; hex: string }> = [
  { id: 'cyan', label: 'Strata Cyan', hex: '#22d3ee' },
  { id: 'emerald', label: 'Kernel Emerald', hex: '#34d399' },
  { id: 'amber', label: 'Phosphor Amber', hex: '#fbbf24' },
  { id: 'sky', label: 'Ice Sky', hex: '#38bdf8' },
  { id: 'rose', label: 'Signal Rose', hex: '#fb7185' },
]

const SHORTCUTS = [
  { keys: 'Ctrl + K / Alt + Space', desc: 'Open Command Palette & Fuzzy Launcher' },
  { keys: 'Alt + 1 / 2 / 3', desc: 'Switch Active Desktop Workspace (1–3)' },
  { keys: 'Ctrl + S', desc: 'Save Active Buffer in Strata Code to Linux ext4 FS' },
  { keys: 'Drag Window to Left / Right Edge', desc: '50% Split-Screen Tile Snap' },
  { keys: 'Drag Window to Top Edge', desc: 'Maximize Window to Workspace' },
]

export const StrataSettings: React.FC = () => {
  const settings = useOsStore((s) => s.settings)
  const updateSettings = useOsStore((s) => s.updateSettings)

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-950 p-5 text-zinc-100 select-none space-y-6">
      {/* Performance Mode Section */}
      <section className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15 text-cyan-300">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Compositor Performance Mode (120fps Low-VRAM)
              </h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                Disables <code className="font-mono text-cyan-300">backdrop-filter: blur()</code> across
                all desktop windows, top bar, and dock for instant GPU rasterization on lower-end hardware.
              </p>
            </div>
          </div>

          <button
            id="toggle-performance-mode"
            onClick={() =>
              updateSettings({ performanceMode: !settings.performanceMode })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition ${
              settings.performanceMode
                ? 'border-cyan-400 bg-cyan-500'
                : 'border-white/15 bg-zinc-800'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-zinc-950 transition ${
                settings.performanceMode ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Procedural Dark Wallpapers */}
      <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Monitor className="h-4 w-4 text-cyan-400" /> Procedural Dark Desktop Surfaces
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {WALLPAPERS.map((wp) => {
            const active = settings.wallpaper === wp.id
            return (
              <button
                key={wp.id}
                onClick={() => updateSettings({ wallpaper: wp.id })}
                className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition ${
                  active
                    ? 'border-cyan-500/50 bg-zinc-900'
                    : 'border-white/10 bg-zinc-900/50 hover:bg-zinc-900'
                }`}
              >
                <div
                  className="h-10 w-14 shrink-0 rounded border border-white/15"
                  style={{ background: wp.previewStyle }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-100">{wp.name}</span>
                    {active && <Check className="h-3.5 w-3.5 text-cyan-400" />}
                  </div>
                  <div className="truncate text-[11px] text-zinc-400">{wp.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* System Accent & Terminal Preferences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <Palette className="h-4 w-4 text-cyan-400" /> System Accent Color
          </div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((acc) => {
              const active = settings.accentColor === acc.id
              return (
                <button
                  key={acc.id}
                  onClick={() => updateSettings({ accentColor: acc.id })}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    active
                      ? 'border-white/40 bg-zinc-800 text-zinc-100 font-semibold'
                      : 'border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: acc.hex }}
                  />
                  <span>{acc.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <Terminal className="h-4 w-4 text-cyan-400" /> Terminal & Telemetry
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300">PTY Font Size ({settings.terminalFontSize}px)</span>
              <input
                type="range"
                min={11}
                max={20}
                value={settings.terminalFontSize}
                onChange={(e) =>
                  updateSettings({ terminalFontSize: Number(e.target.value) })
                }
                className="w-28 accent-cyan-400"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-300">Show dmesg Kernel Timestamps</span>
              <input
                type="checkbox"
                checked={settings.showKernelTimestamps}
                onChange={(e) =>
                  updateSettings({ showKernelTimestamps: e.target.checked })
                }
                className="h-4 w-4 accent-cyan-400"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Keyboard Shortcuts Reference */}
      <section className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Keyboard className="h-4 w-4 text-cyan-400" /> Desktop Keyboard Shortcuts
        </div>
        <div className="divide-y divide-white/5 text-xs">
          {SHORTCUTS.map((sc) => (
            <div key={sc.keys} className="flex items-center justify-between py-2">
              <span className="text-zinc-300">{sc.desc}</span>
              <kbd className="rounded border border-white/10 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-cyan-300">
                {sc.keys}
              </kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
