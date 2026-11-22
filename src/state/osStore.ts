import { get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { InstalledPackageRecord, KernelStatus } from '../kernel/types'
import { STRATA_CONFIG } from '../strata.config'

export type NativeAppId =
  | 'terminal'
  | 'studio'
  | 'store'
  | 'files'
  | 'copilot'
  | 'gpu-studio'
  | 'bytescope'
  | 'paint93'
  | 'termarcade'
  | 'code'
  | 'monitor'
  | 'settings'

export type AppId = NativeAppId | `wasm:${string}`

export type SnapZone = 'left' | 'right' | 'maximize' | null

export type WallpaperId =
  | 'obsidian-grid'
  | 'carbon-slate'
  | 'midnight-aurora'
  | 'deep-abyss'
  | 'webgpu-compute'

export type AccentColorId = 'cyan' | 'emerald' | 'amber' | 'sky' | 'rose'

export type BootPhase =
  | 'post'
  | 'uefi-setup'
  | 'uefi-boot-menu'
  | 'uefi-shell'
  | 'tty-recovery'
  | 'desktop'

export type BootTarget = 'desktop' | 'tty-recovery' | 'uefi-shell' | 'safe-mode'

export interface UefiNvramSettings {
  bootPriority: BootTarget
  secureBoot: boolean
  fastBoot: boolean
  postTimeoutMs: number
  virtualizationJit: boolean
}

export interface WindowInstance {
  id: string
  appId: AppId
  title: string
  icon: string
  workspace: 1 | 2 | 3
  x: number
  y: number
  width: number
  height: number
  minWidth: number
  minHeight: number
  zIndex: number
  isMinimized: boolean
  isMaximized: boolean
  snapState: 'left' | 'right' | null
  /** KWin "Keep Above Others" — boosts z-index above normal windows */
  keepAbove?: boolean
  prevBounds?: { x: number; y: number; width: number; height: number }
  wasmPkgId?: string
  initialPayload?: {
    filePath?: string
    args?: string[]
  }
}

export type ThemeMode = 'dark' | 'light' | 'system'
export type PanelPosition = 'bottom' | 'top'

export interface OsSettings {
  wallpaper: WallpaperId
  accentColor: AccentColorId
  performanceMode: boolean
  terminalFontSize: number
  showKernelTimestamps: boolean
  webgpuWallpaperEnabled: boolean
  /** Breeze Dark (default) or Breeze Light color scheme */
  theme: ThemeMode
  /** Plasma accent color (hex). Default Plasma Blue #3daee9 */
  accentHex: string
  /** KWin Wobbly Windows desktop effect (CSS skew while dragging) */
  wobblyWindows: boolean
  /** Floating Plasma Panel screen edge */
  panelPosition: PanelPosition
}

export type PlasmoidType = 'sysmon' | 'clock' | 'note' | 'quicklaunch'

export interface PlasmoidInstance {
  id: string
  type: PlasmoidType
  x: number
  y: number
  w: number
  h: number
  data?: { text?: string; analog?: boolean; apps?: AppId[] }
}

/** Plasma panel geometry (px) shared by panel, window manager & snapping */
export const PANEL_HEIGHT = 44
export const PANEL_MARGIN = 6

/** Usable desktop work area. When `flush`, the panel is docked to the screen edge (maximized window present). */
export function getWorkArea(position: PanelPosition, flush: boolean) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const reserved = flush ? PANEL_HEIGHT : PANEL_HEIGHT + PANEL_MARGIN * 2
  return {
    x: 0,
    y: position === 'top' ? reserved : 0,
    width: vw,
    height: vh - reserved,
  }
}

export interface NativeAppMeta {
  id: NativeAppId
  name: string
  subtitle: string
  icon: string
  category: 'Core' | 'Developer' | 'AI & GPU' | 'Extras'
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
}

export const NATIVE_APPS: Record<NativeAppId, NativeAppMeta> = {
  terminal: {
    id: 'terminal',
    name: 'Strata Terminal',
    subtitle: 'WebGL Linux 7.3 PTY Shell',
    icon: 'Terminal',
    category: 'Core',
    defaultWidth: 820,
    defaultHeight: 520,
    minWidth: 460,
    minHeight: 300,
  },
  studio: {
    id: 'studio',
    name: 'Strata Studio',
    subtitle: 'Multi-Pane Browser IDE & WASM Scaffolder',
    icon: 'Layout',
    category: 'Developer',
    defaultWidth: 980,
    defaultHeight: 630,
    minWidth: 640,
    minHeight: 420,
  },
  store: {
    id: 'store',
    name: 'Strata Store',
    subtitle: 'Community WASM & WASI Package Center',
    icon: 'Package',
    category: 'Core',
    defaultWidth: 940,
    defaultHeight: 620,
    minWidth: 640,
    minHeight: 440,
  },
  files: {
    id: 'files',
    name: 'Strata Files',
    subtitle: 'Virtualized ext4 Explorer & Host Mounts',
    icon: 'FolderTree',
    category: 'Core',
    defaultWidth: 880,
    defaultHeight: 560,
    minWidth: 560,
    minHeight: 380,
  },
  copilot: {
    id: 'copilot',
    name: 'Strata Copilot',
    subtitle: 'Chrome Built-in AI & Kernel Assistant',
    icon: 'Bot',
    category: 'AI & GPU',
    defaultWidth: 780,
    defaultHeight: 580,
    minWidth: 480,
    minHeight: 380,
  },
  'gpu-studio': {
    id: 'gpu-studio',
    name: 'Strata GPU Studio',
    subtitle: 'WebGPU WGSL Compute Playground & Benchmark',
    icon: 'Gpu',
    category: 'AI & GPU',
    defaultWidth: 920,
    defaultHeight: 600,
    minWidth: 600,
    minHeight: 420,
  },
  bytescope: {
    id: 'bytescope',
    name: 'ByteScope',
    subtitle: 'AudioWorklet Bytebeat Synth & X-Y Oscilloscope',
    icon: 'Waveform',
    category: 'Extras',
    defaultWidth: 800,
    defaultHeight: 540,
    minWidth: 520,
    minHeight: 380,
  },
  paint93: {
    id: 'paint93',
    name: 'StrataPaint 93',
    subtitle: 'Pixel Studio with Direct /root PNG Export',
    icon: 'Palette',
    category: 'Extras',
    defaultWidth: 760,
    defaultHeight: 540,
    minWidth: 500,
    minHeight: 380,
  },
  termarcade: {
    id: 'termarcade',
    name: 'TermArcade',
    subtitle: 'Retro Matrix & Logic Grid Arcade',
    icon: 'Gamepad',
    category: 'Extras',
    defaultWidth: 720,
    defaultHeight: 520,
    minWidth: 480,
    minHeight: 380,
  },
  code: {
    id: 'code',
    name: 'Strata Code',
    subtitle: 'Lightweight CodeMirror 6 Buffer Editor',
    icon: 'Code2',
    category: 'Developer',
    defaultWidth: 860,
    defaultHeight: 560,
    minWidth: 520,
    minHeight: 360,
  },
  monitor: {
    id: 'monitor',
    name: 'Strata Monitor',
    subtitle: 'Kernel Telemetry, dmesg & Time Machine',
    icon: 'Activity',
    category: 'Core',
    defaultWidth: 880,
    defaultHeight: 580,
    minWidth: 560,
    minHeight: 380,
  },
  settings: {
    id: 'settings',
    name: 'Strata Settings',
    subtitle: 'Compositor, UEFI NVRAM & Platform Primitives',
    icon: 'Sliders',
    category: 'Core',
    defaultWidth: 760,
    defaultHeight: 540,
    minWidth: 500,
    minHeight: 380,
  },
}

const PREFS_STORAGE_KEY = 'strataos:preferences:v1'
const NVRAM_STORAGE_KEY = 'strataos:uefi_nvram:v1'
const PLASMOIDS_STORAGE_KEY = 'strataos:plasmoids:v1'
const PROOF_CARD_STORAGE_KEY = 'strataos:proof_card_dismissed:v1'

interface PersistedPreferences {
  settings: OsSettings
  pinnedApps: AppId[]
}

const DEFAULT_SETTINGS: OsSettings = {
  wallpaper: STRATA_CONFIG.defaultTheme.wallpaper,
  accentColor: STRATA_CONFIG.defaultTheme.accentColor,
  performanceMode: false,
  terminalFontSize: 13,
  showKernelTimestamps: true,
  webgpuWallpaperEnabled: false,
  theme: 'dark',
  accentHex: '#3daee9',
  wobblyWindows: false,
  panelPosition: 'bottom',
}

const DEFAULT_NVRAM: UefiNvramSettings = {
  bootPriority: 'desktop',
  secureBoot: true,
  fastBoot: false,
  postTimeoutMs: STRATA_CONFIG.uefiPostDelayMs,
  virtualizationJit: true,
}

const DEFAULT_PINNED_APPS: AppId[] = STRATA_CONFIG.pinnedDockApps as AppId[]

export interface OsState {
  // Firmware & Boot state
  bootPhase: BootPhase
  nvram: UefiNvramSettings

  // Kernel status
  kernelStatus: KernelStatus
  kernelBootStage: string
  workerLatencyMs: number

  // Workspaces & windows
  activeWorkspace: 1 | 2 | 3
  windows: Record<string, WindowInstance>
  windowOrder: string[]
  focusedWindowId: string | null
  topZIndex: number
  activeSnapPreview: SnapZone

  // Overlays, Drawers & Extras
  commandPaletteOpen: boolean
  aboutModalOpen: boolean
  missionControlOpen: boolean
  notificationDrawerOpen: boolean
  melt93Active: boolean
  strataPetActive: boolean
  wakeLockActive: boolean

  // Cross-app AI & IDE bridge
  studioDraft: { filePath: string; content: string } | null
  lastTerminalError: string

  // Installed strataget packages (synced from /etc/strata/installed.json)
  installedPackages: InstalledPackageRecord[]
  pinnedApps: AppId[]

  // Settings
  settings: OsSettings

  // KDE Plasma desktop state
  editMode: boolean
  peekDesktop: boolean
  proofCardDismissed: boolean
  plasmoids: PlasmoidInstance[]

  setEditMode: (on: boolean) => void
  setPeekDesktop: (on: boolean) => void
  dismissProofCard: () => void
  addPlasmoid: (type: PlasmoidType) => void
  updatePlasmoid: (id: string, partial: Partial<Omit<PlasmoidInstance, 'id' | 'type'>>) => void
  removePlasmoid: (id: string) => void
  toggleKeepAbove: (windowId: string) => void
  // Actions
  setBootPhase: (phase: BootPhase) => void
  updateNvram: (partial: Partial<UefiNvramSettings>) => void
  resetNvram: () => void

  setKernelStatus: (status: KernelStatus, stage: string) => void
  setWorkerLatency: (ms: number) => void
  setActiveWorkspace: (ws: 1 | 2 | 3) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setAboutModalOpen: (open: boolean) => void
  setMissionControlOpen: (open: boolean) => void
  toggleMissionControl: () => void
  setNotificationDrawerOpen: (open: boolean) => void
  toggleNotificationDrawer: () => void
  setMelt93Active: (active: boolean) => void
  setStrataPetActive: (active: boolean) => void
  setWakeLockActive: (active: boolean) => void
  setStudioDraft: (draft: { filePath: string; content: string } | null) => void
  setLastTerminalError: (err: string) => void
  setActiveSnapPreview: (zone: SnapZone) => void

  setInstalledPackages: (pkgs: InstalledPackageRecord[]) => void
  openApp: (
    appId: AppId,
    payload?: { filePath?: string; args?: string[]; title?: string; icon?: string }
  ) => void
  closeWindow: (windowId: string) => void
  closeAppByPkgId: (pkgId: string) => void
  focusWindow: (windowId: string) => void
  toggleMinimizeWindow: (windowId: string) => void
  toggleMaximizeWindow: (windowId: string) => void
  commitWindowBounds: (
    windowId: string,
    bounds: { x: number; y: number; width: number; height: number },
    snap?: 'left' | 'right' | 'maximize' | null
  ) => void
  updateSettings: (partial: Partial<OsSettings>) => void
  togglePinApp: (appId: AppId) => void
  hydratePreferences: () => Promise<void>
}

function savePreferencesToIdb(settings: OsSettings, pinnedApps: AppId[]) {
  const payload: PersistedPreferences = JSON.parse(JSON.stringify({ settings, pinnedApps }))
  void idbSet(PREFS_STORAGE_KEY, payload).catch(() => {})
}

function saveNvramToIdb(nvram: UefiNvramSettings) {
  void idbSet(NVRAM_STORAGE_KEY, nvram).catch(() => {})
}

function savePlasmoidsToIdb(plasmoids: PlasmoidInstance[]) {
  void idbSet(PLASMOIDS_STORAGE_KEY, JSON.parse(JSON.stringify(plasmoids))).catch(() => {})
}

const PLASMOID_DEFAULT_SIZE: Record<PlasmoidType, { w: number; h: number }> = {
  sysmon: { w: 260, h: 150 },
  clock: { w: 180, h: 180 },
  note: { w: 220, h: 180 },
  quicklaunch: { w: 220, h: 96 },
}

function getInitialBootPhase(): BootPhase {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const bootParam = params.get('boot')?.toLowerCase()
    if (bootParam === 'uefi' || bootParam === 'setup') return 'uefi-setup'
    if (bootParam === 'menu') return 'uefi-boot-menu'
    if (bootParam === 'shell') return 'uefi-shell'
    if (bootParam === 'tty') return 'tty-recovery'
    if (bootParam === 'desktop' || bootParam === 'skip') return 'desktop'
  }
  return STRATA_CONFIG.enableUEFI ? 'post' : 'desktop'
}

const initialTerminalWindow: WindowInstance = {
  id: 'win-terminal',
  appId: 'terminal',
  title: 'Strata Terminal — /dev/pts/0',
  icon: 'Terminal',
  workspace: 1,
  x: 84,
  y: 52,
  width: 820,
  height: 520,
  minWidth: 460,
  minHeight: 300,
  zIndex: 10,
  isMinimized: false,
  isMaximized: false,
  snapState: null,
}

export const useOsStore = create<OsState>()(
  immer((set, get) => ({
    bootPhase: getInitialBootPhase(),
    nvram: DEFAULT_NVRAM,

    kernelStatus: 'booting',
    kernelBootStage: 'Initializing WebWorker...',
    workerLatencyMs: 0.4,

    activeWorkspace: 1,
    windows: {
      [initialTerminalWindow.id]: initialTerminalWindow,
    },
    windowOrder: [initialTerminalWindow.id],
    focusedWindowId: initialTerminalWindow.id,
    topZIndex: 11,
    activeSnapPreview: null,

    commandPaletteOpen: false,
    aboutModalOpen: false,
    missionControlOpen: false,
    notificationDrawerOpen: false,
    melt93Active: false,
    strataPetActive: false,
    wakeLockActive: false,

    studioDraft: null,
    lastTerminalError: '',

    installedPackages: [],
    pinnedApps: DEFAULT_PINNED_APPS,
    settings: DEFAULT_SETTINGS,

    editMode: false,
    peekDesktop: false,
    proofCardDismissed: true,
    plasmoids: [],

    setEditMode: (on) =>
      set((state) => {
        state.editMode = on
      }),

    setPeekDesktop: (on) =>
      set((state) => {
        state.peekDesktop = on
      }),

    dismissProofCard: () => {
      set((state) => {
        state.proofCardDismissed = true
      })
      void idbSet(PROOF_CARD_STORAGE_KEY, true).catch(() => {})
    },

    addPlasmoid: (type) =>
      set((state) => {
        const size = PLASMOID_DEFAULT_SIZE[type]
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
        const n = state.plasmoids.length
        state.plasmoids.push({
          id: `plasmoid-${type}-${Date.now().toString(36)}`,
          type,
          x: Math.max(120, vw - size.w - 32 - (n % 4) * 28),
          y: 40 + (n % 6) * 36,
          w: size.w,
          h: size.h,
          data:
            type === 'note'
              ? { text: 'strataget install pixelsynth\n→ reload → still here ✓' }
              : type === 'clock'
                ? { analog: true }
                : type === 'quicklaunch'
                  ? { apps: ['terminal', 'store', 'gpu-studio', 'copilot'] }
                  : undefined,
        })
        savePlasmoidsToIdb(state.plasmoids)
      }),

    updatePlasmoid: (id, partial) =>
      set((state) => {
        const p = state.plasmoids.find((x) => x.id === id)
        if (!p) return
        Object.assign(p, partial)
        savePlasmoidsToIdb(state.plasmoids)
      }),

    removePlasmoid: (id) =>
      set((state) => {
        state.plasmoids = state.plasmoids.filter((x) => x.id !== id)
        savePlasmoidsToIdb(state.plasmoids)
      }),

    toggleKeepAbove: (windowId) =>
      set((state) => {
        const win = state.windows[windowId]
        if (!win) return
        win.keepAbove = !win.keepAbove
      }),
    setBootPhase: (phase) =>
      set((state) => {
        state.bootPhase = phase
      }),

    updateNvram: (partial) =>
      set((state) => {
        state.nvram = { ...state.nvram, ...partial }
        saveNvramToIdb(state.nvram)
      }),

    resetNvram: () =>
      set((state) => {
        state.nvram = { ...DEFAULT_NVRAM }
        saveNvramToIdb(state.nvram)
      }),

    setKernelStatus: (status, stage) =>
      set((state) => {
        state.kernelStatus = status
        state.kernelBootStage = stage
      }),

    setWorkerLatency: (ms) =>
      set((state) => {
        state.workerLatencyMs = ms
      }),

    setActiveWorkspace: (ws) => {
      const applyChange = () =>
        set((state) => {
          state.activeWorkspace = ws
          let bestId: string | null = null
          let bestZ = -1
          for (const id of state.windowOrder) {
            const w = state.windows[id]
            if (w && w.workspace === ws && !w.isMinimized && w.zIndex > bestZ) {
              bestZ = w.zIndex
              bestId = id
            }
          }
          state.focusedWindowId = bestId
        })

      if (typeof document !== 'undefined' && 'startViewTransition' in document) {
        const vt = (
          document as Document & {
            startViewTransition: (cb: () => void) => {
              ready?: Promise<void>
              finished?: Promise<void>
            }
          }
        ).startViewTransition(() => {
          applyChange()
        })
        vt?.ready?.catch(() => {})
        vt?.finished?.catch(() => {})
      } else {
        applyChange()
      }
    },

    setCommandPaletteOpen: (open) =>
      set((state) => {
        state.commandPaletteOpen = open
      }),

    toggleCommandPalette: () =>
      set((state) => {
        state.commandPaletteOpen = !state.commandPaletteOpen
      }),

    setAboutModalOpen: (open) =>
      set((state) => {
        state.aboutModalOpen = open
      }),

    setMissionControlOpen: (open) => {
      const apply = () =>
        set((state) => {
          state.missionControlOpen = open
        })
      if (typeof document !== 'undefined' && 'startViewTransition' in document) {
        const vt = (
          document as Document & {
            startViewTransition: (cb: () => void) => {
              ready?: Promise<void>
              finished?: Promise<void>
            }
          }
        ).startViewTransition(apply)
        vt?.ready?.catch(() => {})
        vt?.finished?.catch(() => {})
      } else {
        apply()
      }
    },

    toggleMissionControl: () => {
      const next = !get().missionControlOpen
      get().setMissionControlOpen(next)
    },

    setNotificationDrawerOpen: (open) =>
      set((state) => {
        state.notificationDrawerOpen = open
      }),

    toggleNotificationDrawer: () =>
      set((state) => {
        state.notificationDrawerOpen = !state.notificationDrawerOpen
      }),

    setMelt93Active: (active) =>
      set((state) => {
        state.melt93Active = active
      }),

    setStrataPetActive: (active) =>
      set((state) => {
        state.strataPetActive = active
      }),

    setWakeLockActive: (active) =>
      set((state) => {
        state.wakeLockActive = active
      }),

    setStudioDraft: (draft) =>
      set((state) => {
        state.studioDraft = draft
      }),

    setLastTerminalError: (err) =>
      set((state) => {
        state.lastTerminalError = err
      }),

    setActiveSnapPreview: (zone) =>
      set((state) => {
        state.activeSnapPreview = zone
      }),

    setInstalledPackages: (pkgs) =>
      set((state) => {
        state.installedPackages = pkgs
      }),

    openApp: (appId, payload) =>
      set((state) => {
        const winId = `win-${appId}`
        const existing = state.windows[winId]
        const nextZ = state.topZIndex + 1
        state.topZIndex = nextZ

        if (existing) {
          existing.isMinimized = false
          existing.zIndex = nextZ
          existing.workspace = state.activeWorkspace
          if (payload) {
            existing.initialPayload = {
              filePath: payload.filePath,
              args: payload.args,
            }
          }
          state.focusedWindowId = winId
          return
        }

        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800
        const openCount = state.windowOrder.length
        const cascadeOffset = (openCount % 6) * 24

        if (appId.startsWith('wasm:')) {
          const pkgId = appId.slice(5)
          const installed = state.installedPackages.find((p) => p.id === pkgId)
          const width = Math.min(860, vw - 80)
          const height = Math.min(560, vh - 120)
          const x = Math.max(24, Math.round((vw - width) / 2) + cascadeOffset - 40)
          const y = Math.max(44, Math.round((vh - height) / 2) + cascadeOffset - 40)

          const newWin: WindowInstance = {
            id: winId,
            appId,
            title: payload?.title ?? (installed ? `${installed.name} v${installed.version}` : pkgId),
            icon: payload?.icon ?? installed?.icon ?? 'Box',
            workspace: state.activeWorkspace,
            x,
            y,
            width,
            height,
            minWidth: 480,
            minHeight: 340,
            zIndex: nextZ,
            isMinimized: false,
            isMaximized: false,
            snapState: null,
            wasmPkgId: pkgId,
            initialPayload: payload ? { filePath: payload.filePath, args: payload.args } : undefined,
          }
          state.windows[winId] = newWin
          state.windowOrder.push(winId)
          state.focusedWindowId = winId
          return
        }

        const meta = NATIVE_APPS[appId as NativeAppId]
        if (!meta) return

        const width = Math.min(meta.defaultWidth, vw - 60)
        const height = Math.min(meta.defaultHeight, vh - 110)
        const x = Math.max(24, Math.round((vw - width) / 2) + cascadeOffset - 40)
        const y = Math.max(42, Math.round((vh - height) / 2) + cascadeOffset - 36)

        const newWin: WindowInstance = {
          id: winId,
          appId,
          title: meta.name,
          icon: meta.icon,
          workspace: state.activeWorkspace,
          x,
          y,
          width,
          height,
          minWidth: meta.minWidth,
          minHeight: meta.minHeight,
          zIndex: nextZ,
          isMinimized: false,
          isMaximized: false,
          snapState: null,
          initialPayload: payload ? { filePath: payload.filePath, args: payload.args } : undefined,
        }
        state.windows[winId] = newWin
        state.windowOrder.push(winId)
        state.focusedWindowId = winId
      }),

    closeWindow: (windowId) =>
      set((state) => {
        delete state.windows[windowId]
        state.windowOrder = state.windowOrder.filter((id) => id !== windowId)
        if (state.focusedWindowId === windowId) {
          let bestId: string | null = null
          let bestZ = -1
          for (const id of state.windowOrder) {
            const w = state.windows[id]
            if (w && w.workspace === state.activeWorkspace && !w.isMinimized && w.zIndex > bestZ) {
              bestZ = w.zIndex
              bestId = id
            }
          }
          state.focusedWindowId = bestId
        }
      }),

    closeAppByPkgId: (pkgId) => {
      const winId = `win-wasm:${pkgId}`
      get().closeWindow(winId)
    },

    focusWindow: (windowId) =>
      set((state) => {
        const win = state.windows[windowId]
        if (!win) return
        if (state.focusedWindowId === windowId && !win.isMinimized) return
        const nextZ = state.topZIndex + 1
        state.topZIndex = nextZ
        win.zIndex = nextZ
        win.isMinimized = false
        state.focusedWindowId = windowId
      }),

    toggleMinimizeWindow: (windowId) =>
      set((state) => {
        const win = state.windows[windowId]
        if (!win) return
        win.isMinimized = !win.isMinimized
        if (!win.isMinimized) {
          const nextZ = state.topZIndex + 1
          state.topZIndex = nextZ
          win.zIndex = nextZ
          state.focusedWindowId = windowId
        } else if (state.focusedWindowId === windowId) {
          state.focusedWindowId = null
        }
      }),

    toggleMaximizeWindow: (windowId) =>
      set((state) => {
        const win = state.windows[windowId]
        if (!win) return
        const nextZ = state.topZIndex + 1
        state.topZIndex = nextZ
        win.zIndex = nextZ
        state.focusedWindowId = windowId

        if (win.isMaximized || win.snapState) {
          if (win.prevBounds) {
            win.x = win.prevBounds.x
            win.y = win.prevBounds.y
            win.width = win.prevBounds.width
            win.height = win.prevBounds.height
          }
          win.isMaximized = false
          win.snapState = null
        } else {
          win.prevBounds = {
            x: win.x,
            y: win.y,
            width: win.width,
            height: win.height,
          }
          win.isMaximized = true
          win.snapState = null
        }
      }),

    commitWindowBounds: (windowId, bounds, snap) =>
      set((state) => {
        const win = state.windows[windowId]
        if (!win) return

        if (snap === 'maximize') {
          if (!win.isMaximized && !win.snapState) {
            win.prevBounds = { x: win.x, y: win.y, width: win.width, height: win.height }
          }
          win.isMaximized = true
          win.snapState = null
          return
        }

        if (snap === 'left' || snap === 'right') {
          if (!win.isMaximized && !win.snapState) {
            win.prevBounds = { x: win.x, y: win.y, width: win.width, height: win.height }
          }
          const area = getWorkArea(state.settings.panelPosition, false)
          const gap = PANEL_MARGIN
          const halfW = Math.floor((area.width - gap * 3) / 2)
          win.isMaximized = false
          win.snapState = snap
          win.x = snap === 'left' ? gap : halfW + gap * 2
          win.y = area.y + gap
          win.width = halfW
          win.height = Math.max(win.minHeight, area.height - gap)
          return
        }

        const area = getWorkArea(state.settings.panelPosition, false)
        win.isMaximized = false
        win.snapState = null
        win.x = Math.round(bounds.x)
        win.y = Math.min(
          Math.max(area.y, Math.round(bounds.y)),
          Math.max(area.y, area.y + area.height - 40)
        )
        win.width = Math.max(win.minWidth, Math.round(bounds.width))
        win.height = Math.max(win.minHeight, Math.round(bounds.height))
      }),

    updateSettings: (partial) =>
      set((state) => {
        state.settings = { ...state.settings, ...partial }
        savePreferencesToIdb(state.settings, state.pinnedApps)
      }),

    togglePinApp: (appId) =>
      set((state) => {
        if (state.pinnedApps.includes(appId)) {
          state.pinnedApps = state.pinnedApps.filter((id) => id !== appId)
        } else {
          state.pinnedApps.push(appId)
        }
        savePreferencesToIdb(state.settings, state.pinnedApps)
      }),

    hydratePreferences: async () => {
      try {
        const [savedPrefs, savedNvram, savedPlasmoids, proofDismissed] = await Promise.all([
          idbGet<PersistedPreferences>(PREFS_STORAGE_KEY),
          idbGet<UefiNvramSettings>(NVRAM_STORAGE_KEY),
          idbGet<PlasmoidInstance[]>(PLASMOIDS_STORAGE_KEY),
          idbGet<boolean>(PROOF_CARD_STORAGE_KEY),
        ])
        set((state) => {
          if (savedPrefs?.settings) {
            state.settings = { ...DEFAULT_SETTINGS, ...savedPrefs.settings }
          }
          if (Array.isArray(savedPrefs?.pinnedApps) && savedPrefs.pinnedApps.length > 0) {
            state.pinnedApps = savedPrefs.pinnedApps
          }
          if (savedNvram) {
            state.nvram = { ...DEFAULT_NVRAM, ...savedNvram }
          }
          if (Array.isArray(savedPlasmoids)) {
            state.plasmoids = savedPlasmoids
          }
          state.proofCardDismissed = proofDismissed === true
        })
      } catch {
        // ignore IndexedDB errors
        set((state) => {
          state.proofCardDismissed = false
        })
      }
    },
  }))
)
