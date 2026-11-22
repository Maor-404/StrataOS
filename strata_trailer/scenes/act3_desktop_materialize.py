"""
Act 3: The Desktop Materializes (Frames 1201–1920 | 0:20–0:32)
==============================================================
- We emerge above the top glass plane into the full StrataOS v1.0.0 Desktop floating
  in 3D space—sleek dark Top Status Bar, Floating Dock, and crisp hairline-bordered windows.
- Three 3D glass windows (Strata Terminal, Strata Files, and Strata Monitor) rise into
  frame with spring-physics overshoot and snap cleanly into a tiled 3D parallax layout.
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
    get_or_create_collection,
)
from materials import (
    mat_emissive_text,
    mat_frosted_glass,
    mat_titanium_bevel,
)


def build_act3_desktop_materialize(textures: dict[str, Path]) -> dict[str, Any]:
    f_start, f_end = ACT_RANGES["act3_desktop_materialize"]
    col = get_or_create_collection("03_Act3_Desktop_Materialize")
    act_objects: list[Any] = []

    # 1. Floating 3D Top Status Bar (#09090b frosted glass rail)
    top_bar = build_beveled_slab(
        name="Act3_TopStatusBar",
        dimensions=(7.8, 0.08, 0.22),
        bevel_width=0.012,
        material=mat_frosted_glass(),
        collection=col,
        location=(0.0, 0.2, 3.35),
    )
    top_bar_text = build_3d_text(
        name="Act3_TopStatusBar_Text",
        text="StrataOS v1.0.0   [1] [2] [3]    Ctrl+K Search Apps & Linux Files...    Linux 7.3 Online • 0.2ms • SAB",
        size=0.105,
        collection=col,
        material=mat_emissive_text("mat_act3_topbar_txt", PALETTE_LINEAR["crisp_white"], 4.0),
        location=(0.0, -0.055, 0.0),
    )
    top_bar_text.parent = top_bar
    act_objects.extend([top_bar, top_bar_text])

    keyframe_spring_overshoot(
        top_bar,
        frame_start=1205,
        frame_end=1310,
        start_loc=(0.0, 0.2, 4.4),
        target_loc=(0.0, 0.2, 3.35),
        overshoot_factor=0.07,
    )

    # 2. Floating 3D Bottom Dock (#121215 frosted glass pill with 9 native app capsules)
    dock_bar = build_beveled_slab(
        name="Act3_FloatingDock",
        dimensions=(4.4, 0.14, 0.36),
        bevel_width=0.025,
        material=mat_frosted_glass(),
        collection=col,
        location=(0.0, -0.35, -0.25),
    )
    act_objects.append(dock_bar)

    for i in range(9):
        icon_x = -1.76 + i * 0.44
        icon_mat = (
            mat_emissive_text(f"mat_dock_icon_{i}", PALETTE_LINEAR["ice_blue"], 4.5)
            if i in (0, 2, 3)
            else mat_titanium_bevel()
        )
        capsule = build_beveled_slab(
            name=f"Act3_DockIcon_{i + 1}",
            dimensions=(0.24, 0.05, 0.24),
            bevel_width=0.015,
            material=icon_mat,
            collection=col,
            location=(icon_x, -0.08, 0.0),
        )
        capsule.parent = dock_bar
        act_objects.append(capsule)

    keyframe_spring_overshoot(
        dock_bar,
        frame_start=1215,
        frame_end=1330,
        start_loc=(0.0, -0.35, -1.6),
        target_loc=(0.0, -0.35, -0.25),
        overshoot_factor=0.09,
    )

    # 3. Three 3D Glass Windows (Strata Terminal, Strata Files, Strata Monitor)
    # rising with spring-physics overshoot into a tiled 3D parallax layout
    win_terminal = build_glass_os_window(
        name="Act3_Window_StrataTerminal",
        width=3.6,
        height=2.25,
        texture_path=textures["terminal"],
        collection=col,
    )
    win_files = build_glass_os_window(
        name="Act3_Window_StrataFiles",
        width=3.3,
        height=2.06,
        texture_path=textures["files"],
        collection=col,
    )
    win_monitor = build_glass_os_window(
        name="Act3_Window_StrataMonitor",
        width=3.3,
        height=2.06,
        texture_path=textures["monitor"],
        collection=col,
    )
    act_objects.extend([win_terminal, win_files, win_monitor])

    # Strata Terminal (Front-Left primary focus window)
    keyframe_spring_overshoot(
        win_terminal,
        frame_start=1240,
        frame_end=1390,
        start_loc=(-1.55, -0.35, -2.6),
        target_loc=(-1.45, -0.35, 1.55),
        overshoot_factor=0.09,
    )
    keyframe_transform(win_terminal, frame=1240, rotation_euler=(math.radians(14.0), 0.0, math.radians(6.0)))
    keyframe_transform(win_terminal, frame=1390, rotation_euler=(0.0, 0.0, math.radians(8.0)))
    keyframe_transform(win_terminal, frame=1920, location=(-1.45, -0.35, 1.62), rotation_euler=(0.0, 0.0, math.radians(6.0)))

    # Strata Files (Upper-Right parallax tile)
    keyframe_spring_overshoot(
        win_files,
        frame_start=1290,
        frame_end=1445,
        start_loc=(1.85, 0.35, -2.8),
        target_loc=(1.75, 0.25, 2.05),
        overshoot_factor=0.085,
    )
    keyframe_transform(win_files, frame=1290, rotation_euler=(math.radians(-12.0), 0.0, math.radians(-10.0)))
    keyframe_transform(win_files, frame=1445, rotation_euler=(0.0, 0.0, math.radians(-9.0)))
    keyframe_transform(win_files, frame=1920, location=(1.75, 0.25, 2.12), rotation_euler=(0.0, 0.0, math.radians(-7.0)))

    # Strata Monitor (Lower-Right parallax tile)
    keyframe_spring_overshoot(
        win_monitor,
        frame_start=1340,
        frame_end=1500,
        start_loc=(1.65, 0.65, -3.1),
        target_loc=(1.55, 0.60, 0.95),
        overshoot_factor=0.08,
    )
    keyframe_transform(win_monitor, frame=1340, rotation_euler=(math.radians(10.0), 0.0, math.radians(-6.0)))
    keyframe_transform(win_monitor, frame=1500, rotation_euler=(0.0, 0.0, math.radians(-6.0)))
    keyframe_transform(win_monitor, frame=1920, location=(1.55, 0.60, 1.0), rotation_euler=(0.0, 0.0, math.radians(-5.0)))

    set_act_visibility(act_objects, f_start, f_end)
    return {"collection": col, "objects": act_objects}
