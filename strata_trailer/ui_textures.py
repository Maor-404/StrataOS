"""
StrataOS v1.0.0 ("Bedrock") — High-DPI Procedural 2048x1280 UI Texture Generator
================================================================================
Uses Pillow (PIL) to render razor-sharp 2048x1280 dark glassmorphic interfaces
for the 3D floating OS windows in the Blender 4.x launch trailer.
"""

from __future__ import annotations
import math
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

from config import TEXTURES_DIR

TEX_W = 2048
TEX_H = 1280
TITLE_BAR_H = 72  # 36px @ 2x Retina DPI


def _load_font(size: int, mono: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Load a crisp monospace or sans system font with safe fallback."""
    candidates = (
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
            "/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf",
        ]
        if mono
        else [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
    )
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def _create_window_canvas(title: str, subtitle_badge: str = "WASM • EXT4") -> tuple[Image.Image, ImageDraw.ImageDraw]:
    """Create a 2048x1280 Linear/Sequoia dark window canvas with a 36px-proportion title bar."""
    img = Image.new("RGBA", (TEX_W, TEX_H), (18, 18, 21, 255))
    draw = ImageDraw.Draw(img)

    # Subtle background grid
    for x in range(0, TEX_W, 64):
        draw.line([(x, TITLE_BAR_H), (x, TEX_H)], fill=(255, 255, 255, 7), width=1)
    for y in range(TITLE_BAR_H, TEX_H, 64):
        draw.line([(0, y), (TEX_W, y)], fill=(255, 255, 255, 7), width=1)

    # Top 36px-proportion Title Bar (#18181c)
    draw.rectangle([(0, 0), (TEX_W, TITLE_BAR_H)], fill=(24, 24, 28, 255))
    draw.line([(0, TITLE_BAR_H), (TEX_W, TITLE_BAR_H)], fill=(255, 255, 255, 28), width=2)

    # Window control dots (right aligned or left accent badge)
    font_title = _load_font(26, mono=False)
    font_badge = _load_font(20, mono=True)

    # Ice-blue accent icon square
    draw.rounded_rectangle([(28, 18), (64, 54)], radius=8, fill=(56, 189, 248, 45), outline=(56, 189, 248, 180), width=2)
    draw.text((82, 21), title, fill=(244, 244, 245, 255), font=font_title)

    # Badge pill
    badge_w = len(subtitle_badge) * 13 + 32
    draw.rounded_rectangle(
        [(TEX_W - badge_w - 170, 18), (TEX_W - 170, 54)],
        radius=8,
        fill=(28, 28, 33, 255),
        outline=(56, 189, 248, 110),
        width=2,
    )
    draw.text((TEX_W - badge_w - 154, 24), subtitle_badge, fill=(56, 189, 248, 255), font=font_badge)

    # Minimize / Maximize / Close window controls
    for idx, col in enumerate([(113, 113, 122, 180), (113, 113, 122, 180), (239, 68, 68, 200)]):
        cx = TEX_W - 120 + idx * 38
        cy = 36
        draw.ellipse([(cx - 10, cy - 10), (cx + 10, cy + 10)], fill=col)

    # Outer 1px hairline border
    draw.rectangle([(1, 1), (TEX_W - 2, TEX_H - 2)], outline=(255, 255, 255, 36), width=2)
    return img, draw


def generate_uefi_post_texture() -> Path:
    """1. Act 1 StrataUEFI v1.0.0 POST & Pre-Boot Firmware readout."""
    img = Image.new("RGBA", (TEX_W, TEX_H), (5, 5, 7, 255))
    draw = ImageDraw.Draw(img)

    font_xl = _load_font(56, mono=True)
    font_lg = _load_font(34, mono=True)
    font_md = _load_font(26, mono=True)

    # Frame border
    draw.rectangle([(40, 40), (TEX_W - 40, TEX_H - 40)], outline=(56, 189, 248, 120), width=3)
    draw.rectangle([(56, 56), (TEX_W - 56, 175)], fill=(18, 18, 21, 255), outline=(255, 255, 255, 35), width=2)

    draw.text((88, 72), "STRATA UEFI FIRMWARE v1.0.0 (BEDROCK)", fill=(244, 244, 245, 255), font=font_xl)
    draw.text((88, 136), "pithings/unkernel arch/wasm SMP • JSPI MMU • IndexedDB ext4 NVRAM", fill=(56, 189, 248, 255), font=font_md)

    lines = [
        ("[  0.000000] Booting Linux 7.3.4-unkernel-bedrock (wasm32 / aarch64-kwemu)", (244, 244, 245, 255)),
        ("[  0.004120] Cross-Origin-Opener-Policy: same-origin          [ VERIFIED ]", (16, 185, 129, 255)),
        ("[  0.008490] Cross-Origin-Embedder-Policy: require-corp       [ VERIFIED ]", (16, 185, 129, 255)),
        ("[  0.012800] SharedArrayBuffer & WebAssembly.Memory (512 MB)  [  ONLINE  ]", (56, 189, 248, 255)),
        ("[  0.019340] UEFI Secure Boot Policy: ENFORCED (SHA-256 WASM) [  ACTIVE  ]", (16, 185, 129, 255)),
        ("[  0.025910] Mounting Copy-on-Write ext4 rootfs (kwdisk:v1)   [  MOUNTED ]", (244, 244, 245, 255)),
        ("[  0.031400] Initializing Comlink Zero-Copy Worker RPC Bridge [  0.2 ms  ]", (56, 189, 248, 255)),
        ("[  0.039800] Probing WebGPU Adapter (navigator.gpu WGSL)      [ 120 FPS  ]", (16, 185, 129, 255)),
    ]

    y = 230
    for text, color in lines:
        draw.text((92, y), text, fill=color, font=font_md)
        y += 62

    # Boot Priority & NVRAM status box
    draw.rounded_rectangle([(88, 760), (TEX_W - 88, 1020)], radius=16, fill=(18, 18, 21, 255), outline=(56, 189, 248, 90), width=2)
    draw.text((128, 795), "NVRAM BOOT PRIORITY: [1] StrataOS Desktop Compositor  [2] TTY Recovery  [3] UEFI Shell", fill=(244, 244, 245, 255), font=font_md)
    draw.text((128, 855), "MEMORY CHECK: 524,288 KB OK   •   VFS MOUNTS: /root  /opt/strata/apps  /etc/strata", fill=(161, 161, 170, 255), font=font_md)

    # Progress bar
    draw.rounded_rectangle([(128, 925), (TEX_W - 128, 965)], radius=8, fill=(28, 28, 33, 255))
    draw.rounded_rectangle([(128, 925), (TEX_W - 280, 965)], radius=8, fill=(56, 189, 248, 255))

    # Glowing F2: SETUP prompt at bottom
    draw.rounded_rectangle([(88, 1065), (940, 1185)], radius=14, fill=(56, 189, 248, 35), outline=(56, 189, 248, 255), width=3)
    draw.text((130, 1102), "PRESS [F2] OR [DEL] TO ENTER STRATA UEFI SETUP", fill=(56, 189, 248, 255), font=font_lg)

    draw.rounded_rectangle([(980, 1065), (TEX_W - 88, 1185)], radius=14, fill=(16, 185, 129, 30), outline=(16, 185, 129, 220), width=2)
    draw.text((1030, 1102), "[F12] BOOT MENU  •  AUTO-BOOT IN 1.5s", fill=(16, 185, 129, 255), font=font_lg)

    out_path = TEXTURES_DIR / "uefi_post.png"
    img.save(out_path, "PNG")
    return out_path


def generate_terminal_texture() -> Path:
    """2. Act 3 & Act 4 Strata Terminal running strataget install pixelsynth."""
    img, draw = _create_window_canvas("Strata Terminal — /dev/pts/0 (root@strataos)", "WEBGL PTY • 120FPS")
    font_lg = _load_font(30, mono=True)
    font_md = _load_font(25, mono=True)

    lines = [
        ("root@strataos:~# uname -a", (244, 244, 245, 255)),
        ("Linux strataos 7.3.4-unkernel-bedrock #1 SMP PREEMPT_DYNAMIC wasm32 GNU/Linux", (56, 189, 248, 255)),
        ("root@strataos:~# strataget install pixelsynth", (244, 244, 245, 255)),
        ("==> Reading package index from /etc/strata/registry.json...", (161, 161, 170, 255)),
        ("==> Resolving package: pixelsynth (PixelSynth WASM Sprite Studio v1.4.0)", (56, 189, 248, 255)),
        ("==> Downloading /registry/pixelsynth/pixelsynth.wasm (Zero-Copy ArrayBuffer)...", (244, 244, 245, 255)),
        ("    [##################################################] 100%  (SHA-256 VERIFIED)", (16, 185, 129, 255)),
        ("==> Writing binary -> /opt/strata/apps/pixelsynth/pixelsynth.wasm", (244, 244, 245, 255)),
        ("==> Generating CLI launcher -> /usr/local/bin/pixelsynth (chmod +x)", (244, 244, 245, 255)),
        ("==> Updating persistent manifest -> /etc/strata/installed.json", (244, 244, 245, 255)),
        ("==> Syncing ext4 filesystem blocks to IndexedDB (kwdisk:kwdata-v1)...", (56, 189, 248, 255)),
        ("[SUCCESS] Installed pixelsynth v1.4.0 — Dock & Strata Store synced automatically.", (16, 185, 129, 255)),
        ("", (244, 244, 245, 255)),
        ("root@strataos:~# strataget list", (244, 244, 245, 255)),
        ("PACKAGE ID     VERSION   TYPE       INSTALL PATH                        STATUS", (161, 161, 170, 255)),
        ("hexforge       1.2.0     wasm-gui   /opt/strata/apps/hexforge           INSTALLED", (56, 189, 248, 255)),
        ("pixelsynth     1.4.0     wasm-gui   /opt/strata/apps/pixelsynth         INSTALLED", (16, 185, 129, 255)),
        ("calcwasm       1.1.0     wasm-cli   /opt/strata/apps/calcwasm           INSTALLED", (56, 189, 248, 255)),
        ("root@strataos:~# █", (56, 189, 248, 255)),
    ]

    y = 115
    for idx, (text, color) in enumerate(lines):
        draw.text((54, y), text, fill=color, font=font_lg if idx in (0, 2, 11) else font_md)
        y += 58

    out_path = TEXTURES_DIR / "strata_terminal.png"
    img.save(out_path, "PNG")
    return out_path


def generate_files_texture() -> Path:
    """3. Act 3 Strata Files virtualized ext4 File Explorer."""
    img, draw = _create_window_canvas("Strata Files — /opt/strata/apps", "EXT4 VFS • HOST MOUNT")
    font_md = _load_font(24, mono=True)
    font_sm = _load_font(20, mono=True)

    # Left sidebar
    draw.rectangle([(4, TITLE_BAR_H + 2), (460, TEX_H - 4)], fill=(24, 24, 28, 255))
    draw.line([(460, TITLE_BAR_H), (460, TEX_H)], fill=(255, 255, 255, 28), width=2)

    mounts = [
        ("/root", "Root Workspace", False),
        ("/home/strata", "User Files", False),
        ("/mnt/host", "File System Access API", False),
        ("/opt/strata/apps", "WASM Packages", True),
        ("/etc/strata", "Registry & Config", False),
        ("/usr/local/bin", "Executable Wrappers", False),
        ("/data", "IndexedDB ext4 Disk", False),
    ]
    y = 120
    for path, desc, active in mounts:
        if active:
            draw.rounded_rectangle([(24, y - 10), (436, y + 62)], radius=10, fill=(56, 189, 248, 40), outline=(56, 189, 248, 180), width=2)
        draw.text((44, y), path, fill=(56, 189, 248, 255) if active else (244, 244, 245, 255), font=font_md)
        draw.text((44, y + 30), desc, fill=(161, 161, 170, 255), font=font_sm)
        y += 105

    # Right file table
    entries = [
        ("drwxr-xr-x", "DIR", "hexforge/", "Binary Hex & Disassembly Inspector"),
        ("drwxr-xr-x", "DIR", "pixelsynth/", "Procedural 16x16 WASM Sprite Studio"),
        ("drwxr-xr-x", "DIR", "calcwasm/", "High-Precision WASI Scientific Evaluator"),
        ("drwxr-xr-x", "DIR", "markview/", "Zero-Copy WASM Markdown Ast Renderer"),
        ("drwxr-xr-x", "DIR", "jsonlab/", "Schema Tree & JSON Buffer Inspector"),
        ("-rwxr-xr-x", "48.2 KB", "pixelsynth/pixelsynth.wasm", "Compiled WebAssembly Module"),
        ("-rw-r--r--", "1.4 KB", "pixelsynth/manifest.json", "Strata Package Manifest v1.4.0"),
    ]
    ry = 130
    draw.text((500, ry), "PERMISSIONS    SIZE       NAME                             DESCRIPTION", fill=(161, 161, 170, 255), font=font_sm)
    ry += 55
    for perm, size, name, desc in entries:
        draw.rounded_rectangle([(490, ry - 12), (TEX_W - 36, ry + 54)], radius=10, fill=(28, 28, 33, 255), outline=(255, 255, 255, 20), width=1)
        draw.text((512, ry + 6), f"{perm:<14} {size:<10} {name:<32} {desc}", fill=(244, 244, 245, 255), font=font_sm)
        ry += 86

    out_path = TEXTURES_DIR / "strata_files.png"
    img.save(out_path, "PNG")
    return out_path


def generate_monitor_texture() -> Path:
    """4. Act 3 Strata Monitor & Kernel dmesg Telemetry."""
    img, draw = _create_window_canvas("Strata Monitor — Kernel Telemetry & Time Machine", "LINUX 7.3.4 • 0.2ms RPC")
    font_lg = _load_font(32, mono=True)
    font_sm = _load_font(21, mono=True)

    cards = [
        ("KERNEL UPTIME", "Linux 7.3.4-unkernel", (56, 189, 248, 255)),
        ("WORKER RPC LATENCY", "0.18 ms (Comlink)", (16, 185, 129, 255)),
        ("WASM HEAP / EXT4", "64.2 MB / 512 MB", (56, 189, 248, 255)),
        ("TIME MACHINE", "Dexie + fflate GZIP", (16, 185, 129, 255)),
    ]
    for i, (label, val, col) in enumerate(cards):
        x0 = 40 + i * 495
        draw.rounded_rectangle([(x0, 110), (x0 + 470, 260)], radius=14, fill=(28, 28, 33, 255), outline=(255, 255, 255, 28), width=2)
        draw.text((x0 + 28, 136), label, fill=(161, 161, 170, 255), font=font_sm)
        draw.text((x0 + 28, 182), val, fill=col, font=font_lg)

    # dmesg log stream
    draw.rounded_rectangle([(40, 295), (TEX_W - 40, TEX_H - 40)], radius=14, fill=(12, 12, 15, 255), outline=(255, 255, 255, 25), width=2)
    dmesg_lines = [
        "[    0.000000] Linux version 7.3.4-unkernel (root@strata-build) (clang 19.1.0 wasm32)",
        "[    0.014200] kw: SharedArrayBuffer MMU Sv39 page tables initialized",
        "[    0.032110] EXT4-fs (vda): mounted filesystem with ordered data mode. Quota: off",
        "[    0.058900] vsock: Virtio-vsock WASI execution bridge active on cid=2",
        "[    0.091200] strataget: synced /etc/strata/installed.json with Strata Store GUI",
        "[    0.124500] webgpu: WGSL compute pipeline bound at 120Hz frame pacing",
        "[    0.168000] timemachine: snapshot 'Bedrock v1.0.0 Golden' compressed (18.4 KB)",
    ]
    y = 330
    for line in dmesg_lines:
        draw.text((72, y), line, fill=(16, 185, 129, 255) if "EXT4" in line or "strataget" in line else (212, 212, 216, 255), font=font_sm)
        y += 56

    out_path = TEXTURES_DIR / "strata_monitor.png"
    img.save(out_path, "PNG")
    return out_path


def generate_store_pixelsynth_texture() -> Path:
    """5. Act 4 Strata Store & PixelSynth WASM App window."""
    img, draw = _create_window_canvas("PixelSynth v1.4.0 — WebAssembly Sprite & Matrix Studio", "WASM-GUI • INSTALLED")
    font_lg = _load_font(32, mono=True)
    font_sm = _load_font(22, mono=True)

    # Left 16x16 procedural pixel matrix
    grid_x0, grid_y0 = 70, 130
    cell = 64
    for r in range(16):
        for c in range(16):
            cx = grid_x0 + c * cell
            cy = grid_y0 + r * cell
            dist = math.hypot(r - 7.5, c - 7.5)
            if dist < 3.2:
                fill = (56, 189, 248, 255)
            elif dist < 5.6:
                fill = (16, 185, 129, 220)
            elif (r + c) % 2 == 0:
                fill = (28, 28, 33, 255)
            else:
                fill = (20, 20, 24, 255)
            draw.rectangle([(cx, cy), (cx + cell - 4, cy + cell - 4)], fill=fill)

    # Right inspector panel
    rx = 1150
    draw.rounded_rectangle([(rx, 130), (TEX_W - 60, TEX_H - 60)], radius=16, fill=(28, 28, 33, 255), outline=(56, 189, 248, 90), width=2)
    draw.text((rx + 40, 175), "PIXELSYNTH WASM ENGINE", fill=(244, 244, 245, 255), font=font_lg)
    draw.text((rx + 40, 235), "Binary: /opt/strata/apps/pixelsynth/pixelsynth.wasm", fill=(56, 189, 248, 255), font=font_sm)
    draw.text((rx + 40, 285), "Export: /usr/local/bin/pixelsynth", fill=(16, 185, 129, 255), font=font_sm)
    draw.text((rx + 40, 345), "Exports: memory, render_pattern(seed, tick)", fill=(161, 161, 170, 255), font=font_sm)

    out_path = TEXTURES_DIR / "strata_store.png"
    img.save(out_path, "PNG")
    return out_path


def generate_studio_ide_texture() -> Path:
    """6. Act 5 Strata Studio IDE + Strata Copilot AI Split Screen."""
    img, draw = _create_window_canvas("Strata Studio IDE + Strata Copilot AI", "CODEMIRROR 6 • BUILT-IN AI")
    font_md = _load_font(24, mono=True)
    font_sm = _load_font(21, mono=True)

    # Left file tree
    draw.rectangle([(4, TITLE_BAR_H + 2), (380, TEX_H - 4)], fill=(22, 22, 26, 255))
    # Center CodeMirror 6 editor
    draw.rectangle([(382, TITLE_BAR_H + 2), (1380, TEX_H - 4)], fill=(15, 15, 18, 255))
    # Right Strata Copilot AI assistant
    draw.rectangle([(1382, TITLE_BAR_H + 2), (TEX_W - 4, TEX_H - 4)], fill=(24, 24, 29, 255))

    code_lines = [
        ("01  // /root/bedrock_kernel_probe.ts — Strata Studio IDE", (113, 113, 122, 255)),
        ("02  import { kernelClient } from '@strata/kernel';", (56, 189, 248, 255)),
        ("03  ", (244, 244, 245, 255)),
        ("04  export async function verifyBedrockRuntime() {", (244, 244, 245, 255)),
        ("05    const uname = await kernelClient.exec('uname', ['-r']);", (16, 185, 129, 255)),
        ("06    const pkg = await kernelClient.installPackage('pixelsynth');", (56, 189, 248, 255)),
        ("07    await kernelClient.syncDisk(); // flush ext4 -> IndexedDB", (244, 244, 245, 255)),
        ("08    return { kernel: uname.stdout, installed: pkg.id };", (16, 185, 129, 255)),
        ("09  }", (244, 244, 245, 255)),
    ]
    y = 140
    for text, col in code_lines:
        draw.text((415, y), text, fill=col, font=font_md)
        y += 62

    # Copilot panel content
    draw.text((1420, 130), "STRATA COPILOT (Window AI)", fill=(56, 189, 248, 255), font=font_md)
    draw.rounded_rectangle([(1420, 195), (TEX_W - 40, 480)], radius=12, fill=(18, 18, 21, 255), outline=(56, 189, 248, 120), width=2)
    draw.text((1445, 225), "Generated WASI package scaffold", fill=(244, 244, 245, 255), font=font_sm)
    draw.text((1445, 275), "and injected zero-copy Comlink", fill=(161, 161, 170, 255), font=font_sm)
    draw.text((1445, 325), "transfer buffer into editor.", fill=(161, 161, 170, 255), font=font_sm)
    draw.rounded_rectangle([(1445, 390), (1890, 448)], radius=8, fill=(16, 185, 129, 45), outline=(16, 185, 129, 220), width=2)
    draw.text((1475, 405), "[1-CLICK] APPLY TO STRATA STUDIO", fill=(16, 185, 129, 255), font=font_sm)

    out_path = TEXTURES_DIR / "strata_studio_ide.png"
    img.save(out_path, "PNG")
    return out_path


def generate_webgpu_studio_texture() -> Path:
    """7. Act 5 WebGPU Studio WGSL Compute Playground."""
    img, draw = _create_window_canvas("Strata GPU Studio — WebGPU WGSL Compute Playground", "NAVIGATOR.GPU • 120FPS")
    font_md = _load_font(25, mono=True)

    # Left WGSL Shader Editor
    wgsl_lines = [
        "@compute @workgroup_size(64)",
        "fn main(@builtin(global_invocation_id) id: vec3<u32>) {",
        "  let idx = id.x;",
        "  var p = particles[idx].pos;",
        "  let curl = sin(p.y * 3.2 + params.time) * cos(p.x * 3.2);",
        "  particles[idx].vel = normalize(vec3<f32>(curl, 0.8, -curl));",
        "  particles[idx].pos += particles[idx].vel * params.dt;",
        "}",
    ]
    y = 150
    for line in wgsl_lines:
        draw.text((64, y), line, fill=(56, 189, 248, 255) if "@" in line or "fn " in line else (244, 244, 245, 255), font=font_md)
        y += 60

    # Right Compute Flow Field Preview
    cx, cy = 1520, 660
    for ring in range(40, 420, 28):
        draw.ellipse(
            [(cx - ring, cy - ring), (cx + ring, cy + ring)],
            outline=(56, 189, 248, 120) if ring % 56 == 0 else (16, 185, 129, 100),
            width=3,
        )

    out_path = TEXTURES_DIR / "webgpu_studio.png"
    img.save(out_path, "PNG")
    return out_path


def generate_bytescope_texture() -> Path:
    """8. Act 5 ByteScope AudioWorklet Bytebeat Synth & X-Y Oscilloscope."""
    img, draw = _create_window_canvas("ByteScope — AudioWorklet Bytebeat & X-Y Lissajous Synth", "48KHZ • FLOATBEAT")
    font_lg = _load_font(30, mono=True)

    # Oscilloscope phosphor screen
    draw.rounded_rectangle([(60, 120), (TEX_W - 60, 960)], radius=18, fill=(6, 10, 9, 255), outline=(16, 185, 129, 140), width=3)

    # Draw high-res Lissajous curve on texture
    pts = []
    cx, cy = TEX_W // 2, 540
    for i in range(720):
        t = (i / 720.0) * 2.0 * math.pi
        x = cx + math.sin(3.0 * t + 0.4) * 560
        y = cy + math.sin(4.0 * t) * 330
        pts.append((x, y))
    draw.line(pts, fill=(16, 185, 129, 255), width=6)

    # Formula bar at bottom
    draw.rounded_rectangle([(60, 1010), (TEX_W - 60, 1180)], radius=14, fill=(24, 24, 28, 255), outline=(56, 189, 248, 100), width=2)
    draw.text(
        (100, 1072),
        "FORMULA: ((t * (t >> 8 | t >> 9) & 46 & t >> 8)) ^ (t & t >> 13 | t >> 6)",
        fill=(16, 185, 129, 255),
        font=font_lg,
    )

    out_path = TEXTURES_DIR / "bytescope_synth.png"
    img.save(out_path, "PNG")
    return out_path


def generate_all_ui_textures() -> dict[str, Path]:
    """Generate all 8 high-DPI 2048x1280 UI textures and return their paths."""
    os.makedirs(TEXTURES_DIR, exist_ok=True)
    return {
        "uefi_post": generate_uefi_post_texture(),
        "terminal": generate_terminal_texture(),
        "files": generate_files_texture(),
        "monitor": generate_monitor_texture(),
        "store": generate_store_pixelsynth_texture(),
        "studio_ide": generate_studio_ide_texture(),
        "webgpu_studio": generate_webgpu_studio_texture(),
        "bytescope": generate_bytescope_texture(),
    }


if __name__ == "__main__":
    paths = generate_all_ui_textures()
    for key, p in paths.items():
        print(f"[ui_textures] Generated {key:15s} -> {p} ({p.stat().st_size:,} bytes)")
