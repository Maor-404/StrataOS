<div align="center">

<img src="public/og-preview.svg" alt="StrataOS — Real Linux 7.x Kernel & WASM Package Manager in Your Browser" width="100%" />

# StrataOS

**Real Linux 7.x Kernel & WASM Package Manager in Your Browser**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Launch_StrataOS-22d3ee?style=for-the-badge&logo=linux&logoColor=09090b)](https://strata-os.vercel.app)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMaor-404%2FStrataOS&project-name=strata-os&repository-name=strata-os)
[![Deploy Maor-404/StrataOS](https://img.shields.io/badge/Vercel-One--Click_Deploy-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMaor-404%2FStrataOS&project-name=strata-os&repository-name=strata-os)

[![Kernel: Linux 7.3.4 (unkernel)](https://img.shields.io/badge/Kernel-Linux_7.3.4_(unkernel)-34d399?style=flat-square)](https://github.com/pithings/unkernel)
[![Package Manager: strataget](https://img.shields.io/badge/CLI_%26_Store-strataget-22d3ee?style=flat-square)](#unified-strataget-cli--strata-store-ecosystem)
[![Architecture: Zero Backend](https://img.shields.io/badge/Architecture-Zero_Backend-fbbf24?style=flat-square)](#architecture-highlights)

</div>

---

**StrataOS** is a fast, minimalist, browser-native Linux Web Operating System powered by a real compiled **Linux 7.3.4** kernel (`pithings/unkernel` WebAssembly SDK), complete with a built-in CLI package manager (**`strataget`**) and a live-synced GUI App Store (**Strata Store**) that installs community WebAssembly applications directly into the persistent Linux `ext4` filesystem.

---

## Architecture Highlights

- **Real Linux 7.3.4 Kernel in a Dedicated Web Worker (`src/kernel/kernelWorker.ts`)**:
  - Runs `unkernel` (`arch/wasm` Linux kernel + `kwemu` `aarch64` userspace JIT) inside a dedicated Web Worker so syscalls, processes, and disk I/O never block the main UI thread.
  - Persistent Copy-on-Write `ext4` root data disk (`kwdisk:kwdata-v1`) backed by atomic IndexedDB transactions.
  - Zero-copy `ArrayBuffer` transfers across the Web Worker bridge via `Comlink.transfer()` and **16ms terminal output batching**.
- **120fps Hardware-Accelerated Desktop Shell (`src/shell/`)**:
  - Direct DOM `transform: translate3d(x, y, 0)` manipulation via `requestAnimationFrame` during window drag and 8-directional resize gestures, committing final coordinates to `zustand` + `immer` only on `pointerup`.
  - Dynamic `will-change: transform` compositing lifecycle and a **Performance Mode** toggle that disables `backdrop-filter: blur()` across all surfaces.
  - Workspaces (`1–3`), edge-snapping (left/right 50% split & top maximize), Floating Bottom Dock, and virtualized Command Palette (`Ctrl+K` / `Alt+Space`).

---

## Unified `strataget` CLI & Strata Store Ecosystem

- **Single Source of Truth**: `/etc/strata/installed.json` and `/opt/strata/apps/<app-id>/` inside the persistent Linux `ext4` filesystem.
- **`strataget` CLI (`/usr/local/bin/strataget`)**:
  - `strataget update` — Refreshes the local package index (`/etc/strata/registry.json`).
  - `strataget search <query>` — Searches community WASM packages by name, tag, or category.
  - `strataget install <pkg>` — Downloads and installs the package into `/opt/strata/apps/<pkg>/`, registers it in `/etc/strata/installed.json`, creates `/usr/local/bin/<pkg>`, and syncs the Dock and Strata Store live.
  - `strataget remove <pkg>` — Cleanly removes `/opt/strata/apps/<pkg>/` and `/usr/local/bin/<pkg>`, updates `/etc/strata/installed.json`, and closes any active window for that package.
  - `strataget list` — Lists installed packages, versions, and disk usage.
  - `strataget run <pkg> [args]` — Runs `wasm-cli` packages in a sandboxed WASI runner or opens `wasm-gui` windows directly from the terminal.
- **Pre-Seeded Working Community WASM Packages (`public/registry/`)**:
  1. **HexForge** (`wasm-gui`) — Binary & hexadecimal file inspector with WASM-accelerated FNV-1a checksums, Shannon entropy, and in-memory XOR transformations.
  2. **PixelSynth** (`wasm-gui`) — Interactive 60fps procedural pixel & plasma framebuffer synthesizer in linear WebAssembly memory.
  3. **CalcWASM** (`wasm-cli`) — Fast WASI Preview 1 command-line scientific and bitwise expression evaluator (`calcwasm "2^16 + sqrt(144)"`).
  4. **MarkView** (`wasm-gui`) — Split-pane Markdown editor and previewer for `.md` files in `/root` and `/home`.
  5. **JSONLab** (`wasm-gui`) — High-speed JSON formatter, path query workbench, and config inspector.

---

## Built-In Native Applications

1. **Strata Terminal** — GPU-accelerated (`@xterm/xterm` + `@xterm/addon-webgl`) multi-tab Linux PTY shell wired to `/dev/pts/*` with `strataget` pre-installed on `PATH`.
2. **Strata Store** — Virtualized GUI package manager synced two-way with `strataget` plus drag-and-drop `.wasm` + `manifest.json` sideloading.
3. **Strata Files** — Virtualized Linux file explorer with two-way terminal sync, drag-and-drop host upload, host file download, and `/opt/strata/apps/` inspection.
4. **Strata Code** — Modular CodeMirror 6 editor with syntax highlighting, `Ctrl+S` save to Linux `ext4`, and one-click **"Run in Terminal"**.
5. **Strata Monitor** — Virtualized `dmesg` kernel log viewer, worker heartbeat latency, `kwemu` JIT counters, IndexedDB quota bar, Persistent Storage lock, and Factory Disk Reset utility.
6. **Strata Settings** — Procedural dark desktop surfaces, accent colors, Performance Mode toggle, and keyboard shortcuts.

---

## Getting Started & Deployment

```bash
# Install dependencies
npm install

# Start development server with Cross-Origin Isolation (COOP/COEP) headers
npm run dev

# Build production bundle & verify with local preview server
npm run build
npm run preview
```

### Deploying to Vercel (Hobby Tier)

StrataOS includes a pre-configured [`vercel.json`](./vercel.json) with mandatory `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin` headers for `.wasm` and `/registry/*` assets, immutable `/assets/*` caching, and SPA deep-link rewrites (`/?app=store`, `/?install=hexforge`).

See [`docs/SUBMISSION_KIT.md`](./docs/SUBMISSION_KIT.md) for Awesome-List submission snippets and GitHub repository discoverability steps.
