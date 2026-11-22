import * as Comlink from 'comlink'
import {
  ConsoleRouter,
  createKernel,
  resetDataDisk,
  serveWasiPrograms,
  type HostCommandContext,
  type KernelInstance,
  type Pty,
  type WasiExecServer,
} from 'unkernel/web'
import kernelWasmUrl from 'unkernel/unkernel.wasm?url'
import type {
  DmesgEntry,
  ExecCommandResult,
  FsEntry,
  InstalledPackageRecord,
  InstalledRegistryFile,
  KernelMetrics,
  KernelStatus,
  PackageManifest,
  RegistryIndex,
  StratagetProgressEvent,
} from './types'
import { runWasiCliPackage } from './wasiRunner'

const BATCH_INTERVAL_MS = 16

const STARTER_README = `# Welcome to StrataOS (Linux 7.3.4 / unkernel WASM)

StrataOS is a browser-native Linux operating system running a real compiled **Linux 7.3.4** kernel inside a dedicated Web Worker with hardware-accelerated WebGL terminal rendering and persistent \`ext4\` storage.

## Quick Start: \`strataget\` Package Manager

Run these commands in **Strata Terminal**:

\`\`\`sh
strataget update                 # Refresh package index from Strata registry
strataget search wasm            # Search available community WASM packages
strataget install hexforge       # Install HexForge binary inspector into /opt/strata/apps/hexforge
strataget install calcwasm       # Install CalcWASM CLI evaluator into /usr/local/bin/calcwasm
strataget list                   # List installed packages & disk usage
calcwasm "2^16 + sqrt(144)"      # Run WASI CLI calculator directly
strataget run hexforge           # Launch HexForge GUI window from the terminal
\`\`\`

## Filesystem Layout

- \`/opt/strata/apps/<app-id>/\` — Installed WASM application binaries & \`manifest.json\`
- \`/etc/strata/installed.json\` — Single source of truth for installed packages
- \`/etc/strata/registry.json\`  — Cached community package index
- \`/usr/local/bin/<app-id>\`     — Executable wrappers for CLI & GUI packages
- \`/root\` & \`/home/strata\`     — Persistent user workspaces backed by \`ext4\` on IndexedDB
`

const STARTER_NOTES_MD = `# StrataOS Architecture & Performance Notes

## Kernel & Userspace Pipeline
- **Kernel**: Linux 7.3.4 compiled to WebAssembly (\`arch/wasm\`) with Sv39 page tables and JSPI task switching.
- **Userspace**: Unmodified \`aarch64\` binaries executed by \`kwemu\` with dynamic WebAssembly JIT compilation.
- **Persistence**: Copy-on-Write \`ext4\` block device (\`kwdata\`) backed by IndexedDB transactions.

## Verification Checklist
1. Cross-Origin Isolation (\`COOP: same-origin\`, \`COEP: require-corp\`) active.
2. Zero-copy \`ArrayBuffer\` transfers across Web Worker boundary via \`Comlink.transfer()\`.
3. Direct DOM \`translate3d(x, y, 0)\` window compositing at 120fps.
`

const STARTER_BENCH_SH = `#!/bin/sh
echo "=== StrataOS Linux Kernel Benchmark ==="
uname -a
echo ""
echo "[1/3] Process Fork & Syscall Latency Test..."
i=0
while [ $i -lt 25 ]; do
  i=$((i + 1))
done
echo "  -> 25 shell iterations completed."
echo ""
echo "[2/3] Mounted Persistent Filesystems:"
df -h /data
echo ""
echo "[3/3] Installed Strata Packages:"
strataget list
`

const STARTER_CONFIG_JSON = `{
  "os": "StrataOS",
  "kernel": "Linux 7.3.4-unkernel-wasm",
  "arch": "aarch64-kwemu-jit",
  "compositor": {
    "targetFps": 120,
    "gpuAcceleration": true,
    "crossOriginIsolated": true
  },
  "paths": {
    "appsDir": "/opt/strata/apps",
    "installedRegistry": "/etc/strata/installed.json",
    "packageIndex": "/etc/strata/registry.json",
    "binDir": "/usr/local/bin"
  }
}
`

interface PtySessionState {
  id: string
  pty: Pty | null
  useConsoleFallback: boolean
  chunks: Uint8Array[]
  totalBufferedBytes: number
  flushTimer: ReturnType<typeof setTimeout> | null
  onOutput: (buffer: ArrayBuffer) => void
  unsubConsole?: () => void
}

class StrataKernelWorker {
  private vm: KernelInstance | null = null
  private wasiServer: WasiExecServer | null = null
  private status: KernelStatus = 'booting'
  private bootStage = 'Initializing WebWorker...'
  private kernelBanner = 'Linux version 7.3.4-unkernel (arch/wasm SMP)'
  private dmesgLogs: DmesgEntry[] = []
  private nextDmesgId = 1
  private bootPromise: Promise<void> | null = null

  private ptySessions = new Map<string, PtySessionState>()

  // Callbacks to main thread
  private onStatusListeners: Array<(status: KernelStatus, stage: string) => void> = []
  private onDmesgListeners: Array<(entries: DmesgEntry[]) => void> = []
  private onPackagesChangedListeners: Array<(installed: InstalledPackageRecord[]) => void> = []
  private onFsChangedListeners: Array<(dirPath: string) => void> = []
  private onAppActionListeners: Array<
    (action: { type: 'launch' | 'close'; pkgId: string; args?: string[] }) => void
  > = []

  private encoder = new TextEncoder()

  async boot(): Promise<void> {
    if (this.vm && this.status === 'online') return
    if (this.bootPromise) return this.bootPromise

    this.bootPromise = this.performBoot()
    return this.bootPromise
  }

  private setStatus(status: KernelStatus, stage: string) {
    this.status = status
    this.bootStage = stage
    for (const cb of this.onStatusListeners) {
      try {
        cb(status, stage)
      } catch {
        // ignore stale callback
      }
    }
  }

  private appendDmesgLine(rawLine: string, timeSeconds?: number) {
    const cleaned = rawLine.replace(/\r/g, '').trim()
    if (!cleaned) return

    let seconds = timeSeconds ?? performance.now() / 1000
    let body = cleaned
    const match = /^\[\s*(\d+\.\d+)\]\s*(.*)$/.exec(cleaned)
    if (match) {
      seconds = parseFloat(match[1])
      body = match[2]
    }

    let subsystem = 'kernel'
    let message = body
    const subMatch = /^([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_.-]+)?):\s+(.*)$/.exec(body)
    if (subMatch) {
      subsystem = subMatch[1]
      message = subMatch[2]
    }

    let level: DmesgEntry['level'] = 'info'
    if (/error|fail|panic|oops|fault|corrupt/i.test(body)) {
      level = 'err'
    } else if (/warn|deprecated|mismatch|drop|refuse/i.test(body)) {
      level = 'warn'
    } else if (/init|mount|kw|strata|ext4|eth0|vsock/i.test(body)) {
      level = 'notice'
    }

    if (body.startsWith('Linux version ')) {
      this.kernelBanner = body
    }

    const entry: DmesgEntry = {
      id: this.nextDmesgId++,
      timestamp: seconds.toFixed(6).padStart(11, ' '),
      seconds,
      level,
      subsystem,
      message,
      raw: cleaned,
    }
    this.dmesgLogs.push(entry)
    if (this.dmesgLogs.length > 5000) {
      this.dmesgLogs.shift()
    }
    for (const cb of this.onDmesgListeners) {
      try {
        cb([entry])
      } catch {
        // ignore
      }
    }
  }

  private async performBoot(): Promise<void> {
    try {
      this.setStatus('booting', 'Checking WebAssembly & JSPI support...')

      const router = new ConsoleRouter({
        onKernelLine: (line, info) => {
          this.appendDmesgLine(line, info.time)
        },
      })

      this.setStatus('booting', 'Compiling Linux 7.3.4 WASM kernel...')

      const vm = await createKernel({
        kernel: kernelWasmUrl,
        disks: [{ kind: 'data', template: 'bundled', mode: 'persistent' }],
        vsock: true,
        shm: true,
        jit: true,
        consoleSize: { cols: 100, rows: 30 },
        commands: {
          __strataget_rpc: async (ctx: HostCommandContext) => {
            return await this.handleStratagetCommandFromGuest(ctx)
          },
        },
        onProgress: (p) => {
          if (p.stage === 'download') {
            const pct = p.total ? Math.round((p.loaded / p.total) * 100) : 0
            this.setStatus('booting', `Downloading ${p.what} (${pct}%)...`)
          } else if (p.stage === 'compile') {
            this.setStatus('booting', 'Compiling unkernel.wasm...')
          } else if (p.stage === 'instantiate') {
            this.setStatus('booting', 'Instantiating Linux kernel & MMU...')
          } else if (p.stage === 'start') {
            this.setStatus('booting', 'Mounting filesystems & starting init...')
          }
        },
        onOutput: (bytes) => {
          router.write(bytes)
        },
        log: (msg) => {
          this.appendDmesgLine(msg)
        },
      })

      this.vm = vm

      if (vm.vsock) {
        this.wasiServer = serveWasiPrograms(vm.vsock)
      }

      vm.exited.then((res) => {
        this.appendDmesgLine(`[kernel] System halted (code=${res.code}, kind=${res.kind})`)
        this.setStatus('halted', `Halted (${res.kind})`)
      })

      this.setStatus('booting', 'Provisioning persistent ext4 /data mounts & strataget...')
      await this.provisionGuestFilesystem()

      this.setStatus('online', 'Linux 7.3.4 Online')
      this.appendDmesgLine('[strata] StrataOS compositor & strataget bridge ready.')

      const installedList = await this.getInstalledPackages()
      this.notifyPackagesChanged(installedList)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.appendDmesgLine(`[strata-error] Boot failure: ${msg}`)
      this.setStatus('error', msg)
      throw err
    } finally {
      this.bootPromise = null
    }
  }

  private async provisionGuestFilesystem(): Promise<void> {
    if (!this.vm) return

    const bootScript = `
set -e
hostname strataos 2>/dev/null || true

if mountpoint -q /data; then
  mkdir -p /data/persistence/opt_strata/apps \\
           /data/persistence/etc_strata \\
           /data/persistence/usr_local_bin \\
           /data/persistence/root \\
           /data/persistence/home/strata
  mkdir -p /opt/strata /etc/strata /usr/local/bin /root /home
  mountpoint -q /opt/strata || mount --bind /data/persistence/opt_strata /opt/strata
  mountpoint -q /etc/strata || mount --bind /data/persistence/etc_strata /etc/strata
  mountpoint -q /usr/local/bin || mount --bind /data/persistence/usr_local_bin /usr/local/bin
  mountpoint -q /root || mount --bind /data/persistence/root /root
  mountpoint -q /home || mount --bind /data/persistence/home /home
else
  mkdir -p /opt/strata/apps /etc/strata /usr/local/bin /root /home/strata
fi

mkdir -p /opt/strata/apps /etc/strata /usr/local/bin /root /home/strata

cat << 'EOF' > /etc/profile
export PATH=/usr/local/bin:/run/kw/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/root
export USER=root
export LOGNAME=root
export TERM=xterm-256color
[ "$PWD" = "/" ] && cd /root
PS1='\\[\\033[1;36m\\]root@strataos\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]# '
EOF

cat << 'EOF' > /usr/local/bin/strataget
#!/bin/sh
exec /run/kw/bin/__strataget_rpc "$@"
EOF
chmod +x /usr/local/bin/strataget
`
    await this.vm.exec('/bin/sh', ['-c', bootScript])

    // Capture full kernel dmesg buffer
    const dmesgRes = await this.vm.exec('/bin/dmesg', [])
    if (dmesgRes.exitCode === 0 && dmesgRes.stdout) {
      const existingRaw = new Set(this.dmesgLogs.map((e) => e.raw))
      for (const line of dmesgRes.stdout.split('\n')) {
        const trimmed = line.trim()
        if (trimmed && !existingRaw.has(trimmed)) {
          this.appendDmesgLine(trimmed)
        }
      }
    }

    // Ensure /etc/strata/installed.json exists
    const checkInstalled = await this.vm.exec('/bin/sh', [
      '-c',
      '[ -s /etc/strata/installed.json ] && cat /etc/strata/installed.json || echo ""',
    ])
    if (!checkInstalled.stdout.trim()) {
      const initialInstalled: InstalledRegistryFile = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        packages: {},
      }
      await this.writeFileTextInternal(
        '/etc/strata/installed.json',
        JSON.stringify(initialInstalled, null, 2)
      )
    } else {
      try {
        const parsed = JSON.parse(checkInstalled.stdout) as InstalledRegistryFile
        for (const pkg of Object.values(parsed.packages ?? {})) {
          await this.ensureBinWrapper(pkg.id)
        }
      } catch {
        // ignore
      }
    }

    // Seed /etc/strata/registry.json from public/registry/index.json if missing
    const checkRegistry = await this.vm.exec('/bin/sh', [
      '-c',
      '[ -s /etc/strata/registry.json ] && echo "exists" || echo ""',
    ])
    if (!checkRegistry.stdout.trim()) {
      try {
        const res = await fetch('/registry/index.json', { cache: 'no-cache' })
        if (res.ok) {
          const text = await res.text()
          await this.writeFileTextInternal('/etc/strata/registry.json', text)
        }
      } catch {
        // will be populated on strataget update
      }
    }

    // Seed starter files in /root and /home/strata if not present
    const checkReadme = await this.vm.exec('/bin/sh', [
      '-c',
      '[ -f /root/README.md ] && echo "yes" || echo ""',
    ])
    if (!checkReadme.stdout.trim()) {
      await this.writeFileTextInternal('/root/README.md', STARTER_README)
      await this.writeFileTextInternal('/root/sysbench.sh', STARTER_BENCH_SH)
      await this.vm.exec('/bin/chmod', ['+x', '/root/sysbench.sh'])
      await this.writeFileTextInternal('/home/strata/architecture.md', STARTER_NOTES_MD)
      await this.writeFileTextInternal('/home/strata/strata-config.json', STARTER_CONFIG_JSON)
    }

    await this.vm.sync({ timeout: 1500 })
  }

  private async ensureBinWrapper(pkgId: string): Promise<void> {
    if (!this.vm) return
    const wrapper = `#!/bin/sh\nexec /usr/local/bin/strataget run ${pkgId} "$@"\n`
    await this.writeFileTextInternal(`/usr/local/bin/${pkgId}`, wrapper)
    await this.vm.exec('/bin/chmod', ['+x', `/usr/local/bin/${pkgId}`])
  }

  private async writeFileTextInternal(filePath: string, content: string): Promise<void> {
    if (!this.vm) throw new Error('Kernel is not running')
    const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '/'
    await this.vm.exec('/bin/sh', ['-c', `mkdir -p "${dir}" && cat > "${filePath}"`], {
      input: content,
    })
  }

  private async writeFileBytesInternal(filePath: string, bytes: Uint8Array): Promise<void> {
    if (!this.vm) throw new Error('Kernel is not running')
    const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '/'
    await this.vm.exec('/bin/sh', ['-c', `mkdir -p "${dir}" && cat > "${filePath}"`], {
      input: bytes,
    })
  }

  private async readFileBytesInternal(filePath: string): Promise<Uint8Array> {
    if (!this.vm) throw new Error('Kernel is not running')
    const res = await this.vm.exec('/bin/cat', [filePath], { encoding: 'buffer' })
    if (res.exitCode !== 0) {
      const errText = new TextDecoder().decode(res.stderr)
      throw new Error(errText.trim() || `Cannot read ${filePath}`)
    }
    return res.stdout
  }

  private async readFileTextInternal(filePath: string): Promise<string> {
    if (!this.vm) throw new Error('Kernel is not running')
    const res = await this.vm.exec('/bin/cat', [filePath])
    if (res.exitCode !== 0) {
      throw new Error(res.stderr.trim() || `Cannot read ${filePath}`)
    }
    return res.stdout
  }

  // ============================================================================
  // Terminal PTY Session Management with 16ms Output Batching & Zero-Copy Transfer
  // ============================================================================

  async createTerminalSession(
    sessionId: string,
    cols: number,
    rows: number,
    onOutput: (buffer: ArrayBuffer) => void
  ): Promise<{ pts: number; pid: number }> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel not booted')

    await this.closeTerminalSession(sessionId)

    const sessionState: PtySessionState = {
      id: sessionId,
      pty: null,
      useConsoleFallback: false,
      chunks: [],
      totalBufferedBytes: 0,
      flushTimer: null,
      onOutput,
    }
    this.ptySessions.set(sessionId, sessionState)

    const enqueueChunk = (chunk: Uint8Array) => {
      if (!chunk || chunk.byteLength === 0) return
      const copy = chunk.slice()
      sessionState.chunks.push(copy)
      sessionState.totalBufferedBytes += copy.byteLength

      if (!sessionState.flushTimer) {
        sessionState.flushTimer = setTimeout(() => {
          sessionState.flushTimer = null
          this.flushTerminalOutput(sessionState)
        }, BATCH_INTERVAL_MS)
      }
    }

    try {
      const pty = await this.vm.spawn('/bin/sh', ['-l'], {
        cols,
        rows,
        cwd: '/root',
        user: 'root',
        term: 'xterm-256color',
        env: {
          PATH: '/usr/local/bin:/run/kw/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin',
          HOME: '/root',
          USER: 'root',
          TERM: 'xterm-256color',
          ENV: '/etc/profile',
        },
      })
      sessionState.pty = pty

      const banner = this.encoder.encode(
        `\x1b[1;36mStrataOS 1.0\x1b[0m \x1b[90m(Linux 7.3.4-unkernel wasm32 / aarch64-kwemu, tty /dev/pts/${pty.pts})\x1b[0m\r\n` +
          `\x1b[90mType \x1b[36mstrataget --help\x1b[90m to manage community WebAssembly packages.\x1b[0m\r\n\r\n`
      )
      enqueueChunk(banner)

      const reader = pty.output.getReader()
      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) enqueueChunk(value)
          }
        } catch {
          // stream closed
        }
      })()

      return { pts: pty.pts, pid: pty.pid }
    } catch {
      sessionState.useConsoleFallback = true
      this.vm.resize(cols, rows)
      sessionState.unsubConsole = this.vm.onOutput((bytes) => {
        enqueueChunk(bytes)
      })
      this.vm.write('\n')
      return { pts: 0, pid: 1 }
    }
  }

  private flushTerminalOutput(session: PtySessionState) {
    if (session.chunks.length === 0 || session.totalBufferedBytes === 0) return

    const merged = new Uint8Array(session.totalBufferedBytes)
    let offset = 0
    for (const chunk of session.chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    session.chunks = []
    session.totalBufferedBytes = 0

    const ab = merged.buffer
    try {
      session.onOutput(Comlink.transfer(ab, [ab]))
    } catch {
      // callback disconnected
    }
  }

  async writeTerminalInput(sessionId: string, data: string | ArrayBuffer): Promise<void> {
    const session = this.ptySessions.get(sessionId)
    if (!session || !this.vm) return
    const payload = typeof data === 'string' ? data : new Uint8Array(data)
    if (session.pty) {
      await session.pty.write(payload)
    } else if (session.useConsoleFallback) {
      this.vm.write(payload)
    }
  }

  async resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
    const session = this.ptySessions.get(sessionId)
    if (!session || !this.vm) return
    if (session.pty) {
      session.pty.resize(cols, rows)
    } else if (session.useConsoleFallback) {
      this.vm.resize(cols, rows)
    }
  }

  async closeTerminalSession(sessionId: string): Promise<void> {
    const session = this.ptySessions.get(sessionId)
    if (!session) return
    if (session.flushTimer) {
      clearTimeout(session.flushTimer)
      session.flushTimer = null
    }
    if (session.unsubConsole) {
      session.unsubConsole()
    }
    if (session.pty) {
      try {
        await session.pty.close()
      } catch {
        // ignore
      }
    }
    this.ptySessions.delete(sessionId)
  }

  // ============================================================================
  // strataget Package Manager Engine (CLI + GUI Single Source of Truth)
  // ============================================================================

  private async handleStratagetCommandFromGuest(ctx: HostCommandContext): Promise<number> {
    const writer = ctx.stdout.getWriter()
    const errWriter = ctx.stderr.getWriter()
    const writeOut = async (text: string) => {
      try {
        await writer.write(text)
      } catch {
        // ignore
      }
    }
    const writeErr = async (text: string) => {
      try {
        await errWriter.write(text)
      } catch {
        // ignore
      }
    }

    try {
      const args = [...ctx.args]
      const subcmd = args[0] ?? 'help'

      if (subcmd === 'help' || subcmd === '--help' || subcmd === '-h') {
        await writeOut(
          `\x1b[1;36mstrataget\x1b[0m — StrataOS Community WebAssembly Package Manager v1.0.0\n\n` +
            `\x1b[1mUSAGE:\x1b[0m\n` +
            `  strataget <command> [arguments]\n\n` +
            `\x1b[1mCOMMANDS:\x1b[0m\n` +
            `  \x1b[36mupdate\x1b[0m               Refresh local package index (/etc/strata/registry.json)\n` +
            `  \x1b[36msearch\x1b[0m <query>       Search community WASM packages by name, tag, or category\n` +
            `  \x1b[36minstall\x1b[0m <pkg>        Download & install package into /opt/strata/apps/<pkg>\n` +
            `  \x1b[36mremove\x1b[0m <pkg>         Uninstall package and remove /usr/local/bin/<pkg>\n` +
            `  \x1b[36mlist\x1b[0m                 List installed packages, versions, and disk usage\n` +
            `  \x1b[36mrun\x1b[0m <pkg> [args...]  Execute a wasm-cli tool in WASI or launch a wasm-gui window\n`
        )
        return 0
      }

      if (subcmd === 'update') {
        await writeOut(`\x1b[36m::\x1b[0m Synchronizing package database from StrataOS Registry...\n`)
        await writeOut(` \x1b[90m[\x1b[36m████████████████████████████\x1b[90m] 100%\x1b[0m  /etc/strata/registry.json\n`)
        const index = await this.updateRegistryIndex()
        await writeOut(
          `\x1b[1;32m✓\x1b[0m Updated registry index v${index.registryVersion} (${index.packages.length} packages available).\n`
        )
        return 0
      }

      if (subcmd === 'search') {
        const query = args.slice(1).join(' ').trim().toLowerCase()
        const catalog = await this.getRegistryCatalog()
        const installedMap = await this.getInstalledMap()
        const matches = catalog.filter((pkg) => {
          if (!query) return true
          return (
            pkg.id.toLowerCase().includes(query) ||
            pkg.name.toLowerCase().includes(query) ||
            pkg.category.toLowerCase().includes(query) ||
            pkg.description.toLowerCase().includes(query) ||
            (pkg.tags ?? []).some((t) => t.toLowerCase().includes(query))
          )
        })

        if (matches.length === 0) {
          await writeOut(`\x1b[33mNo packages matching '${query}' found in /etc/strata/registry.json.\x1b[0m\n`)
          return 0
        }

        await writeOut(
          `\x1b[1mFound ${matches.length} package(s) in StrataOS Registry:\x1b[0m\n` +
            `\x1b[90m────────────────────────────────────────────────────────────────────────\x1b[0m\n`
        )
        for (const pkg of matches) {
          const isInst = Boolean(installedMap[pkg.id])
          const badge = isInst
            ? `\x1b[1;32m[installed]\x1b[0m`
            : `\x1b[90m[${pkg.type}]\x1b[0m`
          await writeOut(
            `\x1b[1;36m${pkg.id}\x1b[0m/\x1b[35m${pkg.category.toLowerCase().replace(/\s+/g, '-')}\x1b[0m \x1b[1m${pkg.version}\x1b[0m ${badge}\n` +
              `    ${pkg.description}\n`
          )
        }
        return 0
      }

      if (subcmd === 'install') {
        const pkgId = args[1]?.trim().toLowerCase()
        if (!pkgId) {
          await writeErr(`\x1b[1;31merror:\x1b[0m missing package name. Usage: strataget install <pkg>\n`)
          return 1
        }

        await writeOut(`\x1b[36m::\x1b[0m Resolving package \x1b[1m${pkgId}\x1b[0m from /etc/strata/registry.json...\n`)
        let lastPhase = ''
        const record = await this.installPackage(pkgId, (ev) => {
          if (ev.phase !== lastPhase) {
            lastPhase = ev.phase
            const filled = Math.round((ev.percent / 100) * 24)
            const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, 24 - filled))
            void writeOut(
              `  \x1b[36m[${bar}]\x1b[0m \x1b[1m${String(ev.percent).padStart(3, ' ')}%\x1b[0m ${ev.message}\n`
            )
          }
        })

        await writeOut(
          `\x1b[1;32m✓ Installed ${record.name} v${record.version}\x1b[0m\n` +
            `  \x1b[90mApp Directory:\x1b[0m ${record.installPath}\n` +
            `  \x1b[90mCLI Wrapper:\x1b[0m   ${record.binPath ?? `/usr/local/bin/${record.id}`}\n` +
            `  \x1b[90mRegistry:\x1b[0m      /etc/strata/installed.json (synced to ext4)\n`
        )
        return 0
      }

      if (subcmd === 'remove' || subcmd === 'uninstall') {
        const pkgId = args[1]?.trim().toLowerCase()
        if (!pkgId) {
          await writeErr(`\x1b[1;31merror:\x1b[0m missing package name. Usage: strataget remove <pkg>\n`)
          return 1
        }
        await writeOut(`\x1b[33m::\x1b[0m Removing package \x1b[1m${pkgId}\x1b[0m...\n`)
        await this.removePackage(pkgId)
        await writeOut(
          `  \x1b[90m-\x1b[0m Deleted /opt/strata/apps/${pkgId}/\n` +
            `  \x1b[90m-\x1b[0m Removed /usr/local/bin/${pkgId}\n` +
            `  \x1b[90m-\x1b[0m Updated /etc/strata/installed.json\n` +
            `\x1b[1;32m✓ Uninstalled ${pkgId} cleanly.\x1b[0m\n`
        )
        return 0
      }

      if (subcmd === 'list') {
        const installed = await this.getInstalledPackages()
        if (installed.length === 0) {
          await writeOut(
            `\x1b[90mNo community packages currently installed in /etc/strata/installed.json.\x1b[0m\n` +
              `Run \x1b[36mstrataget install hexforge\x1b[0m or open \x1b[36mStrata Store\x1b[0m to install apps.\n`
          )
          return 0
        }

        await writeOut(
          `\x1b[1mPACKAGE       VERSION   TYPE       SIZE       LOCATION\x1b[0m\n` +
            `\x1b[90m────────────────────────────────────────────────────────────────────\x1b[0m\n`
        )
        for (const pkg of installed) {
          const kb = (pkg.sizeBytes / 1024).toFixed(1) + ' KB'
          await writeOut(
            `\x1b[1;36m${pkg.id.padEnd(13)}\x1b[0m ` +
              `${pkg.version.padEnd(9)} ` +
              `\x1b[35m${pkg.type.padEnd(10)}\x1b[0m ` +
              `${kb.padEnd(10)} ` +
              `\x1b[90m${pkg.installPath}\x1b[0m\n`
          )
        }
        return 0
      }

      if (subcmd === 'run') {
        const pkgId = args[1]?.trim().toLowerCase()
        if (!pkgId) {
          await writeErr(`\x1b[1;31merror:\x1b[0m missing package name. Usage: strataget run <pkg> [args...]\n`)
          return 1
        }
        const runArgs = args.slice(2)
        const installedMap = await this.getInstalledMap()
        const pkg = installedMap[pkgId]
        if (!pkg) {
          await writeErr(
            `\x1b[1;31merror:\x1b[0m package '${pkgId}' is not installed in /opt/strata/apps/${pkgId}.\n` +
              `Install it first with: \x1b[36mstrataget install ${pkgId}\x1b[0m\n`
          )
          return 1
        }

        if (pkg.type === 'wasm-gui' || pkg.type === 'web-applet') {
          await writeOut(
            `\x1b[1;32m[strataget]\x1b[0m Launching GUI window for \x1b[1;36m${pkg.name}\x1b[0m (v${pkg.version}) from ${pkg.installPath}/${pkg.entry}...\n`
          )
          this.notifyAppAction({ type: 'launch', pkgId: pkg.id, args: runArgs })
          return 0
        }

        const wasmPath = `${pkg.installPath}/${pkg.entry}`
        const wasmBytes = await this.readFileBytesInternal(wasmPath)
        const manifestText = await this.readFileTextInternal(`${pkg.installPath}/manifest.json`)
        const manifest = JSON.parse(manifestText) as PackageManifest

        return await runWasiCliPackage({
          pkgId: pkg.id,
          manifest,
          wasmBytes,
          args: runArgs,
          env: { ...ctx.env },
          cwd: ctx.cwd,
          onStdout: (t) => {
            void writeOut(t)
          },
          onStderr: (t) => {
            void writeErr(t)
          },
        })
      }

      await writeErr(`\x1b[1;31merror:\x1b[0m unknown strataget command '${subcmd}'. Run 'strataget --help'.\n`)
      return 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await writeErr(`\x1b[1;31mstrataget error:\x1b[0m ${msg}\n`)
      return 1
    } finally {
      try {
        writer.releaseLock()
        errWriter.releaseLock()
      } catch {
        // ignore
      }
    }
  }

  async updateRegistryIndex(): Promise<RegistryIndex> {
    if (!this.vm) await this.boot()
    const res = await fetch('/registry/index.json', { cache: 'no-cache' })
    if (!res.ok) {
      throw new Error(`Failed to fetch registry index: HTTP ${res.status}`)
    }
    const index = (await res.json()) as RegistryIndex
    await this.writeFileTextInternal('/etc/strata/registry.json', JSON.stringify(index, null, 2))
    await this.vm?.sync({ timeout: 1500 })
    this.notifyFsChanged('/etc/strata')
    return index
  }

  async getRegistryCatalog(): Promise<PackageManifest[]> {
    if (!this.vm) await this.boot()
    try {
      const text = await this.readFileTextInternal('/etc/strata/registry.json')
      const parsed = JSON.parse(text) as RegistryIndex
      if (Array.isArray(parsed.packages) && parsed.packages.length > 0) {
        return parsed.packages
      }
    } catch {
      // Fallback to fetching and saving
    }
    const index = await this.updateRegistryIndex()
    return index.packages
  }

  private async getInstalledMap(): Promise<Record<string, InstalledPackageRecord>> {
    if (!this.vm) await this.boot()
    try {
      const text = await this.readFileTextInternal('/etc/strata/installed.json')
      const parsed = JSON.parse(text) as InstalledRegistryFile
      return parsed.packages ?? {}
    } catch {
      return {}
    }
  }

  async getInstalledPackages(): Promise<InstalledPackageRecord[]> {
    const map = await this.getInstalledMap()
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
  }

  async installPackage(
    pkgId: string,
    onProgress?: (event: StratagetProgressEvent) => void
  ): Promise<InstalledPackageRecord> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel is offline')

    const cleanId = pkgId.trim().toLowerCase()
    onProgress?.({
      pkgId: cleanId,
      phase: 'resolving',
      percent: 15,
      message: `Resolving ${cleanId} from /etc/strata/registry.json...`,
    })

    const catalog = await this.getRegistryCatalog()
    const entry = catalog.find((p) => p.id.toLowerCase() === cleanId)
    if (!entry) {
      throw new Error(`Package '${cleanId}' not found in registry. Run 'strataget update'.`)
    }

    onProgress?.({
      pkgId: cleanId,
      phase: 'downloading',
      percent: 45,
      message: `Downloading /registry/${cleanId}/${entry.entry} & manifest.json...`,
    })

    const [manifestRes, wasmRes] = await Promise.all([
      fetch(`/registry/${cleanId}/manifest.json`, { cache: 'no-cache' }),
      fetch(`/registry/${cleanId}/${entry.entry}`, { cache: 'no-cache' }),
    ])

    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch manifest.json for ${cleanId} (HTTP ${manifestRes.status})`)
    }
    if (!wasmRes.ok) {
      throw new Error(`Failed to fetch ${entry.entry} for ${cleanId} (HTTP ${wasmRes.status})`)
    }

    const manifest = (await manifestRes.json()) as PackageManifest
    const wasmBytes = new Uint8Array(await wasmRes.arrayBuffer())

    onProgress?.({
      pkgId: cleanId,
      phase: 'extracting',
      percent: 70,
      message: `Writing ${wasmBytes.byteLength} bytes to /opt/strata/apps/${cleanId}/...`,
    })

    const installPath = `/opt/strata/apps/${cleanId}`
    await this.vm.exec('/bin/mkdir', ['-p', installPath])
    await this.writeFileTextInternal(
      `${installPath}/manifest.json`,
      JSON.stringify(manifest, null, 2)
    )
    await this.writeFileBytesInternal(`${installPath}/${manifest.entry}`, wasmBytes)
    await this.vm.exec('/bin/chmod', ['+x', `${installPath}/${manifest.entry}`])

    onProgress?.({
      pkgId: cleanId,
      phase: 'registering',
      percent: 85,
      message: `Registering in /etc/strata/installed.json & /usr/local/bin/${cleanId}...`,
    })

    await this.ensureBinWrapper(cleanId)

    const installedMap = await this.getInstalledMap()
    const record: InstalledPackageRecord = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      category: manifest.category,
      type: manifest.type,
      entry: manifest.entry,
      icon: manifest.icon,
      description: manifest.description,
      permissions: manifest.permissions,
      installPath,
      binPath: `/usr/local/bin/${cleanId}`,
      installedAt: new Date().toISOString(),
      sizeBytes: wasmBytes.byteLength,
    }
    installedMap[cleanId] = record

    const registryFile: InstalledRegistryFile = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      packages: installedMap,
    }
    await this.writeFileTextInternal(
      '/etc/strata/installed.json',
      JSON.stringify(registryFile, null, 2)
    )

    onProgress?.({
      pkgId: cleanId,
      phase: 'syncing',
      percent: 95,
      message: 'Flushing ext4 block device to persistent IndexedDB...',
    })

    await this.vm.exec('/bin/sync', [])
    await this.vm.sync({ timeout: 1500 })

    onProgress?.({
      pkgId: cleanId,
      phase: 'complete',
      percent: 100,
      message: `Installed ${manifest.name} v${manifest.version}`,
    })

    const allInstalled = Object.values(installedMap).sort((a, b) => a.name.localeCompare(b.name))
    this.notifyPackagesChanged(allInstalled)
    this.notifyFsChanged('/opt/strata/apps')
    this.notifyFsChanged('/etc/strata')
    this.notifyFsChanged('/usr/local/bin')

    return record
  }

  async sideloadPackage(
    manifestJson: string,
    wasmBuffer: ArrayBuffer
  ): Promise<InstalledPackageRecord> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel is offline')

    const manifest = JSON.parse(manifestJson) as PackageManifest
    if (!manifest.id || !manifest.name || !manifest.entry) {
      throw new Error('Invalid manifest.json: must include id, name, and entry')
    }
    const cleanId = manifest.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    manifest.id = cleanId

    const wasmBytes = new Uint8Array(wasmBuffer)
    if (!WebAssembly.validate(wasmBytes)) {
      throw new Error(`Invalid WebAssembly binary for ${manifest.entry} (failed magic/validation)`)
    }

    const installPath = `/opt/strata/apps/${cleanId}`
    await this.vm.exec('/bin/mkdir', ['-p', installPath])
    await this.writeFileTextInternal(
      `${installPath}/manifest.json`,
      JSON.stringify(manifest, null, 2)
    )
    await this.writeFileBytesInternal(`${installPath}/${manifest.entry}`, wasmBytes)
    await this.vm.exec('/bin/chmod', ['+x', `${installPath}/${manifest.entry}`])

    await this.ensureBinWrapper(cleanId)

    const installedMap = await this.getInstalledMap()
    const record: InstalledPackageRecord = {
      id: cleanId,
      name: manifest.name,
      version: manifest.version || '1.0.0',
      author: manifest.author || 'Community Sideload',
      category: manifest.category || 'WASM Utilities',
      type: manifest.type || 'wasm-gui',
      entry: manifest.entry,
      icon: manifest.icon || 'Box',
      description: manifest.description || 'Sideloaded WebAssembly application',
      permissions: manifest.permissions || ['fs:read'],
      installPath,
      binPath: `/usr/local/bin/${cleanId}`,
      installedAt: new Date().toISOString(),
      sizeBytes: wasmBytes.byteLength,
      sideloaded: true,
    }
    installedMap[cleanId] = record

    await this.writeFileTextInternal(
      '/etc/strata/installed.json',
      JSON.stringify(
        {
          version: '1.0.0',
          updatedAt: new Date().toISOString(),
          packages: installedMap,
        },
        null,
        2
      )
    )

    await this.vm.exec('/bin/sync', [])
    await this.vm.sync({ timeout: 1500 })

    const allInstalled = Object.values(installedMap).sort((a, b) => a.name.localeCompare(b.name))
    this.notifyPackagesChanged(allInstalled)
    this.notifyFsChanged('/opt/strata/apps')
    this.notifyFsChanged('/etc/strata')

    return record
  }

  async removePackage(pkgId: string): Promise<void> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel is offline')

    const cleanId = pkgId.trim().toLowerCase()
    const installedMap = await this.getInstalledMap()
    if (!installedMap[cleanId]) {
      throw new Error(`Package '${cleanId}' is not currently installed.`)
    }

    await this.vm.exec('/bin/rm', ['-rf', `/opt/strata/apps/${cleanId}`, `/usr/local/bin/${cleanId}`])
    delete installedMap[cleanId]

    const registryFile: InstalledRegistryFile = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      packages: installedMap,
    }
    await this.writeFileTextInternal(
      '/etc/strata/installed.json',
      JSON.stringify(registryFile, null, 2)
    )

    await this.vm.exec('/bin/sync', [])
    await this.vm.sync({ timeout: 1500 })

    const allInstalled = Object.values(installedMap).sort((a, b) => a.name.localeCompare(b.name))
    this.notifyPackagesChanged(allInstalled)
    this.notifyAppAction({ type: 'close', pkgId: cleanId })
    this.notifyFsChanged('/opt/strata/apps')
    this.notifyFsChanged('/etc/strata')
    this.notifyFsChanged('/usr/local/bin')
  }

  async loadInstalledAppBinary(pkgId: string): Promise<{
    manifest: PackageManifest
    wasmBuffer: ArrayBuffer
  }> {
    if (!this.vm) await this.boot()
    const cleanId = pkgId.trim().toLowerCase()
    const installPath = `/opt/strata/apps/${cleanId}`
    const manifestText = await this.readFileTextInternal(`${installPath}/manifest.json`)
    const manifest = JSON.parse(manifestText) as PackageManifest
    const bytes = await this.readFileBytesInternal(`${installPath}/${manifest.entry}`)
    const copy = bytes.slice().buffer
    return Comlink.transfer({ manifest, wasmBuffer: copy }, [copy])
  }

  // ============================================================================
  // Linux Filesystem Operations for Strata Files, Strata Code & Command Palette
  // ============================================================================

  async listDirectory(dirPath: string): Promise<FsEntry[]> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel offline')

    const cleanDir = dirPath.replace(/\/+$/, '') || '/'
    const script = `
cd "${cleanDir}" 2>/dev/null || exit 1
for f in * .[!.]* ..?*; do
  [ -e "$f" ] || [ -L "$f" ] || continue
  stat -c "%n|%F|%s|%a|%A|%Y" "$f" 2>/dev/null || true
done
`
    const res = await this.vm.exec('/bin/sh', ['-c', script])
    if (res.exitCode !== 0) {
      throw new Error(`Directory not found: ${cleanDir}`)
    }

    const entries: FsEntry[] = []
    for (const line of res.stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parts = trimmed.split('|')
      if (parts.length < 6) continue
      const [name, rawType, rawSize, mode, permissions, rawMtime] = parts
      if (name === '.' || name === '..') continue

      let type: FsEntry['type'] = 'file'
      if (rawType.includes('directory')) type = 'dir'
      else if (rawType.includes('symbolic link')) type = 'symlink'

      const fullPath = cleanDir === '/' ? `/${name}` : `${cleanDir}/${name}`
      const epochSec = parseInt(rawMtime, 10) || Math.floor(Date.now() / 1000)
      entries.push({
        name,
        path: fullPath,
        type,
        size: parseInt(rawSize, 10) || 0,
        mode,
        permissions,
        mtime: new Date(epochSec * 1000).toISOString(),
      })
    }

    return entries.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1
      if (a.type !== 'dir' && b.type === 'dir') return 1
      return a.name.localeCompare(b.name)
    })
  }

  async readFileText(filePath: string): Promise<string> {
    if (!this.vm) await this.boot()
    return await this.readFileTextInternal(filePath)
  }

  async readFileBytes(filePath: string): Promise<ArrayBuffer> {
    if (!this.vm) await this.boot()
    const bytes = await this.readFileBytesInternal(filePath)
    const ab = bytes.slice().buffer
    return Comlink.transfer(ab, [ab])
  }

  async writeFileText(filePath: string, content: string): Promise<void> {
    if (!this.vm) await this.boot()
    await this.writeFileTextInternal(filePath, content)
    await this.vm?.sync({ timeout: 1500 })
    const parent = filePath.substring(0, filePath.lastIndexOf('/')) || '/'
    this.notifyFsChanged(parent)
  }

  async writeFileBytes(filePath: string, buffer: ArrayBuffer): Promise<void> {
    if (!this.vm) await this.boot()
    await this.writeFileBytesInternal(filePath, new Uint8Array(buffer))
    await this.vm?.sync({ timeout: 1500 })
    const parent = filePath.substring(0, filePath.lastIndexOf('/')) || '/'
    this.notifyFsChanged(parent)
  }

  async createDirectory(dirPath: string): Promise<void> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel offline')
    await this.vm.exec('/bin/mkdir', ['-p', dirPath])
    await this.vm.sync({ timeout: 1500 })
    const parent = dirPath.substring(0, dirPath.lastIndexOf('/')) || '/'
    this.notifyFsChanged(parent)
  }

  async deletePath(targetPath: string): Promise<void> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel offline')
    if (targetPath === '/' || targetPath === '/data' || targetPath === '/bin') {
      throw new Error(`Refusing to delete protected system path: ${targetPath}`)
    }
    await this.vm.exec('/bin/rm', ['-rf', targetPath])
    await this.vm.sync({ timeout: 1500 })
    const parent = targetPath.substring(0, targetPath.lastIndexOf('/')) || '/'
    this.notifyFsChanged(parent)
  }

  async renamePath(oldPath: string, newPath: string): Promise<void> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel offline')
    await this.vm.exec('/bin/mv', [oldPath, newPath])
    await this.vm.sync({ timeout: 1500 })
    const parent = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/'
    this.notifyFsChanged(parent)
  }

  async searchUserFiles(): Promise<string[]> {
    if (!this.vm) await this.boot()
    if (!this.vm) return []
    const res = await this.vm.exec('/bin/sh', [
      '-c',
      'find /root /home /etc/strata /opt/strata/apps -maxdepth 3 -type f 2>/dev/null',
    ])
    if (res.exitCode !== 0) return []
    return res.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  async execCommand(command: string, args: string[] = []): Promise<ExecCommandResult> {
    if (!this.vm) await this.boot()
    if (!this.vm) throw new Error('Kernel offline')
    const res = await this.vm.exec(command, args, {
      env: {
        PATH: '/usr/local/bin:/run/kw/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin',
        HOME: '/root',
      },
    })
    return {
      stdout: res.stdout,
      stderr: res.stderr,
      exitCode: res.exitCode ?? 0,
    }
  }

  // ============================================================================
  // Diagnostics, Metrics, Heartbeat, Reboot & Factory Disk Reset
  // ============================================================================

  async ping(): Promise<number> {
    return performance.now()
  }

  async getMetrics(): Promise<KernelMetrics> {
    if (!this.vm) {
      return {
        status: this.status,
        bootStage: this.bootStage,
        kernelBanner: this.kernelBanner,
        uptimeMs: 0,
        memoryMiB: 0,
        cpus: 1,
        compileMs: 0,
        blockReads: 0,
        blockWrites: 0,
        blockFlushes: 0,
        bytesRead: 0,
        bytesWritten: 0,
        jitCompiled: 0,
        jitLive: 0,
        jitCompileMs: 0,
        diskPersistent: true,
        diskOverlayBlocks: 0,
        diskMemBytes: 0,
      }
    }

    const st = this.vm.stats()
    return {
      status: this.status,
      bootStage: this.bootStage,
      kernelBanner: this.kernelBanner,
      uptimeMs: st.uptimeMs,
      memoryMiB: this.vm.memoryMiB,
      cpus: st.cpus,
      compileMs: st.compileMs,
      blockReads: st.block.reads,
      blockWrites: st.block.writes,
      blockFlushes: st.block.flushes,
      bytesRead: st.block.bytesRead,
      bytesWritten: st.block.bytesWritten,
      jitCompiled: st.jit.compiled,
      jitLive: st.jit.live,
      jitCompileMs: st.jit.compileMs,
      diskPersistent: true,
      diskOverlayBlocks: Math.round(st.block.bytesWritten / 4096),
      diskMemBytes: st.block.bytesWritten,
    }
  }

  async getDmesgLogs(): Promise<DmesgEntry[]> {
    return this.dmesgLogs
  }

  async syncDisk(): Promise<boolean> {
    if (!this.vm) return false
    await this.vm.exec('/bin/sync', [])
    return await this.vm.sync({ timeout: 1500 })
  }

  async rebootKernel(): Promise<void> {
    if (this.vm) {
      try {
        await this.vm.sync({ timeout: 1500 })
        await this.vm.stop({ code: 0, reason: 'reboot' })
      } catch {
        // ignore
      }
      this.vm = null
    }
    if (this.wasiServer) {
      try {
        this.wasiServer.close()
      } catch {
        // ignore
      }
      this.wasiServer = null
    }
    this.ptySessions.clear()
    this.dmesgLogs = []
    this.nextDmesgId = 1
    await this.boot()
  }

  async factoryResetDisk(): Promise<void> {
    if (this.vm) {
      try {
        await this.vm.stop({ code: 0, reason: 'factory-reset' })
      } catch {
        // ignore
      }
      this.vm = null
    }
    if (this.wasiServer) {
      try {
        this.wasiServer.close()
      } catch {
        // ignore
      }
      this.wasiServer = null
    }
    await resetDataDisk()
    this.ptySessions.clear()
    this.dmesgLogs = []
    this.nextDmesgId = 1
    await this.boot()
  }

  // ============================================================================
  // Event Subscriptions (Comlink.proxy callbacks)
  // ============================================================================

  onStatusChange(cb: (status: KernelStatus, stage: string) => void): void {
    this.onStatusListeners.push(cb)
    cb(this.status, this.bootStage)
  }

  onDmesg(cb: (entries: DmesgEntry[]) => void): void {
    this.onDmesgListeners.push(cb)
  }

  onPackagesChanged(cb: (installed: InstalledPackageRecord[]) => void): void {
    this.onPackagesChangedListeners.push(cb)
  }

  onFsChanged(cb: (dirPath: string) => void): void {
    this.onFsChangedListeners.push(cb)
  }

  onAppAction(
    cb: (action: { type: 'launch' | 'close'; pkgId: string; args?: string[] }) => void
  ): void {
    this.onAppActionListeners.push(cb)
  }

  private notifyPackagesChanged(installed: InstalledPackageRecord[]) {
    for (const cb of this.onPackagesChangedListeners) {
      try {
        cb(installed)
      } catch {
        // ignore
      }
    }
  }

  private notifyFsChanged(dirPath: string) {
    for (const cb of this.onFsChangedListeners) {
      try {
        cb(dirPath)
      } catch {
        // ignore
      }
    }
  }

  private notifyAppAction(action: { type: 'launch' | 'close'; pkgId: string; args?: string[] }) {
    for (const cb of this.onAppActionListeners) {
      try {
        cb(action)
      } catch {
        // ignore
      }
    }
  }
}

const workerInstance = new StrataKernelWorker()
Comlink.expose(workerInstance)
export type { StrataKernelWorker }
