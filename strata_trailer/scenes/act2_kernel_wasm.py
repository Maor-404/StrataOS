"""
Act 2: Inside the Kernel (`unkernel` Linux 7.x WASM) (Frames 601–1200 | 0:10–0:20)
==================================================================================
- The camera dives *between* the floating glass strata layers.
- Below the UI glass, geometric WebAssembly blocks snap together along glowing cyan
  data-bus ribbons (Comlink Worker bridge), locking into a crystalline grid labeled
  `IndexedDB ext4`.
- Camera glides orbitally through the layers, accelerating upward through the top
  glass pane as the OS boots.
"""

from __future__ import annotations
import math
from typing import Any

from camera_rig import keyframe_spring_overshoot, keyframe_transform, set_act_visibility
from config import ACT_RANGES, PALETTE_LINEAR
from geometry import (
    build_3d_text,
    build_beveled_slab,
    build_data_bus_ribbon,
    build_wasm_wireframe_cube,
    get_or_create_collection,
)
from materials import (
    mat_emissive_text,
    mat_frosted_glass,
    mat_titanium_bevel,
    mat_wireframe_holo,
)


def build_act2_kernel_wasm() -> dict[str, Any]:
    f_start, f_end = ACT_RANGES["act2_kernel_wasm"]
    col = get_or_create_collection("02_Act2_Kernel_WASM")
    act_objects: list[Any] = []

    # 1. Upper and Lower Translucent Glass Strata Ceiling/Floor framing the Kernel space
    lower_strata = build_beveled_slab(
        name="Act2_Ext4_Substrate_Plate",
        dimensions=(7.5, 5.2, 0.08),
        bevel_width=0.02,
        material=mat_titanium_bevel(),
        collection=col,
        location=(0.0, 0.0, -1.05),
    )
    upper_strata = build_beveled_slab(
        name="Act2_Compositor_Ceiling_Glass",
        dimensions=(7.5, 5.2, 0.07),
        bevel_width=0.02,
        material=mat_frosted_glass(),
        collection=col,
        location=(0.0, 0.0, 1.55),
    )
    act_objects.extend([lower_strata, upper_strata])

    # 2. Crystalline 3x3 Grid of WebAssembly Kernel & Syscall Blocks locking into IndexedDB ext4
    wasm_blocks: list[Any] = []
    grid_coords = [(-1.8, -1.1), (0.0, -1.1), (1.8, -1.1), (-1.8, 0.0), (0.0, 0.0), (1.8, 0.0), (-1.8, 1.1), (0.0, 1.1), (1.8, 1.1)]

    for idx, (gx, gy) in enumerate(grid_coords):
        block = build_wasm_wireframe_cube(
            name=f"Act2_WASM_KernelBlock_{idx + 1}",
            size=0.58,
            collection=col,
            location=(gx * 2.1, gy * 2.1, 0.65 + (idx % 3) * 0.4),
        )
        wasm_blocks.append(block)
        act_objects.append(block)

        start_loc = (
            gx * 1.9 + math.cos(idx) * 1.4,
            gy * 1.9 + math.sin(idx) * 1.4,
            0.55 + (idx % 3) * 0.45,
        )
        locked_loc = (gx, gy, -0.35)

        snap_start = 620 + idx * 24
        snap_end = snap_start + 95
        keyframe_spring_overshoot(
            block,
            frame_start=snap_start,
            frame_end=snap_end,
            start_loc=start_loc,
            target_loc=locked_loc,
            overshoot_factor=0.10,
        )
        keyframe_transform(
            block,
            frame=snap_start,
            rotation_euler=(math.radians(35.0), math.radians(-25.0), math.radians(idx * 20.0)),
        )
        keyframe_transform(
            block,
            frame=snap_end,
            rotation_euler=(0.0, 0.0, 0.0),
        )

    # 3. Glowing Cyan Comlink Data-Bus Ribbons connecting the WASM blocks
    ribbon_mat_cyan = mat_wireframe_holo("mat_act2_comlink_bus", PALETTE_LINEAR["ice_blue"], 7.5)
    ribbon_mat_emerald = mat_wireframe_holo("mat_act2_vsock_bus", PALETTE_LINEAR["emerald_signal"], 6.5)

    bus_paths = [
        [(-2.8, -1.1, -0.35), (-1.8, -1.1, -0.35), (0.0, -1.1, -0.35), (1.8, -1.1, -0.35), (2.8, -1.1, -0.35)],
        [(-2.8, 0.0, -0.35), (-1.8, 0.0, -0.35), (0.0, 0.0, -0.35), (1.8, 0.0, -0.35), (2.8, 0.0, -0.35)],
        [(-2.8, 1.1, -0.35), (-1.8, 1.1, -0.35), (0.0, 1.1, -0.35), (1.8, 1.1, -0.35), (2.8, 1.1, -0.35)],
        [(-1.8, -2.0, -0.35), (-1.8, 0.0, -0.35), (-1.8, 2.0, -0.35)],
        [(0.0, -2.0, -0.35), (0.0, 0.0, -0.35), (0.0, 2.0, -0.35)],
        [(1.8, -2.0, -0.35), (1.8, 0.0, -0.35), (1.8, 2.0, -0.35)],
        # Vertical ascending Comlink RPC conduits piercing the upper compositor glass
        [(-1.8, 0.0, -0.35), (-1.2, 0.0, 0.55), (-0.6, 0.0, 1.55)],
        [(0.0, 0.0, -0.35), (0.0, 0.0, 0.65), (0.0, 0.0, 1.55)],
        [(1.8, 0.0, -0.35), (1.2, 0.0, 0.55), (0.6, 0.0, 1.55)],
    ]

    for r_idx, pts in enumerate(bus_paths):
        mat = ribbon_mat_cyan if r_idx < 6 else ribbon_mat_emerald
        ribbon = build_data_bus_ribbon(
            name=f"Act2_ComlinkDataBus_{r_idx + 1}",
            points=pts,
            bevel_depth=0.018 if r_idx < 6 else 0.024,
            material=mat,
            collection=col,
        )
        act_objects.append(ribbon)

        # Animate ribbon growth via curve bevel_factor_end
        ribbon.data.bevel_factor_end = 0.0
        ribbon.data.keyframe_insert(data_path="bevel_factor_end", frame=630 + r_idx * 18)
        ribbon.data.bevel_factor_end = 1.0
        ribbon.data.keyframe_insert(data_path="bevel_factor_end", frame=840 + r_idx * 22)

    # 4. Crisp 3D Architectural Typography inside the Kernel Matrix
    label_ext4 = build_3d_text(
        name="Act2_Label_IndexedDB_ext4",
        text="IndexedDB ext4  •  Copy-on-Write Persistent Block Device (kwdisk:kwdata-v1)",
        size=0.16,
        collection=col,
        material=mat_emissive_text("mat_act2_ext4_text", PALETTE_LINEAR["emerald_signal"], 5.5),
        location=(0.0, -2.35, -0.78),
    )
    label_unkernel = build_3d_text(
        name="Act2_Label_Unkernel_Bridge",
        text="pithings/unkernel Linux 7.3.4 (arch/wasm)  <-->  Comlink Zero-Copy Worker Bridge",
        size=0.17,
        collection=col,
        material=mat_emissive_text("mat_act2_unkernel_text", PALETTE_LINEAR["ice_blue"], 6.0),
        location=(0.0, -2.15, 0.48),
    )
    act_objects.extend([label_ext4, label_unkernel])

    set_act_visibility(act_objects, f_start, f_end)
    return {"collection": col, "objects": act_objects}
