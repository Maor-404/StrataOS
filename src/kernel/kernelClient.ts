import * as Comlink from 'comlink'
import type { StrataKernelWorker } from './kernelWorker'
import type {
  DmesgEntry,
  ExecCommandResult,
  FsEntry,
  InstalledPackageRecord,
  KernelMetrics,
  KernelStatus,
  PackageManifest,
  RegistryIndex,
  StratagetProgressEvent,
} from './types'

type StatusListener = (status: KernelStatus, stage: string) => void
type DmesgListener = (entries: DmesgEntry[]) => void
type PackagesListener = (installed: InstalledPackageRecord[]) => void
type FsListener = (dirPath: string) => void
type AppActionListener = (action: { type: 'launch' | 'close'; pkgId: string; args?: string[] }) => void
type TerminalCommandListener = (command: string) => void

class KernelClient {
  private worker: Worker | null = null
  private remote: Comlink.Remote<StrataKernelWorker> | null = null
  private initialized = false

  private statusListeners = new Set<StatusListener>()
  private dmesgListeners = new Set<DmesgListener>()
  private packagesListeners = new Set<PackagesListener>()
  private fsListeners = new Set<FsListener>()
  private appActionListeners = new Set<AppActionListener>()
  private terminalCommandListeners = new Set<TerminalCommandListener>()

  private currentStatus: KernelStatus = 'booting'
  private currentStage = 'Starting kernel worker...'

  private ensureRemote(): Comlink.Remote<StrataKernelWorker> {
    if (this.remote) return this.remote

    this.worker = new Worker(new URL('./kernelWorker.ts', import.meta.url), {
      type: 'module',
      name: 'strata-kernel-worker',
    })
    this.remote = Comlink.wrap<StrataKernelWorker>(this.worker)

    void this.remote.onStatusChange(
      Comlink.proxy((status: KernelStatus, stage: string) => {
        this.currentStatus = status
        this.currentStage = stage
        for (const cb of this.statusListeners) cb(status, stage)
      })
    )

    void this.remote.onDmesg(
      Comlink.proxy((entries: DmesgEntry[]) => {
        for (const cb of this.dmesgListeners) cb(entries)
      })
    )

    void this.remote.onPackagesChanged(
      Comlink.proxy((installed: InstalledPackageRecord[]) => {
        for (const cb of this.packagesListeners) cb(installed)
      })
    )

    void this.remote.onFsChanged(
      Comlink.proxy((dirPath: string) => {
        for (const cb of this.fsListeners) cb(dirPath)
      })
    )

    void this.remote.onAppAction(
      Comlink.proxy((action: { type: 'launch' | 'close'; pkgId: string; args?: string[] }) => {
        for (const cb of this.appActionListeners) cb(action)
      })
    )

    return this.remote
  }

  async boot(): Promise<void> {
    const remote = this.ensureRemote()
    if (!this.initialized) {
      this.initialized = true
    }
    await remote.boot()
  }

  async pingLatencyMs(): Promise<number> {
    const remote = this.ensureRemote()
    const t0 = performance.now()
    await remote.ping()
    return Number((performance.now() - t0).toFixed(2))
  }

  async getMetrics(): Promise<KernelMetrics> {
    return await this.ensureRemote().getMetrics()
  }

  async setRuntimeMeta(meta: {
    activeTheme?: string
    panelMode?: string
    featherMode?: string
    siteUrl?: string
  }): Promise<void> {
    await this.ensureRemote().setRuntimeMeta(meta)
  }

  async getDmesgLogs(): Promise<DmesgEntry[]> {
    return await this.ensureRemote().getDmesgLogs()
  }

  // Terminal PTY bridge
  async createTerminalSession(
    sessionId: string,
    cols: number,
    rows: number,
    onOutput: (bytes: Uint8Array) => void
  ): Promise<{ pts: number; pid: number }> {
    const remote = this.ensureRemote()
    return await remote.createTerminalSession(
      sessionId,
      cols,
      rows,
      Comlink.proxy((ab: ArrayBuffer) => {
        onOutput(new Uint8Array(ab))
      })
    )
  }

  async writeTerminalInput(sessionId: string, data: string | Uint8Array): Promise<void> {
    const remote = this.ensureRemote()
    if (typeof data === 'string') {
      await remote.writeTerminalInput(sessionId, data)
    } else {
      const ab = data.slice().buffer
      await remote.writeTerminalInput(sessionId, Comlink.transfer(ab, [ab]))
    }
  }

  async resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
    await this.ensureRemote().resizeTerminal(sessionId, cols, rows)
  }

  async closeTerminalSession(sessionId: string): Promise<void> {
    await this.ensureRemote().closeTerminalSession(sessionId)
  }

  // Dispatch a shell command to the active Strata Terminal tab
  sendCommandToTerminal(command: string): void {
    for (const cb of this.terminalCommandListeners) {
      cb(command)
    }
  }

  onTerminalCommand(cb: TerminalCommandListener): () => void {
    this.terminalCommandListeners.add(cb)
    return () => this.terminalCommandListeners.delete(cb)
  }

  // strataget & Strata Store unified package operations
  async updateRegistryIndex(): Promise<RegistryIndex> {
    return await this.ensureRemote().updateRegistryIndex()
  }

  async getRegistryCatalog(): Promise<PackageManifest[]> {
    return await this.ensureRemote().getRegistryCatalog()
  }

  async getInstalledPackages(): Promise<InstalledPackageRecord[]> {
    return await this.ensureRemote().getInstalledPackages()
  }

  async installPackage(
    pkgId: string,
    onProgress?: (event: StratagetProgressEvent) => void
  ): Promise<InstalledPackageRecord> {
    const remote = this.ensureRemote()
    return await remote.installPackage(
      pkgId,
      onProgress ? Comlink.proxy(onProgress) : undefined
    )
  }

  async removePackage(pkgId: string): Promise<void> {
    await this.ensureRemote().removePackage(pkgId)
  }

  async sideloadPackage(
    manifestJson: string,
    wasmBytes: Uint8Array
  ): Promise<InstalledPackageRecord> {
    const ab = wasmBytes.slice().buffer
    return await this.ensureRemote().sideloadPackage(
      manifestJson,
      Comlink.transfer(ab, [ab])
    )
  }

  async loadInstalledAppBinary(pkgId: string): Promise<{
    manifest: PackageManifest
    wasmBytes: Uint8Array
  }> {
    const res = await this.ensureRemote().loadInstalledAppBinary(pkgId)
    return {
      manifest: res.manifest,
      wasmBytes: new Uint8Array(res.wasmBuffer),
    }
  }

  // Linux Filesystem operations
  async listDirectory(dirPath: string): Promise<FsEntry[]> {
    return await this.ensureRemote().listDirectory(dirPath)
  }

  async readFileText(filePath: string): Promise<string> {
    return await this.ensureRemote().readFileText(filePath)
  }

  async readFileBytes(filePath: string): Promise<Uint8Array> {
    const ab = await this.ensureRemote().readFileBytes(filePath)
    return new Uint8Array(ab)
  }

  async writeFileText(filePath: string, content: string): Promise<void> {
    await this.ensureRemote().writeFileText(filePath, content)
  }

  async writeFileBytes(filePath: string, bytes: Uint8Array): Promise<void> {
    const ab = bytes.slice().buffer
    await this.ensureRemote().writeFileBytes(filePath, Comlink.transfer(ab, [ab]))
  }

  async createDirectory(dirPath: string): Promise<void> {
    await this.ensureRemote().createDirectory(dirPath)
  }

  async deletePath(targetPath: string): Promise<void> {
    await this.ensureRemote().deletePath(targetPath)
  }

  async renamePath(oldPath: string, newPath: string): Promise<void> {
    await this.ensureRemote().renamePath(oldPath, newPath)
  }

  async searchUserFiles(): Promise<string[]> {
    return await this.ensureRemote().searchUserFiles()
  }

  async execCommand(command: string, args: string[] = []): Promise<ExecCommandResult> {
    return await this.ensureRemote().execCommand(command, args)
  }

  async syncDisk(): Promise<boolean> {
    return await this.ensureRemote().syncDisk()
  }

  async rebootKernel(): Promise<void> {
    await this.ensureRemote().rebootKernel()
  }

  async factoryResetDisk(): Promise<void> {
    await this.ensureRemote().factoryResetDisk()
  }

  // Subscriptions
  subscribeStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb)
    cb(this.currentStatus, this.currentStage)
    return () => this.statusListeners.delete(cb)
  }

  subscribeDmesg(cb: DmesgListener): () => void {
    this.dmesgListeners.add(cb)
    return () => this.dmesgListeners.delete(cb)
  }

  subscribePackages(cb: PackagesListener): () => void {
    this.packagesListeners.add(cb)
    return () => this.packagesListeners.delete(cb)
  }

  subscribeFs(cb: FsListener): () => void {
    this.fsListeners.add(cb)
    return () => this.fsListeners.delete(cb)
  }

  subscribeAppActions(cb: AppActionListener): () => void {
    this.appActionListeners.add(cb)
    return () => this.appActionListeners.delete(cb)
  }
}

export const kernelClient = new KernelClient()
