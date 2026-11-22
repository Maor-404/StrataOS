# StrataOS v1.0.0 ("Bedrock") — Organic Launch & Distribution Playbook

> **Live Deployment Note:** This playbook currently references the active temporary Vercel deployment (`https://sonic-koto-mowjpsl.tmp.now`). Once you claim the deployment or bind a permanent Vercel/custom domain, find-and-replace that URL across `index.html`, `README.md`, `src/strata.config.ts`, and the templates below before launch morning.

---

## Ground Rules (Why Organic Velocity Beats Everything)

1. **Zero vote rings, zero star-for-star swaps, zero paid boosts.** Hacker News actively runs voting-ring detection that silently demotes submissions receiving direct-link upvote clusters; GitHub Trending filters out inorganic star spikes and bot accounts. Every star and upvote must come from genuine developers clicking the live demo.
2. **Optimize for the 10-Second Skepticism Window.** Developers assume browser OS demos are fake React mockups. Always lead with the zero-login live link so visitors watch **StrataUEFI POST -> KDE Plasma 6 Breeze Desktop -> real Linux 7.3 kernel -> `strataget install pixelsynth` -> survives hard browser refresh**.
3. **Concentrate launch energy in a single Tuesday–Thursday morning window (EST).** GitHub Trending ranks **24-hour star velocity**, not lifetime stars. Coordinating Show HN, Reddit, X, and Product Hunt across the same day compounds referrals into dev newsletters automatically.

---

## Hour-by-Hour Launch Day Timeline (Tuesday–Thursday, EST)

| Time (EST) | Channel / Action | Goal & Checklist |
| :--- | :--- | :--- |
| **08:00 AM** | **Production Live Check** | Open `https://sonic-koto-mowjpsl.tmp.now` in an incognito Chrome window. Verify in DevTools: `window.crossOriginIsolated === true`, `COOP: same-origin` + `COEP: require-corp` headers present, `?app=webgpu`, `?boot=uefi`, and `?install=pixelsynth` all work cleanly with zero console errors. |
| **08:30 AM** | **Asset Verification** | Confirm GitHub repo description, Topics, Social Preview (`public/og-preview.png`), pinned Live Demo URL, and the 15-second native MP4 screen capture (POST -> Plasma 6 -> `strataget install pixelsynth` -> hard refresh). |
| **09:00 AM** | **Hacker News (`Show HN`)** | Submit the live demo URL (or GitHub repo) with a humble, factual title. Post the technical maker comment **within 2 minutes** explaining `unkernel`, `SharedArrayBuffer`, IndexedDB `ext4`, and trade-offs. Stay online to reply thoughtfully to every question for 3 hours. |
| **09:30 AM** | **X / Twitter Thread** | Publish a 4-post thread with the **native auto-playing 15s clip or 3D Blender trailer** attached to Post 1. Put the live demo + GitHub link in Post 2 (keeps Post 1 native video reach higher). |
| **10:00 AM** | **Reddit Wave 1 (`r/WebAssembly`, `r/linux`)** | Post architecture-focused write-ups tailored to each subreddit's rules (no cross-post spam; write distinct titles and context). |
| **11:00 AM** | **Reddit Wave 2 (`r/kde`, `r/unixporn`, `r/webdev`)** | Share Breeze Dark/Light screenshots + floating-to-flush Plasma 6 panel GIF + Desktop Edit Mode plasmoids. Follow `r/unixporn` detail-comment rules (OS, DE/WM, font, color scheme, live URL). |
| **12:00 PM** | **Product Hunt** | Go live with clean gallery screenshots (StrataUEFI, Plasma 6 Breeze Desktop, Strata Store + `strataget`, WebGPU Compute Studio) and a 60s demo video. |
| **02:00 PM** | **Newsletter & Creator Outreach** | Send the 3-sentence pitch below to TLDR, Console.dev, and WasmWeekly while HN/GitHub momentum is visibly live. |
| **04:00 PM** | **Dev.to / Hashnode Engineering Post** | Publish the technical breakdown (*"How We Boot Linux 7.3 + KDE Plasma 6 Inside One Browser Tab With Zero Backend"*) linking back to the repo and live demo. |
| **06:00 PM** | **Awesome Lists & Directories** | Open clean, single-line PRs to `awesome-wasm`, `awesome-vite`, `awesome-linux`, `madewithwebassembly.com`, and submit to AlternativeTo. |

---

## Community Copy-Paste Launch Templates

### 1. Hacker News (`Show HN`) — Humble & Technical

**Title:**
> Show HN: StrataOS – Real Linux 7.3 kernel + KDE Plasma 6 desktop in one browser tab

**Maker Comment (post immediately after submitting):**
> Hey HN, I built StrataOS, a zero-backend Web OS that boots a real compiled Linux 7.3 kernel (`pithings/unkernel` on arch/wasm) inside a dedicated Web Worker with a KDE Plasma 6 Breeze desktop on top.
>
> Live demo (no login): https://sonic-koto-mowjpsl.tmp.now  
> Repo (MIT): https://github.com/Maor-404/StrataOS
>
> Because most browser "OS" projects are static UI mockups, here's the fastest 10-second verification:
> 1. Watch the 1.5s StrataUEFI POST splash (hit F2/DEL or visit `?boot=uefi` to enter NVRAM setup + interactive EFI shell).
> 2. Open Terminal and run `uname -a && strataget install pixelsynth`.
> 3. Hard-refresh the tab—the package and files in `/opt/strata/apps` and `/root` persist on a copy-on-write `ext4` image stored in IndexedDB (`kwdisk:kwdata-v1`).
>
> Key architectural choices & trade-offs:
> - **Main thread isolation:** The kernel runs inside `kernelWorker.ts` bridged via `comlink` with `Comlink.transfer()` for zero-copy `ArrayBuffer` payloads and 16ms PTY batching into xterm.js WebGL.
> - **COOP/COEP:** Served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for `SharedArrayBuffer` / WASM threads.
> - **Package sync:** `/usr/local/bin/strataget` CLI and the Strata Store GUI share `/etc/strata/installed.json` as a single source of truth, supporting custom `.wasm` sideloading.
> - **Plasma 6 UI:** Floating panel that animates flush on maximize, KRunner (`Alt+Space`) with safe inline math & `/root` search, Plasma Overview (`Ctrl+Up`), and IndexedDB-persisted Desktop Edit Mode plasmoids.
>
> Known limitations: `unkernel` runs single-tab storage per origin, WebGPU Studio requires a WebGPU-capable browser (gracefully degrades otherwise), and Strata Copilot prefers Chrome's Built-in AI `LanguageModel` API with BYOK fallback.
>
> Would love feedback on the `strataget` manifest format, worker RPC latency, or anything that breaks on your browser/OS.

---

### 2. Reddit `r/kde` & `r/unixporn` — Visual & Plasma 6 Fidelity

**Title (`r/kde`):**
> [Showcase] I recreated KDE Plasma 6 (Breeze Dark/Light, Floating Panel, KRunner, Overview & Edit Mode Plasmoids) running on a real Linux 7.3 kernel inside one browser tab

**Title (`r/unixporn`):**
> [Plasma 6 / Browser] StrataOS v1.0 — Real Linux 7.3 + Breeze Dark running natively in a browser tab (zero backend)

**Body / Details Comment:**
> **Live interactive demo:** https://sonic-koto-mowjpsl.tmp.now  
> **Source (MIT):** https://github.com/Maor-404/StrataOS
>
> - **Kernel:** Real Linux 7.3.4 (`pithings/unkernel` WASM in a Web Worker) + persistent IndexedDB `ext4`
> - **DE / Theme:** Custom KDE Plasma 6 Breeze Dark (`#1b1e20` / `#232629` / `#31363b`) + Breeze Light toggle & live custom accent color picker (auto-contrast text)
> - **Panel:** Floating bottom panel (`blur(20px) saturate(180%)`) that animates flush (`margin: 0, radius: 0`) whenever a window maximizes
> - **WM / Effects:** 34px Breeze title bars (Keep Above/Pin, Min, Max, Close), KWin layered shadows + active accent rim glow, optional Wobbly Windows toggle, and Plasma Overview (`Ctrl+Up` / `Alt+Tab`) with Virtual Desktops 1–3
> - **Launcher & Widgets:** Kickoff launcher, top-center KRunner (`Alt+Space`, supports inline math like `256 * 12`), and right-click **Desktop Edit Mode** with draggable/resizable System Monitor rings, Analog/Digital Clock, Sticky Note, and Quick Launch plasmoids
> - **Fonts:** Geist Sans (UI) & Geist Mono (Terminal, StrataUEFI, Code)

---

### 3. Reddit `r/WebAssembly` — WASM Runtime & `strataget` Architecture

**Title:**
> StrataOS v1.0: Running a compiled Linux 7.3 kernel (`unkernel`) + a synced CLI/GUI WASM package manager (`strataget`) entirely in a browser tab

**Body:**
> I just shipped **StrataOS v1.0.0 ("Bedrock")**, an open-source browser-native Linux Web OS designed around zero-backend WebAssembly execution:
>
> - **Live Demo:** https://sonic-koto-mowjpsl.tmp.now
> - **Repo:** https://github.com/Maor-404/StrataOS
>
> **How the WASM stack works:**
> 1. **Kernel Worker:** `pithings/unkernel` (Linux 7.3.4 on `arch/wasm`) boots inside a dedicated Web Worker with `COOP: same-origin` / `COEP: require-corp` and `SharedArrayBuffer`.
> 2. **Zero-copy Comlink RPC:** File I/O, `.wasm` binaries, and terminal chunks cross the worker boundary via `Comlink.transfer()` so the 120fps Plasma 6 desktop never stalls.
> 3. **`strataget` + Strata Store:** Installing via `strataget install pixelsynth` in the terminal or clicking Install in Strata Store writes the exact same `.wasm` binary to `/opt/strata/apps/<id>/` and `/etc/strata/installed.json` on the IndexedDB-backed `ext4` disk—surviving hard reloads.
> 4. **Custom `.wasm` Sideloading:** Drag and drop your own `.wasm` module + manifest directly inside Strata Store (or submit a community app via GitHub Issues).
>
> Happy to dive into the `unkernel` worker bridge, IndexedDB ext4 flush behavior, or WebGPU WGSL Studio integration!

---

### 4. Reddit `r/linux` & `r/webdev` — Short High-Signal Pitch

**Title (`r/linux`):**
> StrataOS v1.0: Boot a real Linux 7.3 kernel past a working UEFI firmware into a KDE Plasma 6 desktop in one browser tab (zero backend, persistent ext4)

**Title (`r/webdev`):**
> Built a browser-native Linux 7.3 + KDE Plasma 6 Web OS with WebAssembly, Web Workers, Comlink, WebGPU Compute Shaders, Native Popover API, and View Transitions

**Body:**
> Try the 10-second live proof (no signup): https://sonic-koto-mowjpsl.tmp.now  
> GitHub (MIT): https://github.com/Maor-404/StrataOS
>
> Try deep links directly into features:
> - `?boot=uefi` — Pre-boot StrataUEFI firmware setup & interactive EFI shell
> - `?app=webgpu` — WebGPU WGSL Compute Playground & 120fps shader wallpaper
> - `?install=pixelsynth` — Auto-installs and launches a WASM app via `strataget` into persistent IndexedDB `ext4`

---

### 5. X / Twitter Launch Thread (4 Posts)

- **Post 1 (attach native 15s auto-playing video / 3D trailer — no external link in Post 1):**
  > Most browser "OS" demos are fake React divs.
  >
  > I built **StrataOS v1.0**: a REAL Linux 7.3 kernel booting past working UEFI firmware into a KDE Plasma 6 Breeze desktop — inside a single browser tab, with zero backend.
  >
  > Install a WASM app with `strataget`, hit refresh, and it's still on `ext4`. 🧵👇
- **Post 2 (live link + repo):**
  > Test it in 10 seconds (no login): https://sonic-koto-mowjpsl.tmp.now
  > Open-source (MIT): https://github.com/Maor-404/StrataOS
  >
  > Try `Alt+Space` for KRunner (`256 * 12`), `Ctrl+Up` for Plasma Overview, or right-click the desktop -> **Enter Edit Mode** to drag live Plasmoids.
- **Post 3 (under the hood):**
  > Under the hood:
  > • `pithings/unkernel` Linux 7.3.4 compiled to WASM inside a dedicated Web Worker
  > • Zero-copy `Comlink.transfer()` + `SharedArrayBuffer` (COOP/COEP)
  > • Persistent `ext4` disk in IndexedDB + Time Machine GZIP snapshots
  > • WebGPU WGSL Compute Studio + Chrome Built-in AI Copilot
- **Post 4 (community CTA):**
  > Fork the entire distro from a single config file (`src/strata.config.ts`) or submit your own `.wasm` app to the `strataget` registry in Strata Store.
  >
  > If this blew your mind even a little, a ⭐ on GitHub helps more Linux & WASM builders find it!

---

## 3-Sentence Newsletter & Creator Outreach Template

Send to **TLDR** (`submissions@tldr.tech`), **Console.dev** (`hello@console.dev`), and **WasmWeekly** (`wasmweekly.news`):

> **Subject:** StrataOS v1.0 — Real Linux 7.3 kernel + KDE Plasma 6 + WASM package manager in one browser tab
>
> Hi [Name], I just open-sourced **StrataOS v1.0** (MIT), a zero-backend Web OS that boots a compiled Linux 7.3 kernel (`pithings/unkernel` WASM in a Web Worker) past a working UEFI firmware into a KDE Plasma 6 Breeze desktop with persistent IndexedDB `ext4` storage.
>
> Readers can verify it in 10 seconds with zero login at https://sonic-koto-mowjpsl.tmp.now — run `strataget install pixelsynth`, hard-refresh the browser, and watch the WASM package survive on disk (or jump straight into `?boot=uefi` / `?app=webgpu`).
>
> Repo with architecture docs and one-file distro remixing: https://github.com/Maor-404/StrataOS — thanks for considering it for [Newsletter Name]!

---

## Awesome-List PR Checklist & Directories

### Awesome Lists (Copy-Paste One-Liners)

- [ ] **`mbasso/awesome-wasm`** (under *Operating Systems* or *Web Applications*):
  ```markdown
  - [StrataOS](https://github.com/Maor-404/StrataOS) - Browser-native Linux 7.3 Web OS powered by `unkernel` WASM, a KDE Plasma 6 desktop, persistent IndexedDB `ext4`, and the `strataget` WASM package manager.
  ```
- [ ] **`vitejs/awesome-vite`** (under *Showcase* / *Apps*):
  ```markdown
  - [StrataOS](https://github.com/Maor-404/StrataOS) - High-performance Linux 7.3 + KDE Plasma 6 browser Web OS built with Vite, React, TypeScript, Web Workers (`comlink`), and WebGPU compute shaders.
  ```
- [ ] **`aleksandar-todorovic/awesome-linux`** (under *Online Linux* / *Browser*):
  ```markdown
  - [StrataOS](https://github.com/Maor-404/StrataOS) - Zero-backend Linux 7.3 Web Operating System in the browser with UEFI firmware setup, KDE Plasma 6 desktop, and persistent `ext4` storage.
  ```
- [ ] **`madewithwebassembly.com`** (Submit PR to `torch2424/made-with-webassembly`):
  - **Title:** StrataOS
  - **Summary:** Browser-native Linux 7.3 Web OS with KDE Plasma 6 Breeze UI, StrataUEFI firmware, persistent IndexedDB `ext4`, and the `strataget` WASM package manager.
  - **Live URL:** `https://sonic-koto-mowjpsl.tmp.now`
  - **Source URL:** `https://github.com/Maor-404/StrataOS`

### Directories, SEO & Long-Tail Discovery

- [ ] **AlternativeTo:** Submit StrataOS as an open-source, browser-based alternative to *Puter*, *DaedalOS*, *WebVM*, and *JSLinux*.
- [ ] **GitHub Repository Topics** (paste into Repo Settings -> About -> Topics):
  `linux`, `webassembly`, `wasm`, `kde-plasma`, `web-os`, `browser-os`, `unkernel`, `webgpu`, `vite`, `typescript`, `react`, `package-manager`, `uefi`, `indexeddb`
- [ ] **Dev.to & Hashnode Technical Article Outline:**
  - *Title:* **How We Booted Linux 7.3 + KDE Plasma 6 Inside a Single Browser Tab (Zero Backend)**
  - *Section 1:* Why `SharedArrayBuffer` + COOP/COEP + `Comlink.transfer()` matter for 120fps desktop responsiveness.
  - *Section 2:* Syncing `/usr/local/bin/strataget` CLI and Strata Store GUI via `/etc/strata/installed.json` on IndexedDB `ext4`.
  - *Section 3:* Modern 2026 Web APIs in production: Popover API + CSS Anchor Positioning, View Transitions, `contrast-color()`, WebGPU WGSL Compute, and Chrome Built-in AI.
  - *Section 4:* How to fork your own Web OS distro in 60 seconds with `src/strata.config.ts`.
