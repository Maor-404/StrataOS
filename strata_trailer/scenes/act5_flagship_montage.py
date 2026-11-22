"""
Act 5: Flagship Power Montage (Frames 2521–3180 | 0:42–0:53)
============================================================
Fast, rhythmic whip-pan cuts (approx. 3.5 seconds each) showcasing the v1.0.0 exclusives:
  1. WebGPU Studio (2521–2740): A 3D swirl of 2,000+ glowing flow-field particles
     erupts *outward* from the WebGPU Studio window into 3D space.
  2. Strata Copilot + Studio IDE (2741–2960): A sleek luminous ribbon flows from
     the Strata Copilot panel directly into the Strata Studio split-pane code editor,
     illuminating syntax-highlighted code lines.
  3. ByteScope Synth (2961–3180): A physical, glowing 3D emerald X-Y Oscilloscope
     Lissajous curve pulses and morphs dynamically in front of the ByteScope window.
"""

from __future__ import annotations
import math
from pathlib import Path
from typing import Any

from camera_rig import keyframe_transform, set_act_visibility
from config import ACT5_SUBRANGES, ACT_RANGES, PALETTE_LINEAR
from geometry import (
    build_3d_text,
    build_beveled_slab,
    build_data_bus_ribbon,
    build_flow_field_particles,
    build_glass_os_window,
    build_oscilloscope_lissajous,
    get_or_create_collection,
)
from materials import (
    mat_emissive_text,
    mat_oscilloscope_beam,
    mat_wireframe_holo,
)


def build_act5_flagship_montage(textures: dict[str, Path]) -> dict[str, Any]:
    f_start, f_end = ACT_RANGES["act5_flagship_montage"]
    col = get_or_create_collection("05_Act5_Flagship_Montage")
    act_objects: list[Any] = []

    # ==========================================================================
    # Station 1 (X = -5.5 | Frames 2521–2740): WebGPU Studio + 2,200 Flow Particles
    # ==========================================================================
    s1_start, s1_end = ACT5_SUBRANGES["webgpu_studio"]
    win_webgpu = build_glass_os_window(
        name="Act5_Window_WebGPU_Studio",
        width=3.8,
        height=2.38,
        texture_path=textures["webgpu_studio"],
        collection=col,
        emission_strength=1.85,
    )
    win_webgpu.location = (-5.5, 0.0, 1.55)
    act_objects.append(win_webgpu)

    particles = build_flow_field_particles(
        name="Act5_WebGPU_FlowField_2200_Particles",
        count=2200,
        collection=col,
        origin=(-5.5, -0.1, 1.55),
    )
    act_objects.append(particles)

    keyframe_transform(
        particles,
        frame=s1_start,
        location=(-5.5, -0.05, 1.55),
        rotation_euler=(0.0, 0.0, 0.0),
        scale=(0.08, 0.08, 0.08),
    )
    keyframe_transform(
        particles,
        frame=s1_start + 65,
        location=(-5.5, -0.35, 1.55),
        rotation_euler=(0.0, math.radians(45.0), 0.0),
        scale=(1.0, 1.0, 1.0),
    )
    keyframe_transform(
        particles,
        frame=s1_end,
        location=(-5.5, -0.55, 1.55),
        rotation_euler=(0.0, math.radians(160.0), math.radians(15.0)),
        scale=(1.18, 1.25, 1.18),
    )

    label_webgpu = build_3d_text(
        name="Act5_Label_WebGPU",
        text="STRATA GPU STUDIO  •  navigator.gpu 120fps WGSL Compute Flow-Field",
        size=0.14,
        collection=col,
        material=mat_emissive_text("mat_act5_webgpu_txt", PALETTE_LINEAR["ice_blue"], 6.0),
        location=(-5.5, -0.35, 2.95),
    )
    act_objects.append(label_webgpu)

    # ==========================================================================
    # Station 2 (X = 0.0 | Frames 2741–2960): Strata Copilot + Strata Studio IDE
    # ==========================================================================
    s2_start, s2_end = ACT5_SUBRANGES["copilot_studio_ide"]
    win_studio = build_glass_os_window(
        name="Act5_Window_StrataStudio_Copilot",
        width=3.9,
        height=2.44,
        texture_path=textures["studio_ide"],
        collection=col,
        emission_strength=1.8,
    )
    win_studio.location = (0.0, 0.0, 1.55)
    act_objects.append(win_studio)

    # Luminous AI ribbon flowing from the right Copilot pane into the center CodeMirror 6 editor
    ai_ribbon_mat = mat_wireframe_holo("mat_act5_ai_ribbon", PALETTE_LINEAR["ice_blue"], 9.5)
    copilot_ribbons = [
        [(1.25, -0.08, 1.95), (0.85, -0.45, 2.05), (0.25, -0.35, 1.85), (-0.45, -0.08, 1.75)],
        [(1.25, -0.08, 1.65), (0.75, -0.52, 1.65), (0.15, -0.38, 1.55), (-0.45, -0.08, 1.50)],
        [(1.25, -0.08, 1.35), (0.80, -0.42, 1.28), (0.20, -0.32, 1.30), (-0.45, -0.08, 1.25)],
    ]
    for idx, r_pts in enumerate(copilot_ribbons):
        ribbon = build_data_bus_ribbon(
            name=f"Act5_Copilot_CodeStream_Ribbon_{idx + 1}",
            points=r_pts,
            bevel_depth=0.018,
            material=ai_ribbon_mat,
            collection=col,
        )
        act_objects.append(ribbon)
        ribbon.data.bevel_factor_end = 0.0
        ribbon.data.keyframe_insert(data_path="bevel_factor_end", frame=s2_start + idx * 14)
        ribbon.data.bevel_factor_end = 1.0
        ribbon.data.keyframe_insert(data_path="bevel_factor_end", frame=s2_start + 75 + idx * 14)

        # Glowing syntax-highlighted code bar illuminating inside the editor on arrival
        code_bar = build_beveled_slab(
            name=f"Act5_IlluminatedCodeLine_{idx + 1}",
            dimensions=(1.35, 0.02, 0.055),
            bevel_width=0.005,
            material=mat_emissive_text(
                f"mat_act5_codeline_{idx}",
                PALETTE_LINEAR["emerald_signal"] if idx == 1 else PALETTE_LINEAR["ice_blue"],
                7.5,
            ),
            collection=col,
            location=(-0.35, -0.07, 1.75 - idx * 0.25),
        )
        act_objects.append(code_bar)
        keyframe_transform(code_bar, frame=s2_start + 45 + idx * 14, scale=(0.01, 1.0, 1.0))
        keyframe_transform(code_bar, frame=s2_start + 95 + idx * 14, scale=(1.0, 1.0, 1.0))

    label_copilot = build_3d_text(
        name="Act5_Label_Copilot_Studio",
        text="STRATA STUDIO IDE + COPILOT AI  •  1-Click Kernel & WASI Code Injection",
        size=0.14,
        collection=col,
        material=mat_emissive_text("mat_act5_copilot_txt", PALETTE_LINEAR["crisp_white"], 5.5),
        location=(0.0, -0.35, 2.95),
    )
    act_objects.append(label_copilot)

    # ==========================================================================
    # Station 3 (X = +5.5 | Frames 2961–3180): ByteScope Synth + 3D Lissajous Curve
    # ==========================================================================
    s3_start, s3_end = ACT5_SUBRANGES["bytescope_synth"]
    win_bytescope = build_glass_os_window(
        name="Act5_Window_ByteScope_Synth",
        width=3.8,
        height=2.38,
        texture_path=textures["bytescope"],
        collection=col,
        emission_strength=1.75,
    )
    win_bytescope.location = (5.5, 0.0, 1.55)
    act_objects.append(win_bytescope)

    lissajous = build_oscilloscope_lissajous(
        name="Act5_ByteScope_3D_Lissajous_Curve",
        collection=col,
        radius_x=1.45,
        radius_y=0.88,
        resolution=400,
    )
    lissajous.location = (5.5, -0.45, 1.58)
    act_objects.append(lissajous)

    keyframe_transform(
        lissajous,
        frame=s3_start,
        location=(5.5, -0.15, 1.58),
        rotation_euler=(0.0, 0.0, 0.0),
        scale=(0.25, 0.25, 0.25),
    )
    keyframe_transform(
        lissajous,
        frame=s3_start + 50,
        location=(5.5, -0.48, 1.58),
        rotation_euler=(math.radians(12.0), math.radians(-18.0), math.radians(8.0)),
        scale=(1.05, 1.05, 1.05),
    )
    keyframe_transform(
        lissajous,
        frame=s3_end,
        location=(5.5, -0.55, 1.58),
        rotation_euler=(math.radians(-14.0), math.radians(28.0), math.radians(-12.0)),
        scale=(1.12, 1.12, 1.12),
    )

    label_bytescope = build_3d_text(
        name="Act5_Label_ByteScope",
        text="BYTESCOPE SYNTH  •  48kHz AudioWorklet Bytebeat & 3D X-Y Lissajous",
        size=0.14,
        collection=col,
        material=mat_oscilloscope_beam("mat_act5_bytescope_txt", 7.0),
        location=(5.5, -0.35, 2.95),
    )
    act_objects.append(label_bytescope)

    set_act_visibility(act_objects, f_start, f_end)
    return {"collection": col, "objects": act_objects}
