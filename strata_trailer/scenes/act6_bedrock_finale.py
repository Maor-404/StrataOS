"""
Act 6: The Finale — StrataOS v1.0.0 "Bedrock" (Frames 3181–3600 | 0:53–1:00)
============================================================================
- All open windows fold smoothly back into the 4 stacked dark-glass Strata plates,
  rotating into a minimalist 3D geometric StrataOS emblem.
- Crisp 3D beveled text fades in beneath the emblem:
    STRATA OS
    v1.0.0 "Bedrock" — Real Linux. Real WebGPU. One Browser Tab.
- Slow, authoritative dolly-out as the rim lights dim to a single glowing edge,
  fading cleanly to black on Frame 3600.
"""

from __future__ import annotations
import math
from typing import Any

from camera_rig import keyframe_spring_overshoot, keyframe_transform, set_act_visibility
from config import ACT_RANGES, PALETTE_LINEAR
from geometry import (
    build_3d_text,
    build_beveled_slab,
    get_or_create_collection,
)
from materials import (
    mat_emissive_text,
    mat_frosted_glass,
    mat_titanium_bevel,
    mat_wireframe_holo,
)


def build_act6_bedrock_finale(studio_lights: dict[str, Any] | None = None) -> dict[str, Any]:
    f_start, f_end = ACT_RANGES["act6_bedrock_finale"]
    col = get_or_create_collection("06_Act6_Bedrock_Finale")
    act_objects: list[Any] = []

    # 1. Four Stacked Dark-Glass Strata Plates folding from wide window positions
    # into the minimalist diamond-rotated 3D geometric StrataOS Emblem
    start_offsets = [
        (-3.2, -0.8, 2.65),
        (3.2, -0.6, 2.45),
        (-2.8, 0.4, 0.85),
        (2.8, 0.5, 0.65),
    ]

    emblem_plates: list[Any] = []
    for idx, s_loc in enumerate(start_offsets):
        plate_size = 1.45 - idx * 0.14
        mat = (
            mat_wireframe_holo("mat_act6_top_emblem", PALETTE_LINEAR["ice_blue"], 6.0)
            if idx == 3
            else mat_frosted_glass()
        )
        plate = build_beveled_slab(
            name=f"Act6_EmblemStrataPlate_{idx + 1}",
            dimensions=(plate_size, plate_size, 0.085),
            bevel_width=0.022,
            material=mat,
            collection=col,
            location=s_loc,
        )
        emblem_plates.append(plate)
        act_objects.append(plate)

        target_loc = (0.0, 0.0, 1.55 + idx * 0.19)
        keyframe_spring_overshoot(
            plate,
            frame_start=3185 + idx * 14,
            frame_end=3310 + idx * 14,
            start_loc=s_loc,
            target_loc=target_loc,
            overshoot_factor=0.07,
        )
        # Rotate into a 45-degree isometric Strata diamond emblem tilted toward camera
        keyframe_transform(
            plate,
            frame=3185 + idx * 14,
            rotation_euler=(math.radians(90.0), 0.0, 0.0),
        )
        keyframe_transform(
            plate,
            frame=3320 + idx * 14,
            rotation_euler=(math.radians(52.0), 0.0, math.radians(45.0)),
        )
        keyframe_transform(
            plate,
            frame=3600,
            location=(0.0, 0.0, 1.60 + idx * 0.19),
            rotation_euler=(math.radians(52.0), 0.0, math.radians(55.0)),
        )

    # Subtle glowing horizontal horizon edge under the emblem
    edge_mat = mat_emissive_text("mat_act6_single_glowing_edge", PALETTE_LINEAR["ice_blue"], 8.5)
    horizon_edge = build_beveled_slab(
        name="Act6_GlowingHorizonEdge",
        dimensions=(4.6, 0.02, 0.015),
        bevel_width=0.004,
        material=edge_mat,
        collection=col,
        location=(0.0, -0.2, 0.98),
    )
    act_objects.append(horizon_edge)
    keyframe_transform(horizon_edge, frame=3260, scale=(0.01, 1.0, 1.0))
    keyframe_transform(horizon_edge, frame=3380, scale=(1.0, 1.0, 1.0))
    keyframe_transform(horizon_edge, frame=3550, scale=(1.0, 1.0, 1.0))
    keyframe_transform(horizon_edge, frame=3600, scale=(0.001, 0.001, 0.001))

    # 2. Crisp 3D Beveled Hero Typography beneath the Emblem
    title_mat = mat_emissive_text("mat_act6_title_white", PALETTE_LINEAR["crisp_white"], 6.0)
    subtitle_mat = mat_emissive_text("mat_act6_subtitle_cyan", PALETTE_LINEAR["ice_blue"], 4.8)

    hero_title = build_3d_text(
        name="Act6_HeroTitle_STRATA_OS",
        text="STRATA OS",
        size=0.62,
        collection=col,
        material=title_mat,
        extrude=0.035,
        bevel_depth=0.008,
        location=(0.0, -0.25, 0.52),
    )
    hero_subtitle = build_3d_text(
        name="Act6_HeroSubtitle_Bedrock",
        text='v1.0.0 "Bedrock" — Real Linux. Real WebGPU. One Browser Tab.',
        size=0.165,
        collection=col,
        material=subtitle_mat,
        extrude=0.012,
        bevel_depth=0.003,
        location=(0.0, -0.25, 0.02),
    )
    act_objects.extend([hero_title, hero_subtitle])

    for txt_obj, z_pos in [(hero_title, 0.52), (hero_subtitle, 0.02)]:
        keyframe_transform(txt_obj, frame=3270, location=(0.0, -0.25, z_pos - 0.25), scale=(0.001, 0.001, 0.001))
        keyframe_transform(txt_obj, frame=3360, location=(0.0, -0.25, z_pos), scale=(1.0, 1.0, 1.0))
        keyframe_transform(txt_obj, frame=3530, location=(0.0, -0.25, z_pos), scale=(1.0, 1.0, 1.0))
        keyframe_transform(txt_obj, frame=3600, location=(0.0, -0.25, z_pos), scale=(0.001, 0.001, 0.001))

    # 3. Dim studio rim lights smoothly to black by Frame 3600
    if studio_lights:
        for light_obj in studio_lights.values():
            base_energy = light_obj.data.energy
            light_obj.data.keyframe_insert(data_path="energy", frame=3460)
            light_obj.data.energy = base_energy * 0.15
            light_obj.data.keyframe_insert(data_path="energy", frame=3560)
            light_obj.data.energy = 0.0
            light_obj.data.keyframe_insert(data_path="energy", frame=3600)

    set_act_visibility(act_objects, f_start, f_end)
    return {"collection": col, "objects": act_objects}
