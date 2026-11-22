import { get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { InstalledPackageRecord, KernelStatus } from '../kernel/types'

export type NativeAppId = 'terminal' | 'store' | 'files' | 'code' | 'monitor' | 'settings'
export type AppId = NativeAppId | `wasm:${string}`

export type SnapZone = 'left' | 'right' | 'maximize' | null

export type WallpaperId = 'obsidian-grid' | 'carbon-slate' | 'midnight-aurora' | 'deep-abyss'
export type AccentColorId = 'cyan' | 'emerald' | 'amber' | 'sky' | 'rose'

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
  prevBounds?: { x: number; y: number; width: number; height: number }
  wasmPkgId?: string
  initialPayload?: {
    filePath?: string
    args?: string[]
  }
}

export interface OsSettings {
  wallpaper: WallpaperId
  accentColor: AccentColorId
  performanceMode: boolean // Disables backdrop-filter: blur() across all windows
  terminalFontSize: number
  showKernelTimestamps: boolean
}

export interface NativeAppMeta {
  id: NativeAppId
  name: string
  subtitle: string
  icon: string
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
    defaultWidth: 820,
    defaultHeight: 520,
    minWidth: 460,
    minHeight: 300,
  },
  store: {
    id: 'store',
    name: 'Strata Store',
    subtitle: 'Community WASM & WASI Package Center',
    icon: 'Package',
    defaultWidth: 940,
    defaultHeight: 620,
    minWidth: 640,
    minHeight: 440,
  },
  files: {
    id: 'files',
    name: 'Strata Files',
    subtitle: 'Virtualized Linux ext4 Explorer',
    icon: 'FolderTree',
    defaultWidth: 860,
    defaultHeight: 560,
    minWidth: 560,
    minHeight: 380,
  },
  code: {
    id: 'code',
    name: 'Strata Code',
    subtitle: 'Lightweight CodeMirror 6 Workbench',
    icon: 'Code2',
    defaultWidth: 880,
    defaultHeight: 580,
    minWidth: 540,
    minHeight: 360,
  },
  monitor: {
    id: 'monitor',
    name: 'Strata Monitor',
    subtitle: 'Kernel Telemetry, dmesg & Disk Quota',
    icon: 'Activity',
    defaultWidth: 860,
    defaultHeight: 560,
    minWidth: 560,
    minHeight: 380,
  },
  settings: {
    id: 'settings',
    name: 'Strata Settings',
    subtitle: 'Compositor, Performance & Appearance',
    icon: 'Sliders',
    defaultWidth: 720,
    defaultHeight: 520,
    minWidth: 500,
    minHeight: 380,
  },
}

const PREFS_STORAGE_KEY = 'strataos:preferences:v1'

interface PersistedPreferences {
  settings: OsSettings
  pinnedApps: AppId[]
}

const DEFAULT_SETTINGS: OsSettings = {
  wallpaper: 'obsidian-grid',
  accentColor: 'cyan',
  performanceMode: false,
  terminalFontSize: 13,
  showKernelTimestamps: true,
}

const DEFAULT_PINNED_APPS: AppId[] = [
  'terminal',
  'store',
  'files',
  'code',
  'monitor',
  'settings',
]

export interface OsState {
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

  // Command palette & system menus
  commandPaletteOpen: boolean
  aboutModalOpen: boolean

  // Installed strataget packages (synced from /etc/strata/installed.json)
  installedPackages: InstalledPackageRecord[]
  pinnedApps: AppId[]

  // Settings
  settings: OsSettings

  // Actions
  setKernelStatus: (status: KernelStatus, stage: string) => void
  setWorkerLatency: (ms: number) => void
  setActiveWorkspace: (ws: 1 | 2 | 3) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setAboutModalOpen: (open: boolean) => void
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
  const payload: PersistedPreferences = { settings, pinnedApps }
  void idbSet(PREFS_STORAGE_KEY, payload).catch(() => {
    // ignore IndexedDB errors
  })
}

const initialTerminalWindow: WindowInstance = {
  id: 'win-terminal',
  appId: 'terminal',
  title: 'Strata Terminal — /dev/pts/0',
  icon: 'Terminal',
  workspace: 1,
  x: 72,
  y: 54,
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

    installedPackages: [],
    pinnedApps: DEFAULT_PINNED_APPS,
    settings: DEFAULT_SETTINGS,

    setKernelStatus: (status, stage) =>
      set((state) => {
        state.kernelStatus = status
        state.kernelBootStage = stage
      }),

    setWorkerLatency: (ms) =>
      set((state) => {
        state.workerLatencyMs = ms
      }),

    setActiveWorkspace: (ws) =>
      set((state) => {
        state.activeWorkspace = ws
        // Focus highest z-index unminimized window on that workspace
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
      }),

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
        const winId = appId.startsWith('wasm:') ? `win-${appId}` : `win-${appId}`
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
        const cascadeOffset = (openCount % 6) * 26

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
        const x = Math.max(24, Math.round((vw - width) / 2) + cascadeOffset - 50)
        const y = Math.max(42, Math.round((vh - height) / 2) + cascadeOffset - 40)

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
          const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
          const vh = typeof window !== 'undefined' ? window.innerHeight : 800
          const usableHeight = vh - 32 - 74 // Top bar 32px, bottom dock area 74px
          const halfW = Math.floor((vw - 16) / 2)
          win.isMaximized = false
          win.snapState = snap
          win.x = snap === 'left' ? 6 : halfW + 10
          win.y = 38
          win.width = halfW
          win.height = Math.max(win.minHeight, usableHeight)
          return
        }

        win.isMaximized = false
        win.snapState = null
        win.x = Math.round(bounds.x)
        win.y = Math.max(34, Math.round(bounds.y))
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
        const saved = await idbGet<PersistedPreferences>(PREFS_STORAGE_KEY)
        if (saved) {
          set((state) => {
            if (saved.settings) {
              state.settings = { ...DEFAULT_SETTINGS, ...saved.settings }
            }
            if (Array.isArray(saved.pinnedApps) && saved.pinnedApps.length > 0) {
              state.pinnedApps = saved.pinnedApps
            }
          })
        }
      } catch {
        // ignore IndexedDB errors
      }
    },
  }))
)
