# StrataOS v1.0.0 ("Bedrock") — Blender 4.x 3D Launch Trailer Pipeline

A modular, procedural **Blender 4.x Python (`bpy`)** 3D animation pipeline that constructs and renders the **60-second (3,600 frames @ 60fps), 1920×1080 cinematic launch film** for **StrataOS v1.0.0 ("Bedrock")**.

---

## 1. Architecture Overview

```text
strata_trailer/
├── config.py                        # 1080p/60fps timeline, linear sRGB palette, CLI parser
├── materials.py                     # Blender 4.x Principled BSDF procedural shaders
├── ui_textures.py                   # Pillow 2048x1280 high-DPI OS window texture renderer
├── geometry.py                      # Beveled glass OS windows, WASM cubes, 2,200 particles, Lissajous
├── camera_rig.py                    # Tracked 35-85mm cinema camera, f/2.0-f/2.8 rack focus, Bezier/spring
├── render_strataos.py               # Master scene builder, AgX + Fog Glow compositor, FFmpeg H.264 output
├── README_RENDER.md                 # CLI execution & rendering guide
├── assets/
│   └── textures/                    # Procedurally generated 2048x1280 PNG window surfaces
└── scenes/
    ├── act1_monolith_uefi.py        # Frames    1–600  (0:00–0:10): Monolith split & StrataUEFI POST
    ├── act2_kernel_wasm.py          # Frames  601–1200 (0:10–0:20): unkernel WASM blocks & Comlink ribbons
    ├── act3_desktop_materialize.py  # Frames 1201–1920 (0:20–0:32): 3D Desktop & spring-physics windows
    ├── act4_strataget_delivery.py   # Frames 1921–2520 (0:32–0:42): strataget install & WASM cube unfold
    ├── act5_flagship_montage.py     # Frames 2521–3180 (0:42–0:53): WebGPU Studio, Copilot IDE, ByteScope
    └── act6_bedrock_finale.py       # Frames 3181–3600 (0:53–1:00): StrataOS Emblem & Bedrock Finale
```

---

## 2. Prerequisites

1. **Blender 4.0 / 4.1 / 4.2 / 4.3+** installed and accessible on your `PATH` as `blender`.
2. **Pillow (`PIL`)** installed in Python (or inside Blender's bundled Python) to generate the `2048×1280` UI window textures:
   ```bash
   python3 strata_trailer/ui_textures.py
   ```
   *(Running `ui_textures.py` standalone pre-generates all 8 high-DPI PNG textures in `strata_trailer/assets/textures/` so Blender loads them directly).*

---

## 3. Terminal Commands

### A. Generate `.blend` Project File Only (Fast Viewport Inspection)
Builds the entire 6-Act 3D scene, procedural shaders, 3-point Area rim lights, volumetric world, compositor node graph, and 3,600-frame camera animation into `strata_trailer/output/strataos_trailer.blend` without rendering frames:

```bash
blender --background --python strata_trailer/render_strataos.py -- --save-only
```

Open `strata_trailer/output/strataos_trailer.blend` in Blender 4.x and press `Spacebar` in Camera View (`Numpad 0`) with Viewport Shading set to **Rendered** to scrub all 6 Acts in real time.

---

### B. Render a Fast 720p Preview (`1280×720`, EEVEE Next, 30fps effective step)
Renders a quick timing, lighting, and camera choreography check to `strata_trailer/output/strataos_v1_trailer.mp4`:

```bash
blender --background --python strata_trailer/render_strataos.py -- --preview
```

---

### C. Render the Final 1080p 60fps Master (Cycles GPU/OptiX/CUDA + OpenImageDenoise)
Renders the full **3,600-frame, 1920×1080 @ 60fps** master film using **Cycles** with automatic GPU acceleration (`OPTIX` / `CUDA` / `HIP` / `METAL`), adaptive sampling, **OpenImageDenoise**, **AgX - Medium High Contrast** color management, and the **Fog Glow + Lens Dispersion (`0.003`)** compositor pass:

```bash
blender --background --python strata_trailer/render_strataos.py -- --master --cycles
```

*(To render the 1080p 60fps master using **EEVEE Next** with Raytracing enabled instead of Cycles, omit `--cycles`):*

```bash
blender --background --python strata_trailer/render_strataos.py -- --master
```
