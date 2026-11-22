"""
Act 1: The Monolith & StrataUEFI (Frames 1–600 | 0:00–0:10)
===========================================================
- Pitch-black studio. A single razor-thin horizontal line of white light sweeps
  across a reflective obsidian floor, illuminating a floating, beveled dark-titanium slab.
- The slab splits vertically into 4 translucent stacked glass plates (representing
  the "Strata" architecture: Firmware, Linux 7.x Kernel, Comlink Bridge, Compositor).
- A crisp holographic StrataUEFI POST readout fades in above the top plate
  (`StrataUEFI v1.0.0 • Linux 7.x WASM • Cross-Origin-Isolated: OK`) with glowing `F2: SETUP`.
"""

from __future__ import annotations
import math
from pathlib import Path
from typing import Any

from camera_rig import keyframe_transform, set_act_visibility
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


def build_act1_monolith_uefi(textures: dict[str, Path]) -> dict[str, Any]:
    f_start, f_end = ACT_RANGES["act1_monolith_uefi"]
    col = get_or_create_collection("01_Act1_Monolith_UEFI")
    act_objects: list[Any] = []

    # 1. Razor-thin horizontal line of white light sweeping across the obsidian floor
    sweep_mat = mat_emissive_text("mat_act1_sweep_line", PALETTE_LINEAR["crisp_white"], strength=16.0)
    sweep_bar = build_beveled_slab(
        name="Act1_LaserSweepLine",
        dimensions=(16.0, 0.035, 0.015),
        bevel_width=0.004,
        material=sweep_mat,
        collection=col,
        location=(0.0, -9.0, -2.38),
    )
    act_objects.append(sweep_bar)

    keyframe_transform(sweep_bar, frame=1, location=(0.0, -9.5, -2.38), scale=(0.05, 1.0, 1.0))
    keyframe_transform(sweep_bar, frame=45, location=(0.0, -6.0, -2.38), scale=(1.0, 1.0, 1.0))
    keyframe_transform(sweep_bar, frame=210, location=(0.0, 7.5, -2.38), scale=(1.0, 1.0, 1.0))
    keyframe_transform(sweep_bar, frame=260, location=(0.0, 11.0, -2.38), scale=(0.02, 1.0, 1.0))

    # 2. Floating Beveled Dark-Titanium Monolith Base Slab
    monolith = build_beveled_slab(
        name="Act1_TitaniumMonolith",
        dimensions=(4.8, 3.0, 0.22),
        bevel_width=0.035,
        material=mat_titanium_bevel(),
        collection=col,
        location=(0.0, 0.0, -0.45),
    )
    act_objects.append(monolith)
    keyframe_transform(monolith, frame=1, location=(0.0, 0.0, -0.75))
    keyframe_transform(monolith, frame=180, location=(0.0, 0.0, -0.45))
    keyframe_transform(monolith, frame=600, location=(0.0, 0.0, -0.55))

    # 3. Four Translucent Stacked Glass Plates ("Strata" Architecture Layers)
    strata_labels = [
        "L0: StrataUEFI NVRAM Firmware",
        "L1: pithings/unkernel Linux 7.3.4 WASM",
        "L2: Comlink Zero-Copy Worker Bridge",
        "L3: 120fps WebGL / WebGPU Compositor",
    ]
    plates: list[Any] = []
    for idx, label in enumerate(strata_labels):
        plate = build_beveled_slab(
            name=f"Act1_StrataPlate_{idx + 1}",
            dimensions=(4.5, 2.75, 0.065),
            bevel_width=0.015,
            material=mat_frosted_glass(),
            collection=col,
            location=(0.0, 0.0, -0.35),
        )
        plates.append(plate)
        act_objects.append(plate)

        # Side layer badge typography attached to each glass plate
        tag = build_3d_text(
            name=f"Act1_StrataLabel_{idx + 1}",
            text=label,
            size=0.11,
            collection=col,
            material=mat_emissive_text("mat_act1_tag", PALETTE_LINEAR["ice_blue"], 3.5),
            extrude=0.004,
            bevel_depth=0.001,
            location=(-2.15, -1.42, 0.0),
            rotation_deg=(90.0, 0.0, 0.0),
            align_x="LEFT",
        )
        tag.parent = plate
        act_objects.append(tag)

        # Locked together until Frame 160, then split vertically into 4 distinct strata levels
        target_z = -0.25 + idx * 0.34
        keyframe_transform(plate, frame=1, location=(0.0, 0.0, -0.42), scale=(0.94, 0.94, 1.0))
        keyframe_transform(plate, frame=160, location=(0.0, 0.0, -0.35), scale=(1.0, 1.0, 1.0))
        keyframe_transform(
            plate,
            frame=340 + idx * 18,
            location=(0.0, 0.0, target_z),
            rotation_euler=(0.0, 0.0, math.radians((idx - 1.5) * 1.2)),
        )
        keyframe_transform(
            plate,
            frame=600,
            location=(0.0, 0.0, target_z + 0.04),
            rotation_euler=(0.0, 0.0, 0.0),
        )

    # 4. Crisp Holographic StrataUEFI POST Readout Window & 3D Title Above Top Plate
    uefi_holo = build_glass_os_window(
        name="Act1_StrataUEFI_POST_Window",
        width=3.6,
        height=2.25,
        texture_path=textures["uefi_post"],
        collection=col,
        depth=0.05,
        emission_strength=2.2,
    )
    act_objects.append(uefi_holo)

    keyframe_transform(
        uefi_holo,
        frame=1,
        location=(0.0, 0.0, 0.75),
        scale=(0.001, 0.001, 0.001),
    )
    keyframe_transform(
        uefi_holo,
        frame=295,
        location=(0.0, 0.0, 0.85),
        scale=(0.001, 0.001, 0.001),
    )
    keyframe_transform(
        uefi_holo,
        frame=380,
        location=(0.0, 0.0, 1.48),
        scale=(1.0, 1.0, 1.0),
    )
    keyframe_transform(
        uefi_holo,
        frame=600,
        location=(0.0, 0.0, 1.54),
        scale=(1.0, 1.0, 1.0),
    )

    # Floating 3D Holographic Header Readout & Glowing `F2: SETUP` Prompt
    uefi_header = build_3d_text(
        name="Act1_UEFI_Header_Text",
        text="StrataUEFI v1.0.0 • Linux 7.x WASM • Cross-Origin-Isolated: OK",
        size=0.135,
        collection=col,
        material=mat_emissive_text("mat_uefi_header", PALETTE_LINEAR["crisp_white"], 5.0),
        location=(0.0, -0.18, 2.75),
    )
    act_objects.append(uefi_header)

    f2_prompt = build_3d_text(
        name="Act1_F2_Setup_Prompt",
        text="[ F2: SETUP ]   [ F12: BOOT PRIORITY ]   [ SECURE BOOT: ENFORCED ]",
        size=0.145,
        collection=col,
        material=mat_emissive_text("mat_f2_prompt", PALETTE_LINEAR["ice_blue"], 7.5),
        location=(0.0, -0.26, 0.92),
    )
    act_objects.append(f2_prompt)

    for txt_obj, target_z in [(uefi_header, 2.75), (f2_prompt, 0.92)]:
        keyframe_transform(txt_obj, frame=310, location=(0.0, -0.25, target_z - 0.25), scale=(0.001, 0.001, 0.001))
        keyframe_transform(txt_obj, frame=395, location=(0.0, -0.25, target_z), scale=(1.0, 1.0, 1.0))
        keyframe_transform(txt_obj, frame=600, location=(0.0, -0.25, target_z + 0.03), scale=(1.0, 1.0, 1.0))

    set_act_visibility(act_objects, f_start, f_end)
    return {"collection": col, "objects": act_objects, "plates": plates}
