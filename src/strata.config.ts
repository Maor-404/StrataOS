export interface StrataDistroConfig {
  osName: string
  version: string
  codename: string
  releaseTitle: string
  kernelRelease: string
  defaultTheme: {
    desktopBase: string
    windowSurface: string
    elevatedPanel: string
    borderHairline: string
    accentColor: 'cyan' | 'emerald' | 'amber' | 'sky' | 'rose'
    wallpaper:
      | 'debian-swirl'
      | 'obsidian-grid'
      | 'carbon-slate'
      | 'midnight-aurora'
      | 'deep-abyss'
      | 'lxqt-frost'
      | 'webgpu-compute'
  }
  registryUrl: string
  pinnedDockApps: string[]
  startupApps: string[]
  enableUEFI: boolean
  uefiPostDelayMs: number
  enableWebGPUExclusive: boolean
  repoUrl: string
  liveDemoUrl: string
}

/**
 * One-File Distro Configuration for StrataOS v1.0.0 ("Bedrock").
 * Forkers and remixers can customize the entire Web OS branding, boot flow,
 * package registry URL, and default pinned apps in this single file.
 */
export const STRATA_CONFIG: StrataDistroConfig = {
  osName: 'StrataOS',
  version: '1.0.0',
  codename: 'Bedrock',
  releaseTitle: 'StrataOS v1.0.0 ("Bedrock") — Minimal Debian + Plasma/LXQt',
  kernelRelease: 'Linux 7.3.4-unkernel-bedrock (Debian GNU/Linux arch/wasm SMP)',
  defaultTheme: {
    desktopBase: '#161317',
    windowSurface: 'rgba(30, 26, 32, 0.96)',
    elevatedPanel: '#1e1a20',
    borderHairline: 'rgba(255, 255, 255, 0.09)',
    accentColor: 'rose',
    wallpaper: 'debian-swirl',
  },
  registryUrl: '/registry/index.json',
  pinnedDockApps: [
    'terminal',
    'studio',
    'store',
    'files',
    'copilot',
    'gpu-studio',
    'bytescope',
    'monitor',
    'settings',
  ],
  startupApps: ['terminal'],
  enableUEFI: true,
  uefiPostDelayMs: 1500,
  enableWebGPUExclusive: true,
  repoUrl: 'https://github.com/Maor-404/StrataOS',
  liveDemoUrl: 'https://strata-os.pages.dev',
}
