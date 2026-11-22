"""
Act 4: `strataget` & WASM Package Delivery (Frames 1921–2520 | 0:32–0:42)
=========================================================================
- Camera pushes tight onto the Strata Terminal window as animated 3D text/texture
  transitions show `strataget install pixelsynth`.
- From above the frame, a glowing wireframe WASM Cube descends, passes through a
  translucent registry ring, unfolds into a full 3D glass app window
  (Strata Store / PixelSynth), and slots seamlessly into the desktop dock.
"""

from __future__ import annotations
import math
from pathlib import Path
from typing import Any

from camera_rig import keyframe_spring_overshoot, keyframe_transform, set_act_visibility
from config import ACT_RANGES, PALETTE_LINEAR
from geometry import (
    build_3d_text,
    build_beveled_slab,
    build_glass_os_window,
    build_wasm_wireframe_cube,
    get_or_create_collection,
    link_exclusively,
)
from materials import (
    mat_emissive_text,
    mat_frosted_glass,
    mat_wireframe_holo,
)

try:
    import bpy
except ImportError:
    bpy = None


def build_act4_strataget_delivery(textures: dict[str, Path]) -> dict[str, Any]:
    f_start, f_end = ACT_RANGES["act4_strataget_delivery"]
    col = get_or_create_collection("04_Act4_Strataget_Delivery")
    act_objects: list[Any] = []

    # 1. Strata Terminal Window on the Left executing `strataget install pixelsynth`
    win_terminal = build_glass_os_window(
        name="Act4_Window_StrataTerminal",
        width=3.5,
        height=2.18,
        texture_path=textures["terminal"],
        collection=col,
    )
    win_terminal.location = (-1.35, 0.0, 1.65)
    win_terminal.rotation_euler = (0.0, 0.0, math.radians(6.0))
    act_objects.append(win_terminal)

    cmd_banner = build_3d_text(
        name="Act4_Strataget_CLI_Callout",
        text="$ strataget install pixelsynth  -->  /opt/strata/apps/pixelsynth/pixelsynth.wasm",
        size=0.135,
        collection=col,
        material=mat_emissive_text("mat_act4_cli_txt", PALETTE_LINEAR["emerald_signal"], 6.5),
        location=(-0.4, -0.35, 2.92),
    )
    act_objects.append(cmd_banner)
    keyframe_transform(cmd_banner, frame=1925, location=(-0.4, -0.35, 3.1), scale=(0.001, 0.001, 0.001))
    keyframe_transform(cmd_banner, frame=1985, location=(-0.4, -0.35, 2.92), scale=(1.0, 1.0, 1.0))

    # 2. Translucent Holographic Registry Portal Ring at Z=2.65
    bpy.ops.mesh.primitive_torus_add(
        major_radius=1.05,
        minor_radius=0.032,
        major_segments=64,
        minor_segments=16,
        location=(1.15, 0.0, 2.65),
    )
    registry_ring = bpy.context.active_object
    registry_ring.name = "Act4_RegistryPortalRing"
    registry_ring.data.materials.append(mat_wireframe_holo("mat_act4_ring", PALETTE_LINEAR["ice_blue"], 8.0))
    link_exclusively(registry_ring, col)
    act_objects.append(registry_ring)

    keyframe_transform(registry_ring, frame=2040, scale=(0.01, 0.01, 0.01), rotation_euler=(0.0, 0.0, 0.0))
    keyframe_transform(registry_ring, frame=2115, scale=(1.0, 1.0, 1.0), rotation_euler=(0.0, 0.0, math.radians(90.0)))
    keyframe_transform(registry_ring, frame=2320, scale=(1.15, 1.15, 1.0), rotation_euler=(0.0, 0.0, math.radians(240.0)))
    keyframe_transform(registry_ring, frame=2400, scale=(0.01, 0.01, 0.01), rotation_euler=(0.0, 0.0, math.radians(320.0)))

    # 3. Descending Glowing Wireframe WASM Cube passing through the Registry Ring
    wasm_cube = build_wasm_wireframe_cube(
        name="Act4_Descending_WASM_Cube",
        size=0.82,
        collection=col,
        location=(1.15, 0.0, 5.2),
    )
    act_objects.append(wasm_cube)

    keyframe_transform(
        wasm_cube,
        frame=2070,
        location=(1.15, 0.0, 4.9),
        rotation_euler=(math.radians(25.0), math.radians(35.0), 0.0),
        scale=(1.0, 1.0, 1.0),
    )
    keyframe_transform(
        wasm_cube,
        frame=2210,
        location=(1.15, 0.0, 2.65),
        rotation_euler=(math.radians(140.0), math.radians(180.0), math.radians(90.0)),
        scale=(1.08, 1.08, 1.08),
    )
    keyframe_transform(
        wasm_cube,
        frame=2295,
        location=(1.15, 0.0, 1.55),
        rotation_euler=(math.radians(240.0), math.radians(270.0), math.radians(180.0)),
        scale=(1.6, 0.15, 1.1),
    )
    keyframe_transform(
        wasm_cube,
        frame=2320,
        location=(1.15, 0.0, 1.55),
        scale=(0.001, 0.001, 0.001),
    )

    # 4. Unfolding 3D Glass App Window (Strata Store / PixelSynth v1.4.0)
    win_pixelsynth = build_glass_os_window(
        name="Act4_Window_PixelSynth_Store",
        width=3.55,
        height=2.22,
        texture_path=textures["store"],
        collection=col,
        emission_strength=1.85,
    )
    act_objects.append(win_pixelsynth)

    keyframe_transform(
        win_pixelsynth,
        frame=2280,
        location=(1.15, 0.0, 1.55),
        rotation_euler=(math.radians(-18.0), 0.0, math.radians(-22.0)),
        scale=(0.001, 0.001, 0.001),
    )
    keyframe_transform(
        win_pixelsynth,
        frame=2345,
        location=(1.15, -0.15, 1.58),
        rotation_euler=(0.0, 0.0, math.radians(-5.0)),
        scale=(1.06, 1.06, 1.06),
    )
    keyframe_transform(
        win_pixelsynth,
        frame=2395,
        location=(1.15, -0.15, 1.55),
        rotation_euler=(0.0, 0.0, math.radians(-6.0)),
        scale=(1.0, 1.0, 1.0),
    )

    # 5. Desktop Dock below receiving the newly installed WASM App Icon module
    dock_bar = build_beveled_slab(
        name="Act4_DesktopDock",
        dimensions=(4.6, 0.14, 0.36),
        bevel_width=0.025,
        material=mat_frosted_glass(),
        collection=col,
        location=(0.2, -0.35, -0.25),
    )
    new_dock_icon = build_beveled_slab(
        name="Act4_NewWasmDockIcon_PixelSynth",
        dimensions=(0.28, 0.07, 0.28),
        bevel_width=0.016,
        material=mat_emissive_text("mat_act4_new_icon", PALETTE_LINEAR["emerald_signal"], 8.5),
        collection=col,
        location=(1.15, -0.44, 1.55),
    )
    act_objects.extend([dock_bar, new_dock_icon])

    keyframe_transform(new_dock_icon, frame=2320, location=(1.15, -0.44, 1.55), scale=(0.001, 0.001, 0.001))
    keyframe_transform(new_dock_icon, frame=2350, location=(1.15, -0.44, 1.25), scale=(1.0, 1.0, 1.0))
    keyframe_spring_overshoot(
        new_dock_icon,
        frame_start=2350,
        frame_end=2450,
        start_loc=(1.15, -0.44, 1.25),
        target_loc=(1.85, -0.44, -0.25),
        overshoot_factor=0.11,
    )

    set_act_visibility(act_objects, f_start, f_end)
    return {"collection": col, "objects": act_objects}
