"""
StrataOS v1.0.0 ("Bedrock") — Blender 4.x 3D Launch Trailer Configuration
=========================================================================
Defines resolution, frame rate (60fps), 3,600-frame timeline boundaries,
Linear / Teenage Engineering dark studio color palette, and CLI flags.
"""

from __future__ import annotations
import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"
TEXTURES_DIR = ASSETS_DIR / "textures"
OUTPUT_DIR = BASE_DIR / "output"

RGBA = Tuple[float, float, float, float]


def hex_to_linear_rgba(hex_str: str, alpha: float = 1.0) -> RGBA:
    """Convert a hex color string (#RRGGBB) to linear scene-referred RGBA for Blender 4.x."""
    clean = hex_str.lstrip("#")
    r_srgb = int(clean[0:2], 16) / 255.0
    g_srgb = int(clean[2:4], 16) / 255.0
    b_srgb = int(clean[4:6], 16) / 255.0

    def srgb_to_linear(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (srgb_to_linear(r_srgb), srgb_to_linear(g_srgb), srgb_to_linear(b_srgb), alpha)


# ==============================================================================
# Visual Direction & Aesthetic Palette (Zero neon purple/pink cliches)
# ==============================================================================
PALETTE_HEX = {
    "obsidian_void": "#050507",
    "desktop_base": "#09090b",
    "frosted_glass": "#121215",
    "anodized_titanium": "#18181b",
    "elevated_panel": "#1c1c21",
    "crisp_white": "#f4f4f5",
    "muted_zinc": "#71717a",
    "ice_blue": "#38bdf8",
    "emerald_signal": "#10b981",
    "amber_post": "#f59e0b",
}

PALETTE_LINEAR: dict[str, RGBA] = {
    k: hex_to_linear_rgba(v, 1.0) for k, v in PALETTE_HEX.items()
}

# ==============================================================================
# 60-Second Storyboard Act Frame Boundaries (3,600 Frames @ 60fps)
# ==============================================================================
ACT_RANGES = {
    "act1_monolith_uefi": (1, 600),        # 0:00 - 0:10
    "act2_kernel_wasm": (601, 1200),       # 0:10 - 0:20
    "act3_desktop_materialize": (1201, 1920),  # 0:20 - 0:32
    "act4_strataget_delivery": (1921, 2520),   # 0:32 - 0:42
    "act5_flagship_montage": (2521, 3180),     # 0:42 - 0:53
    "act6_bedrock_finale": (3181, 3600),       # 0:53 - 1:00
}

ACT5_SUBRANGES = {
    "webgpu_studio": (2521, 2740),
    "copilot_studio_ide": (2741, 2960),
    "bytescope_synth": (2961, 3180),
}


@dataclass
class RenderConfig:
    resolution_x: int = 1920
    resolution_y: int = 1080
    resolution_percentage: int = 100
    fps: int = 60
    frame_start: int = 1
    frame_end: int = 3600
    frame_step: int = 1
    use_cycles: bool = False
    cycles_samples: int = 128
    eevee_samples: int = 64
    preview_mode: bool = False
    save_only: bool = False
    blend_output_path: Path = OUTPUT_DIR / "strataos_trailer.blend"
    video_output_path: Path = OUTPUT_DIR / "strataos_v1_trailer.mp4"

    def scale_frame(self, canonical_frame_60fps: int) -> int:
        """Return frame index at current FPS (kept 1:1 on 3600 timeline so choreography never shifts)."""
        return canonical_frame_60fps


def parse_cli_config(argv: list[str] | None = None) -> RenderConfig:
    """
    Parse arguments passed after `--` in Blender CLI:
      blender --background --python render_strataos.py -- --preview
      blender --background --python render_strataos.py -- --master --cycles
      blender --background --python render_strataos.py -- --save-only
    """
    if argv is None:
        if "--" in sys.argv:
            argv = sys.argv[sys.argv.index("--") + 1 :]
        else:
            argv = []

    parser = argparse.ArgumentParser(
        prog="render_strataos.py",
        description="StrataOS v1.0.0 ('Bedrock') Procedural Blender 4.x 3D Trailer Pipeline",
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--preview",
        action="store_true",
        help="Fast 1280x720 preview check with reduced sampling & frame_step=2 (effective 30fps)",
    )
    mode_group.add_argument(
        "--master",
        action="store_true",
        help="Full 1920x1080 @ 60fps master quality output (default)",
    )
    parser.add_argument(
        "--cycles",
        action="store_true",
        help="Switch render engine from EEVEE Next to Cycles (GPU/OptiX/CUDA + OpenImageDenoise)",
    )
    parser.add_argument(
        "--save-only",
        action="store_true",
        help="Build entire 6-Act scene, materials, textures, and camera rig, then save .blend without rendering video",
    )
    parser.add_argument(
        "--frame-start",
        type=int,
        default=1,
        help="Override start frame (default: 1)",
    )
    parser.add_argument(
        "--frame-end",
        type=int,
        default=3600,
        help="Override end frame (default: 3600)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(OUTPUT_DIR / "strataos_v1_trailer.mp4"),
        help="Output MP4 file path",
    )

    args = parser.parse_args(argv)
    os.makedirs(TEXTURES_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    cfg = RenderConfig(
        use_cycles=bool(args.cycles),
        preview_mode=bool(args.preview),
        save_only=bool(args.save_only),
        frame_start=args.frame_start,
        frame_end=args.frame_end,
        video_output_path=Path(args.output).resolve(),
    )

    if cfg.preview_mode:
        cfg.resolution_x = 1280
        cfg.resolution_y = 720
        cfg.frame_step = 2  # Render every 2nd frame for fast 30fps preview
        cfg.eevee_samples = 24
        cfg.cycles_samples = 48
    else:
        cfg.resolution_x = 1920
        cfg.resolution_y = 1080
        cfg.frame_step = 1
        cfg.eevee_samples = 64
        cfg.cycles_samples = 128

    return cfg
