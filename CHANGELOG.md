# Changelog

All notable changes to **StrataOS** are documented in this file.

---

## [1.0.0] — "Bedrock" (2026-11-22)

### Flagship Release Highlights
- **Pre-Boot Firmware (`StrataUEFI`):**
  - 1.5s POST hardware splash screen with keyboard interrupt support (`F2`/`DEL` for UEFI Setup Utility, `F12` for Boot Menu, or `?boot=uefi`).
  - Persistent NVRAM configuration stored in IndexedDB (`idb-keyval`) with Boot Priority selection (*StrataOS Desktop*, *TTY Recovery Shell*, *UEFI Interactive Shell*, *Safe Mode*), Secure Boot toggle, and Fast Boot.
  - Interactive UEFI Shell supporting `help`, `map`, `memtest`, `nvram`, `reset`, and `boot`.
- **Core Linux 7.3.4 Runtime & `strataget` Ecosystem:**
  - Dedicated Web Worker (`kernelWorker.ts`) running `pithings/unkernel` (`unkernel.wasm`) with zero-copy `Comlink.transfer()` RPC and 16ms batched PTY streams.
  - Persistent Copy-on-Write `ext4` disk (`kwdisk:kwdata-v1`) bind-mounting `/opt/strata`, `/etc/strata`, `/usr/local/bin`, `/root`, and `/home`.
  - Unified `/usr/local/bin/strataget` CLI and **Strata Store** GUI with 5 pre-seeded WebAssembly packages (**HexForge**, **PixelSynth**, **CalcWASM**, **MarkView**, **JSONLab**) and drag-and-drop `.wasm` sideloading.
- **WebGPU-Only Exclusive (`Strata GPU Studio`):**
  - Strict `navigator.gpu` + `requestAdapter()` hardware detection with graceful fallback on non-WebGPU browsers.
  - Optional 120fps WGSL Compute Wallpaper, split-pane WGSL Shader/Compute Playground, and GPU Hardware Inspector & Matrix Compute Benchmark.
- **AI Assistant (`Strata Copilot`):**
  - Chrome Built-in AI (`window.LanguageModel` / `window.ai`) primary engine with BYOK OpenAI-compatible API fallback and offline Linux kernel diagnostic synthesis.
  - Safe streaming Markdown renderer with 1-click actions (*Run in Terminal*, *Apply to Strata Studio*, *Explain Last Error*).
- **Browser IDE (`Strata Studio`):**
  - `react-resizable-panels` multi-pane layout with Linux File Tree, multi-tab CodeMirror 6 editor, split-editor view, embedded terminal drawer, 1-click script runner, and `strataget` WASM App Scaffolder.
- **Windows 93–Inspired Extra Apps (`Extras`):**
  - **ByteScope:** Real-time Web Audio / AudioWorklet Bytebeat & Floatbeat algorithmic synthesizer with stereo X-Y Lissajous Oscilloscope.
  - **Melt93:** Desktop CRT / glitch shader toy with instant `ESC` panic exit.
  - **StrataPaint 93:** Retro pixel-art canvas editor that saves `.png` files directly into `/root` on the Linux `ext4` filesystem.
  - **TermArcade** & **StrataPet** desktop companions.
- **2026 Modern Web Platform Primitives & Time Machine Snapshots:**
  - Native Popover API (`popover`), View Transitions (`document.startViewTransition`) for Workspaces & Mission Control (`Alt+Tab`), Container Queries (`@container`), `Element.prototype.moveBefore` (with fallback), File System Access API (*Mount Host Folder* into `/mnt/host`), Screen Wake Lock, and **Time Machine Snapshots** (`dexie` + `fflate` compressed filesystem & NVRAM checkpoints).
- **Redistribution & Multi-Host Deployment:**
  - One-File Distro Config (`src/strata.config.ts`), `vercel.json`, `public/_headers`, `public/_redirects`, multi-stage `Dockerfile` + `nginx.conf`, and automated `.github/workflows/release.yml` static bundle archiver.
