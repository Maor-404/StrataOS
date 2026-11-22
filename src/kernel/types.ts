export type PackageType = 'wasm-gui' | 'wasm-cli' | 'web-applet'

export type PackageCategory =
  | 'Developer Tools'
  | 'WASM Utilities'
  | 'CLI / WASI'
  | 'Games & Demos'

export interface PackageManifest {
  id: string
  name: string
  version: string
  author: string
  category: PackageCategory | string
  type: PackageType
  entry: string
  icon: string
  sizeBytes?: number
  tags?: string[]
  description: string
  permissions: string[]
  featured?: boolean
}

export interface RegistryIndex {
  registryVersion: string
  updatedAt: string
  repository: string
  packages: PackageManifest[]
}

export interface InstalledPackageRecord {
  id: string
  name: string
  version: string
  author: string
  category: string
  type: PackageType
  entry: string
  icon: string
  description: string
  permissions: string[]
  installPath: string
  binPath?: string
  installedAt: string
  sizeBytes: number
  sideloaded?: boolean
}

export interface InstalledRegistryFile {
  version: string
  updatedAt: string
  packages: Record<string, InstalledPackageRecord>
}

export interface FsEntry {
  name: string
  path: string
  type: 'file' | 'dir' | 'symlink'
  size: number
  mode: string
  permissions: string
  mtime: string
}

export interface DmesgEntry {
  id: number
  timestamp: string
  seconds: number
  level: 'info' | 'notice' | 'warn' | 'err'
  subsystem: string
  message: string
  raw: string
}

export type KernelStatus = 'booting' | 'online' | 'halted' | 'error'

export interface KernelMetrics {
  status: KernelStatus
  bootStage: string
  kernelBanner: string
  uptimeMs: number
  memoryMiB: number
  cpus: number
  compileMs: number
  blockReads: number
  blockWrites: number
  blockFlushes: number
  bytesRead: number
  bytesWritten: number
  jitCompiled: number
  jitLive: number
  jitCompileMs: number
  diskPersistent: boolean
  diskOverlayBlocks: number
  diskMemBytes: number
}

export interface StratagetProgressEvent {
  pkgId: string
  phase: 'resolving' | 'downloading' | 'extracting' | 'registering' | 'syncing' | 'complete' | 'removing' | 'error'
  percent: number
  message: string
}

export interface ExecCommandResult {
  stdout: string
  stderr: string
  exitCode: number
}
