# StrataOS — Browser-Native Linux 7.3 Web OS & `strataget` WASM Ecosystem

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
- **Unified `strataget` CLI & Strata Store Ecosystem**:
  - **Single Source of Truth**: `/etc/strata/installed.json` and `/opt/strata/apps/<app-id>/` inside the Linux `ext4` filesystem.
  - **`strataget` CLI (`/usr/local/bin/strataget`)**: Supports `update`, `search <query>`, `install <pkg>`, `remove <pkg>`, `list`, and `run <pkg> [args]`.
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

## Getting Started

```bash
# Install dependencies
npm install

# Start development server with Cross-Origin Isolation (COOP/COEP) headers
npm run dev

# Type-check and build production bundle
npm run build
```
