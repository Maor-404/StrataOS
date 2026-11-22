import {
  ArrowUpDown,
  Bot,
  Check,
  Cpu,
  Edit3,
  Flame,
  Gauge,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sparkles,
  Sun,
  Terminal,
  Waves,
} from 'lucide-react'
import React from 'react'
import {
  useOsStore,
  type AccentColorId,
  type ThemeMode,
  type WallpaperId,
} from '../../state/osStore'

const WALLPAPERS: Array<{ id: WallpaperId; name: string; desc: string; previewStyle: string }> = [
  {
    id: 'obsidian-grid',
    name: 'Obsidian Matte',
    desc: 'Deep charcoal micro-grain studio surface',
    previewStyle: 'linear-gradient(145deg, #1b1e20 0%, #111318 55%, #08090c 100%)',
  },
  {
    id: 'carbon-slate',
    name: 'Carbon Slate',
    desc: 'Tactile dark slate with subtle radial falloff',
    previewStyle: 'radial-gradient(circle at 20% 20%, #1e2733 0%, #101318 75%)',
  },
  {
    id: 'midnight-aurora',
    name: 'Nordic Horizon',
    desc: 'Muted deep teal-slate atmospheric glow',
    previewStyle: 'radial-gradient(circle at 80% 15%, #0d2a36 0%, #10151b 65%, #080a0d 100%)',
  },
  {
    id: 'deep-abyss',
    name: 'Pure OLED Abyss',
    desc: 'Zero-luminance pitch black for maximum contrast',
    previewStyle: 'linear-gradient(180deg, #060709 0%, #000000 100%)',
  },
]

const ACCENT_PRESETS: Array<{ id: AccentColorId; label: string; hex: string }> = [
  { id: 'sky', label: 'Plasma Blue', hex: '#3daee9' },
  { id: 'cyan', label: 'Strata Cyan', hex: '#22d3ee' },
  { id: 'emerald', label: 'Kernel Emerald', hex: '#10b981' },
  { id: 'amber', label: 'Phosphor Amber', hex: '#f59e0b' },
  { id: 'rose', label: 'Breeze Crimson', hex: '#da4453' },
]

const SHORTCUTS = [
  { keys: 'Alt + Space / Ctrl + K', desc: 'Open KRunner (Apps, /root, strataget, Inline Math)' },
  { keys: 'Ctrl + Up / Alt + Tab', desc: 'Open Plasma Overview & Virtual Desktops 1–3' },
  { keys: 'Alt + 1 / 2 / 3', desc: 'Switch Active Virtual Desktop (1–3)' },
  { keys: 'Right-Click Desktop', desc: 'Enter Desktop Edit Mode (Add & Drag Plasmoids)' },
  { keys: 'F2 / DEL (During POST)', desc: 'Enter StrataUEFI Firmware Setup Utility' },
  { keys: 'Ctrl + S', desc: 'Save Active Buffer in Strata Studio / Code to Linux ext4 FS' },
  { keys: 'Drag Window to Left / Right / Top', desc: 'KWin 50% Split-Screen Tile or Flush Maximize' },
]

export const StrataSettings: React.FC = () => {
  const settings = useOsStore((s) => s.settings)
  const updateSettings = useOsStore((s) => s.updateSettings)
  const webgpuWallpaperEnabled = settings.webgpuWallpaperEnabled
  const setWebgpuWallpaper = (val: boolean) => updateSettings({ webgpuWallpaperEnabled: val })
  const wakeLockActive = useOsStore((s) => s.wakeLockActive)
  const setWakeLockActive = useOsStore((s) => s.setWakeLockActive)
  const strataPetActive = useOsStore((s) => s.strataPetActive)
  const setStrataPetActive = useOsStore((s) => s.setStrataPetActive)
  const setMelt93Active = useOsStore((s) => s.setMelt93Active)
  const setBootPhase = useOsStore((s) => s.setBootPhase)
  const setEditMode = useOsStore((s) => s.setEditMode)

  const sysSchemeLabel =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'Currently light'
      : 'Currently dark'

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--breeze-base)] p-5 text-[var(--breeze-text)] select-none space-y-5">
      {/* KDE Plasma 6 Breeze Theme, Accent & KWin Effects */}
      <section className="rounded-xl border border-[var(--breeze-border)] bg-[var(--breeze-view)] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--breeze-text-muted)]">
            <Sparkles className="h-4 w-4 plasma-accent-text" aria-hidden="true" />
            KDE Plasma 6 Breeze Appearance &amp; KWin
          </div>
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-2.5 py-1 text-[11px] font-medium hover:border-[var(--plasma-accent)] transition cursor-pointer"
          >
            <Edit3 className="h-3 w-3 plasma-accent-text" aria-hidden="true" />
            Enter Desktop Edit Mode
          </button>
        </div>

        {/* Three-State Color Scheme Control (Breeze Dark / Breeze Light / System) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold">Global Breeze Color Scheme</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'dark', label: 'Breeze Dark', sub: '#1b1e20', icon: Moon },
                  { id: 'light', label: 'Breeze Light', sub: '#eff0f1', icon: Sun },
                  { id: 'system', label: 'System', sub: sysSchemeLabel, icon: Monitor },
                ] as Array<{ id: ThemeMode; label: string; sub: string; icon: typeof Moon }>
              ).map((opt) => {
                const Icon = opt.icon
                const active = settings.theme === opt.id
                return (
                  <button
                    key={opt.id}
                    id={`theme-option-${opt.id}`}
                    type="button"
                    onClick={() => updateSettings({ theme: opt.id })}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition cursor-pointer ${
                      active
                        ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                        : 'border-[var(--breeze-border)] bg-[var(--breeze-base)] hover:border-[var(--breeze-border-strong)]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
                      {active && <Check className="h-3.5 w-3.5 plasma-accent-text" />}
                    </div>
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div className="truncate font-mono text-[10px] text-[var(--breeze-text-muted)]">
                      {opt.sub}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Accent Color Picker + Auto-Contrast Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Plasma Accent Color</span>
              <span className="rounded-md plasma-accent-fill px-2 py-0.5 font-mono text-[10px] font-semibold">
                {settings.accentHex.toUpperCase()} • Auto Contrast
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((acc) => {
                const active = settings.accentHex.toLowerCase() === acc.hex.toLowerCase()
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => updateSettings({ accentColor: acc.id, accentHex: acc.hex })}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition cursor-pointer ${
                      active
                        ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)] font-semibold'
                        : 'border-[var(--breeze-border)] bg-[var(--breeze-base)] text-[var(--breeze-text-muted)] hover:text-[var(--breeze-text)]'
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-white/20"
                      style={{ backgroundColor: acc.hex }}
                    />
                    <span>{acc.label}</span>
                  </button>
                )
              })}

              <label className="flex items-center gap-1.5 rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-2 py-1 text-[11px] cursor-pointer hover:border-[var(--plasma-accent)]">
                <Palette className="h-3.5 w-3.5 plasma-accent-text" aria-hidden="true" />
                <span>Custom</span>
                <input
                  id="plasma-accent-picker"
                  type="color"
                  value={settings.accentHex}
                  onChange={(e) => updateSettings({ accentHex: e.target.value })}
                  aria-label="Pick custom Plasma accent color"
                  className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Wobbly Windows + Panel Edge Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
          <button
            id="toggle-wobbly-windows"
            type="button"
            onClick={() => updateSettings({ wobblyWindows: !settings.wobblyWindows })}
            className={`flex items-center justify-between rounded-lg border p-3 text-left transition cursor-pointer ${
              settings.wobblyWindows
                ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                : 'border-[var(--breeze-border)] bg-[var(--breeze-base)]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Waves className="h-4 w-4 plasma-accent-text shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">KWin Wobbly Windows</div>
                <div className="text-[11px] text-[var(--breeze-text-muted)]">
                  Springy CSS skew inertia while dragging windows
                </div>
              </div>
            </div>
            <span className="rounded bg-black/25 px-2 py-0.5 font-mono text-[10px]">
              {settings.wobblyWindows ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateSettings({
                panelPosition: settings.panelPosition === 'bottom' ? 'top' : 'bottom',
              })
            }
            className="flex items-center justify-between rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] p-3 text-left hover:border-[var(--plasma-accent)] transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <ArrowUpDown className="h-4 w-4 plasma-accent-text shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">Floating Plasma Panel Edge</div>
                <div className="text-[11px] text-[var(--breeze-text-muted)]">
                  De-floats flush automatically when a window maximizes
                </div>
              </div>
            </div>
            <span className="rounded bg-black/25 px-2 py-0.5 font-mono text-[10px] uppercase">
              {settings.panelPosition}
            </span>
          </button>
        </div>
      </section>

      {/* Performance Mode Section */}
      <section className="rounded-xl border border-[var(--breeze-border)] bg-[var(--breeze-view)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--breeze-border)] bg-[var(--breeze-base)] plasma-accent-text">
              <Gauge className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                Compositor Performance Mode (120fps Low-VRAM)
              </h3>
              <p className="mt-0.5 text-xs text-[var(--breeze-text-muted)]">
                Disables <code className="font-mono plasma-accent-text">backdrop-filter: blur(20px)</code> on
                Plasma Panel, KRunner &amp; overlays for instant GPU rasterization.
              </p>
            </div>
          </div>

          <button
            id="toggle-performance-mode"
            type="button"
            onClick={() =>
              updateSettings({ performanceMode: !settings.performanceMode })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition ${
              settings.performanceMode
                ? 'plasma-accent-fill border-transparent'
                : 'border-[var(--breeze-border-strong)] bg-[var(--breeze-base)]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                settings.performanceMode ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* v1.0.0 Bedrock Exclusive Capabilities & Extras */}
      <section className="rounded-xl border border-[var(--breeze-border)] bg-[var(--breeze-view)] p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--breeze-text-muted)]">
          <Cpu className="h-4 w-4 plasma-accent-text" aria-hidden="true" />
          Bedrock v1.0.0 Hardware, Firmware &amp; Extras
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <button
            type="button"
            onClick={() => setWebgpuWallpaper(!webgpuWallpaperEnabled)}
            className={`p-3 rounded-lg border text-left flex items-center justify-between transition cursor-pointer ${
              webgpuWallpaperEnabled
                ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                : 'border-[var(--breeze-border)] bg-[var(--breeze-base)]'
            }`}
          >
            <div>
              <div className="font-semibold">WebGPU Compute Wallpaper</div>
              <div className="text-[11px] text-[var(--breeze-text-muted)]">
                120fps WGSL particle simulation
              </div>
            </div>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/25">
              {webgpuWallpaperEnabled ? 'ENABLED' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWakeLockActive(!wakeLockActive)}
            className={`p-3 rounded-lg border text-left flex items-center justify-between transition cursor-pointer ${
              wakeLockActive
                ? 'border-emerald-500/50 bg-emerald-500/10'
                : 'border-[var(--breeze-border)] bg-[var(--breeze-base)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">Screen Wake Lock API</div>
                <div className="text-[11px] text-[var(--breeze-text-muted)]">
                  Prevent browser sleep on builds
                </div>
              </div>
            </div>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/25">
              {wakeLockActive ? 'LOCKED' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStrataPetActive(!strataPetActive)}
            className={`p-3 rounded-lg border text-left flex items-center justify-between transition cursor-pointer ${
              strataPetActive
                ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                : 'border-[var(--breeze-border)] bg-[var(--breeze-base)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 plasma-accent-text shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">StrataPet Penguin Companion</div>
                <div className="text-[11px] text-[var(--breeze-text-muted)]">
                  Draggable Linux kernel mascot
                </div>
              </div>
            </div>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/25">
              {strataPetActive ? 'ACTIVE' : 'OFF'}
            </span>
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMelt93Active(true)}
              className="flex-1 p-3 rounded-lg border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-left flex items-center gap-2 transition cursor-pointer"
            >
              <Flame className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">Launch Melt93</div>
                <div className="text-[10px] text-[var(--breeze-text-muted)]">
                  CRT glitch toy (ESC exit)
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setBootPhase('uefi-setup')}
              className="flex-1 p-3 rounded-lg border border-[var(--plasma-accent)]/40 bg-[var(--breeze-base)] hover:bg-[var(--breeze-hover)] text-left flex items-center gap-2 transition cursor-pointer"
            >
              <Shield className="h-4 w-4 plasma-accent-text shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">StrataUEFI</div>
                <div className="text-[10px] text-[var(--breeze-text-muted)]">Enter BIOS Setup</div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Wallpapers & Terminal Preferences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-[var(--breeze-border)] bg-[var(--breeze-view)] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--breeze-text-muted)]">
            <Monitor className="h-4 w-4 plasma-accent-text" aria-hidden="true" /> Desktop Surfaces
          </div>
          <div className="grid grid-cols-2 gap-2">
            {WALLPAPERS.map((wp) => {
              const active = settings.wallpaper === wp.id
              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => updateSettings({ wallpaper: wp.id })}
                  className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition cursor-pointer ${
                    active
                      ? 'border-[var(--plasma-accent)] bg-[var(--breeze-hover)]'
                      : 'border-[var(--breeze-border)] bg-[var(--breeze-base)]'
                  }`}
                >
                  <div
                    className="h-8 w-10 shrink-0 rounded border border-white/15"
                    style={{ background: wp.previewStyle }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-xs font-semibold">{wp.name}</span>
                      {active && <Check className="h-3 w-3 plasma-accent-text shrink-0" />}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--breeze-border)] bg-[var(--breeze-view)] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--breeze-text-muted)]">
            <Terminal className="h-4 w-4 plasma-accent-text" aria-hidden="true" />
            Terminal &amp; Telemetry
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span>PTY Font Size ({settings.terminalFontSize}px)</span>
              <input
                type="range"
                min={11}
                max={20}
                value={settings.terminalFontSize}
                onChange={(e) =>
                  updateSettings({ terminalFontSize: Number(e.target.value) })
                }
                className="w-28"
                style={{ accentColor: 'var(--plasma-accent)' }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span>Show dmesg Kernel Timestamps</span>
              <input
                type="checkbox"
                checked={settings.showKernelTimestamps}
                onChange={(e) =>
                  updateSettings({ showKernelTimestamps: e.target.checked })
                }
                className="h-4 w-4"
                style={{ accentColor: 'var(--plasma-accent)' }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Keyboard Shortcuts Reference */}
      <section className="rounded-xl border border-[var(--breeze-border)] bg-[var(--breeze-view)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--breeze-text-muted)]">
          <Keyboard className="h-4 w-4 plasma-accent-text" aria-hidden="true" />
          Plasma &amp; KWin Keyboard Shortcuts
        </div>
        <div className="divide-y divide-[var(--breeze-border)] text-xs">
          {SHORTCUTS.map((sc) => (
            <div key={sc.keys} className="flex items-center justify-between gap-2 py-2">
              <span className="text-[var(--breeze-text-muted)]">{sc.desc}</span>
              <kbd className="shrink-0 rounded border border-[var(--breeze-border)] bg-[var(--breeze-base)] px-2 py-0.5 font-mono text-[11px] plasma-accent-text">
                {sc.keys}
              </kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
