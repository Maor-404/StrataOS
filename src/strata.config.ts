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
    wallpaper: 'obsidian-grid' | 'carbon-slate' | 'midnight-aurora' | 'deep-abyss' | 'webgpu-compute'
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
  releaseTitle: 'StrataOS v1.0.0 ("Bedrock")',
  kernelRelease: 'Linux 7.3.4-unkernel-bedrock (arch/wasm SMP)',
  defaultTheme: {
    desktopBase: '#09090b',
    windowSurface: 'rgba(18, 18, 21, 0.94)',
    elevatedPanel: '#1c1c21',
    borderHairline: 'rgba(255, 255, 255, 0.08)',
    accentColor: 'cyan',
    wallpaper: 'obsidian-grid',
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
  liveDemoUrl: 'https://sonic-koto-mowjpsl.tmp.now',
}
