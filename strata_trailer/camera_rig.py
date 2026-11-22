"""
StrataOS v1.0.0 ("Bedrock") — Cinematic Camera Rig & Keyframe Choreography
==========================================================================
Configures a 35mm-85mm zoom cinema camera tracked to an animated Empty target,
with shallow Depth of Field (f/2.0 - f/2.8 rack focus), Bezier ease-in-out,
whip-pan exponential easing, spring-physics overshoot, and exact frame-boundary
collection visibility toggling across all 6 Acts (Frames 1 to 3600).
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Iterable

from geometry import get_or_create_collection, link_exclusively

try:
    import bpy
except ImportError:
    bpy = None


@dataclass
class CameraRig:
    camera_obj: Any
    camera_data: Any
    target_empty: Any
    dof_focus_empty: Any


def iter_fcurves(anim_data: Any) -> Iterable[Any]:
    """
    Yield all FCurves from an Action across Blender 4.0-4.3 (legacy action.fcurves)
    and Blender 4.4+ (layered/slotted actions).
    """
    if anim_data is None or anim_data.action is None:
        return
    action = anim_data.action
    if hasattr(action, "fcurves") and len(action.fcurves) > 0:
        for fc in action.fcurves:
            yield fc
    elif hasattr(action, "layers"):
        for layer in action.layers:
            for strip in getattr(layer, "strips", []):
                for cb in getattr(strip, "channelbags", []):
                    for fc in getattr(cb, "fcurves", []):
                        yield fc


def apply_bezier_interpolation(obj: Any, handle_type: str = "AUTO_CLAMPED") -> None:
    """Ensure all keyframes on an object or its data block use smooth BEZIER curves."""
    for block in (obj, getattr(obj, "data", None)):
        if block is None or getattr(block, "animation_data", None) is None:
            continue
        for fc in iter_fcurves(block.animation_data):
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
                kp.handle_left_type = handle_type
                kp.handle_right_type = handle_type
            fc.update()


def keyframe_transform(
    obj: Any,
    frame: int,
    location: tuple[float, float, float] | None = None,
    rotation_euler: tuple[float, float, float] | None = None,
    scale: tuple[float, float, float] | None = None,
) -> None:
    """Insert location, rotation, and/or scale keyframes at `frame` with BEZIER smoothing."""
    if location is not None:
        obj.location = location
        obj.keyframe_insert(data_path="location", frame=frame)
    if rotation_euler is not None:
        obj.rotation_euler = rotation_euler
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert(data_path="scale", frame=frame)
    apply_bezier_interpolation(obj)


def keyframe_spring_overshoot(
    obj: Any,
    frame_start: int,
    frame_end: int,
    start_loc: tuple[float, float, float],
    target_loc: tuple[float, float, float],
    overshoot_factor: float = 0.08,
) -> None:
    """
    Animate an object from `start_loc` to `target_loc` with physically grounded
    spring-physics overshoot and settle (used for Act 3 rising OS windows and Act 4 dock snap).
    """
    duration = max(12, frame_end - frame_start)
    frame_peak = frame_start + int(duration * 0.68)
    frame_rebound = frame_start + int(duration * 0.86)

    dx = target_loc[0] - start_loc[0]
    dy = target_loc[1] - start_loc[1]
    dz = target_loc[2] - start_loc[2]

    peak_loc = (
        target_loc[0] + dx * overshoot_factor,
        target_loc[1] + dy * overshoot_factor,
        target_loc[2] + dz * overshoot_factor,
    )
    rebound_loc = (
        target_loc[0] - dx * (overshoot_factor * 0.28),
        target_loc[1] - dy * (overshoot_factor * 0.28),
        target_loc[2] - dz * (overshoot_factor * 0.28),
    )

    keyframe_transform(obj, frame_start, location=start_loc)
    keyframe_transform(obj, frame_peak, location=peak_loc)
    keyframe_transform(obj, frame_rebound, location=rebound_loc)
    keyframe_transform(obj, frame_end, location=target_loc)


def set_act_visibility(
    objects: Iterable[Any],
    active_start: int,
    active_end: int,
    total_frames: int = 3600,
) -> None:
    """
    Cleanly toggle `hide_render` and `hide_viewport` with CONSTANT step keyframes
    on exact Act frame boundaries so inactive Acts consume zero GPU/raytracing cost.
    """
    for obj in objects:
        # Include any children recursively
        all_targets = [obj] + list(getattr(obj, "children_recursive", []))
        for target in all_targets:
            if active_start > 1:
                target.hide_render = True
                target.hide_viewport = True
                target.keyframe_insert(data_path="hide_render", frame=1)
                target.keyframe_insert(data_path="hide_viewport", frame=1)
                target.keyframe_insert(data_path="hide_render", frame=active_start - 1)
                target.keyframe_insert(data_path="hide_viewport", frame=active_start - 1)

            target.hide_render = False
            target.hide_viewport = False
            target.keyframe_insert(data_path="hide_render", frame=active_start)
            target.keyframe_insert(data_path="hide_viewport", frame=active_start)
            target.keyframe_insert(data_path="hide_render", frame=active_end)
            target.keyframe_insert(data_path="hide_viewport", frame=active_end)

            if active_end < total_frames:
                target.hide_render = True
                target.hide_viewport = True
                target.keyframe_insert(data_path="hide_render", frame=active_end + 1)
                target.keyframe_insert(data_path="hide_viewport", frame=active_end + 1)

            if target.animation_data:
                for fc in iter_fcurves(target.animation_data):
                    if "hide_" in fc.data_path:
                        for kp in fc.keyframe_points:
                            kp.interpolation = "CONSTANT"


def build_cinematic_camera_rig() -> CameraRig:
    """
    Create the master cinema camera tracked to `CamTarget` with dedicated
    `CamFocusTarget` for Depth of Field (f/2.0 - f/2.8 rack focus).
    """
    cam_col = get_or_create_collection("00_Camera_Rig")

    target_empty = bpy.data.objects.new("CamTarget", None)
    target_empty.empty_display_type = "SPHERE"
    target_empty.empty_display_size = 0.25
    link_exclusively(target_empty, cam_col)

    dof_empty = bpy.data.objects.new("CamFocusTarget", None)
    dof_empty.empty_display_type = "CROSS"
    dof_empty.empty_display_size = 0.25
    link_exclusively(dof_empty, cam_col)

    cam_data = bpy.data.cameras.new(name="StrataCinemaCam")
    cam_data.lens = 50.0
    cam_data.sensor_width = 36.0
    cam_data.clip_start = 0.05
    cam_data.clip_end = 250.0
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = dof_empty
    cam_data.dof.aperture_fstop = 2.4
    cam_data.dof.aperture_blades = 7

    cam_obj = bpy.data.objects.new(name="StrataCinemaCam", object_data=cam_data)
    link_exclusively(cam_obj, cam_col)
    bpy.context.scene.camera = cam_obj

    track = cam_obj.constraints.new(type="TRACK_TO")
    track.target = target_empty
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    return CameraRig(
        camera_obj=cam_obj,
        camera_data=cam_data,
        target_empty=target_empty,
        dof_focus_empty=dof_empty,
    )


def keyframe_camera_shot(
    rig: CameraRig,
    frame: int,
    cam_loc: tuple[float, float, float],
    target_loc: tuple[float, float, float],
    focus_loc: tuple[float, float, float] | None = None,
    lens_mm: float = 50.0,
    fstop: float = 2.8,
) -> None:
    """Keyframe camera position, look-at target, DoF focus target, focal length, and aperture."""
    keyframe_transform(rig.camera_obj, frame, location=cam_loc)
    keyframe_transform(rig.target_empty, frame, location=target_loc)
    keyframe_transform(
        rig.dof_focus_empty,
        frame,
        location=focus_loc if focus_loc is not None else target_loc,
    )

    rig.camera_data.lens = lens_mm
    rig.camera_data.keyframe_insert(data_path="lens", frame=frame)
    rig.camera_data.dof.aperture_fstop = fstop
    rig.camera_data.dof.keyframe_insert(data_path="aperture_fstop", frame=frame)
    apply_bezier_interpolation(rig.camera_obj)


def animate_full_trailer_camera(rig: CameraRig) -> None:
    """
    Choreograph the 60-second (3,600-frame @ 60fps) camera trajectory across all 6 Acts:
      - Act 1 (1-600): Slow low-angle macro dolly-in (f/2.0) racking focus onto F2: SETUP.
      - Act 2 (601-1200): Orbital glide diving between floating glass strata layers, accelerating upward.
      - Act 3 (1201-1920): Wide hero 3/4 establishing shot of StrataOS Desktop with subtle micro-drift.
      - Act 4 (1921-2520): Tight push onto Strata Terminal, vertical tilt-down following WASM Cube descent.
      - Act 5 (2521-3180): Three rhythmic whip-pan cuts across WebGPU Studio, Copilot+Studio IDE, and ByteScope.
      - Act 6 (3181-3600): Authoritative dolly-out revealing the 3D StrataOS emblem and 'STRATA OS' typography.
    """
    # --- ACT 1: The Monolith & StrataUEFI (Frames 1 - 600) ---
    keyframe_camera_shot(
        rig,
        frame=1,
        cam_loc=(-4.6, -7.8, -0.55),
        target_loc=(0.0, 0.0, -0.35),
        focus_loc=(0.0, -2.5, -0.8),
        lens_mm=65.0,
        fstop=2.0,
    )
    keyframe_camera_shot(
        rig,
        frame=280,
        cam_loc=(-2.2, -5.8, 0.55),
        target_loc=(0.0, 0.0, 0.35),
        focus_loc=(0.0, 0.0, 0.45),
        lens_mm=72.0,
        fstop=2.0,
    )
    # Rack focus tight onto glowing F2: SETUP prompt on UEFI POST hologram
    keyframe_camera_shot(
        rig,
        frame=600,
        cam_loc=(-0.85, -4.4, 1.15),
        target_loc=(0.0, 0.0, 1.25),
        focus_loc=(-0.4, -0.25, 1.05),
        lens_mm=85.0,
        fstop=2.0,
    )

    # --- ACT 2: Inside the Kernel (unkernel Linux 7.x WASM) (Frames 601 - 1200) ---
    keyframe_camera_shot(
        rig,
        frame=640,
        cam_loc=(-3.8, -4.2, -0.15),
        target_loc=(0.0, 0.0, -0.25),
        focus_loc=(0.0, 0.0, -0.25),
        lens_mm=42.0,
        fstop=2.4,
    )
    keyframe_camera_shot(
        rig,
        frame=940,
        cam_loc=(3.9, -3.6, 0.15),
        target_loc=(0.0, 0.0, 0.05),
        focus_loc=(0.0, 0.0, 0.0),
        lens_mm=38.0,
        fstop=2.6,
    )
    # Accelerate upward through the top glass pane as the OS boots
    keyframe_camera_shot(
        rig,
        frame=1200,
        cam_loc=(0.0, -2.8, 2.35),
        target_loc=(0.0, 0.2, 2.55),
        focus_loc=(0.0, 0.0, 2.5),
        lens_mm=35.0,
        fstop=2.8,
    )

    # --- ACT 3: The Desktop Materializes (Frames 1201 - 1920) ---
    keyframe_camera_shot(
        rig,
        frame=1280,
        cam_loc=(-2.8, -8.4, 2.1),
        target_loc=(0.0, 0.0, 1.45),
        focus_loc=(0.0, 0.0, 1.45),
        lens_mm=45.0,
        fstop=2.8,
    )
    # Gentle handheld-style micro-drift across the 3-window 3D parallax desktop
    keyframe_camera_shot(
        rig,
        frame=1600,
        cam_loc=(-1.4, -8.1, 2.32),
        target_loc=(0.15, 0.0, 1.52),
        focus_loc=(-0.4, -0.2, 1.5),
        lens_mm=48.0,
        fstop=2.8,
    )
    keyframe_camera_shot(
        rig,
        frame=1920,
        cam_loc=(1.9, -8.2, 2.05),
        target_loc=(0.0, 0.0, 1.45),
        focus_loc=(0.0, 0.0, 1.45),
        lens_mm=50.0,
        fstop=2.8,
    )

    # --- ACT 4: strataget & WASM Package Delivery (Frames 1921 - 2520) ---
    # Push tight onto Strata Terminal
    keyframe_camera_shot(
        rig,
        frame=2010,
        cam_loc=(-1.6, -4.6, 1.75),
        target_loc=(-1.3, 0.0, 1.65),
        focus_loc=(-1.3, 0.0, 1.65),
        lens_mm=68.0,
        fstop=2.4,
    )
    # Tilt up to catch descending wireframe WASM Cube above registry ring
    keyframe_camera_shot(
        rig,
        frame=2160,
        cam_loc=(0.4, -6.5, 2.6),
        target_loc=(0.8, 0.0, 3.6),
        focus_loc=(0.8, 0.0, 3.6),
        lens_mm=52.0,
        fstop=2.6,
    )
    # Dynamic vertical tilt-down following cube descent into PixelSynth window & Dock slot
    keyframe_camera_shot(
        rig,
        frame=2380,
        cam_loc=(1.1, -6.2, 1.55),
        target_loc=(0.8, 0.0, 1.45),
        focus_loc=(0.8, 0.0, 1.45),
        lens_mm=55.0,
        fstop=2.8,
    )
    keyframe_camera_shot(
        rig,
        frame=2520,
        cam_loc=(0.6, -6.8, 1.4),
        target_loc=(0.4, 0.0, 1.25),
        focus_loc=(0.4, 0.0, 1.25),
        lens_mm=55.0,
        fstop=2.8,
    )

    # --- ACT 5: Flagship Power Montage (Frames 2521 - 3180) ---
    # Shot 5A (2521-2740): Whip-pan left to WebGPU Studio & 2,000+ erupting particles
    keyframe_camera_shot(
        rig,
        frame=2535,
        cam_loc=(-6.4, -4.9, 1.85),
        target_loc=(-5.5, 0.0, 1.55),
        focus_loc=(-5.5, -0.8, 1.55),
        lens_mm=42.0,
        fstop=2.4,
    )
    keyframe_camera_shot(
        rig,
        frame=2730,
        cam_loc=(-4.6, -4.5, 1.6),
        target_loc=(-5.5, 0.0, 1.55),
        focus_loc=(-5.5, -1.1, 1.55),
        lens_mm=48.0,
        fstop=2.4,
    )

    # Shot 5B (2741-2960): Whip-pan center to Strata Copilot + Studio IDE split-pane
    keyframe_camera_shot(
        rig,
        frame=2755,
        cam_loc=(-0.5, -4.7, 1.65),
        target_loc=(0.0, 0.0, 1.55),
        focus_loc=(0.0, -0.2, 1.55),
        lens_mm=54.0,
        fstop=2.6,
    )
    keyframe_camera_shot(
        rig,
        frame=2950,
        cam_loc=(0.7, -4.6, 1.58),
        target_loc=(0.0, 0.0, 1.55),
        focus_loc=(0.0, -0.2, 1.55),
        lens_mm=58.0,
        fstop=2.6,
    )

    # Shot 5C (2961-3180): Whip-pan right to ByteScope Synth & 3D Emerald Lissajous Curve
    keyframe_camera_shot(
        rig,
        frame=2975,
        cam_loc=(4.6, -4.8, 1.65),
        target_loc=(5.5, -0.2, 1.55),
        focus_loc=(5.5, -0.45, 1.55),
        lens_mm=50.0,
        fstop=2.2,
    )
    keyframe_camera_shot(
        rig,
        frame=3175,
        cam_loc=(6.3, -4.5, 1.5),
        target_loc=(5.5, -0.2, 1.55),
        focus_loc=(5.5, -0.45, 1.55),
        lens_mm=54.0,
        fstop=2.2,
    )

    # --- ACT 6: The Finale — StrataOS v1.0.0 "Bedrock" (Frames 3181 - 3600) ---
    keyframe_camera_shot(
        rig,
        frame=3220,
        cam_loc=(0.0, -6.2, 1.75),
        target_loc=(0.0, 0.0, 1.15),
        focus_loc=(0.0, 0.0, 1.15),
        lens_mm=50.0,
        fstop=2.8,
    )
    keyframe_camera_shot(
        rig,
        frame=3520,
        cam_loc=(0.0, -9.8, 1.95),
        target_loc=(0.0, 0.0, 1.05),
        focus_loc=(0.0, 0.0, 1.05),
        lens_mm=55.0,
        fstop=2.8,
    )
    keyframe_camera_shot(
        rig,
        frame=3600,
        cam_loc=(0.0, -10.4, 2.0),
        target_loc=(0.0, 0.0, 1.05),
        focus_loc=(0.0, 0.0, 1.05),
        lens_mm=55.0,
        fstop=2.8,
    )
