"""
StrataOS v1.0.0 ("Bedrock") — Master Blender 4.x 3D Trailer Pipeline Entry Point
================================================================================
Clears the Blender scene, generates 2048x1280 high-DPI UI textures, configures
EEVEE Next (with Raytracing) or Cycles (GPU/OptiX/CUDA + OpenImageDenoise),
sets up AgX color management and the Fog-Glow / Lens-Dispersion Compositor,
builds all 6 Storyboard Acts (Frames 1–3600 @ 60fps), saves `strataos_trailer.blend`,
and renders `output/strataos_v1_trailer.mp4`.

Usage:
  blender --background --python strata_trailer/render_strataos.py -- --save-only
  blender --background --python strata_trailer/render_strataos.py -- --preview
  blender --background --python strata_trailer/render_strataos.py -- --master --cycles
"""

from __future__ import annotations
import sys
from pathlib import Path

# Ensure local modules resolve inside Blender's embedded Python runtime
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from config import RenderConfig, parse_cli_config
from ui_textures import generate_all_ui_textures

try:
    import bpy
except ImportError:
    bpy = None


def clear_scene() -> None:
    """Remove all default objects, collections, meshes, materials, lights, and curves."""
    bpy.ops.wm.read_factory_settings(use_empty=True)

    for collection_attr in (
        "objects",
        "meshes",
        "materials",
        "lights",
        "cameras",
        "curves",
        "collections",
        "images",
    ):
        data_col = getattr(bpy.data, collection_attr, None)
        if data_col is not None:
            for item in list(data_col):
                try:
                    data_col.remove(item)
                except Exception:
                    pass


def configure_render_engine(scene: "bpy.types.Scene", cfg: RenderConfig) -> None:
    """
    Configure EEVEE Next (with Raytracing, SSR, AO) as default, or Cycles
    (GPU/OptiX/CUDA + OpenImageDenoise) when `--cycles` is passed.
    """
    scene.render.resolution_x = cfg.resolution_x
    scene.render.resolution_y = cfg.resolution_y
    scene.render.resolution_percentage = cfg.resolution_percentage
    scene.render.fps = cfg.fps
    scene.frame_start = cfg.frame_start
    scene.frame_end = cfg.frame_end
    scene.frame_step = cfg.frame_step
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.45

    if cfg.use_cycles:
        scene.render.engine = "CYCLES"
        cycles = scene.cycles
        cycles.samples = cfg.cycles_samples
        cycles.use_adaptive_sampling = True
        cycles.adaptive_threshold = 0.015
        cycles.use_denoising = True
        if hasattr(cycles, "denoiser"):
            try:
                cycles.denoiser = "OPENIMAGEDENOISE"
            except Exception:
                pass

        # Automatically probe and enable GPU acceleration (OptiX -> CUDA -> HIP -> METAL)
        try:
            prefs = bpy.context.preferences
            cycles_prefs = prefs.addons["cycles"].preferences
            gpu_enabled = False
            for compute_type in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
                try:
                    cycles_prefs.compute_device_type = compute_type
                    cycles_prefs.get_devices()
                    devices = [d for d in cycles_prefs.devices if d.type != "CPU"]
                    if devices:
                        for d in cycles_prefs.devices:
                            d.use = True
                        cycles.device = "GPU"
                        gpu_enabled = True
                        print(f"[render_strataos] Cycles GPU acceleration enabled via {compute_type}")
                        break
                except Exception:
                    continue
            if not gpu_enabled:
                cycles.device = "CPU"
                print("[render_strataos] Cycles running on CPU with OpenImageDenoise")
        except Exception:
            cycles.device = "CPU"
    else:
        # Blender 4.2+ uses BLENDER_EEVEE_NEXT; Blender 4.0/4.1 uses BLENDER_EEVEE
        available_engines = {
            item.identifier
            for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
        }
        if "BLENDER_EEVEE_NEXT" in available_engines:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        else:
            scene.render.engine = "BLENDER_EEVEE"

        eevee = scene.eevee
        if hasattr(eevee, "taa_render_samples"):
            eevee.taa_render_samples = cfg.eevee_samples
        if hasattr(eevee, "use_raytracing"):
            eevee.use_raytracing = True
        if hasattr(eevee, "use_ssr"):
            eevee.use_ssr = True
        if hasattr(eevee, "use_ssr_refraction"):
            eevee.use_ssr_refraction = True
        if hasattr(eevee, "use_gtao"):
            eevee.use_gtao = True
        if hasattr(eevee, "use_volumetric_shadows"):
            eevee.use_volumetric_shadows = True

    # Configure AgX Color Management ("AgX - Medium High Contrast")
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.view_transform = "Filmic"
            scene.view_settings.look = "Medium High Contrast"
        except Exception:
            pass
    scene.view_settings.exposure = 0.1
    scene.view_settings.gamma = 1.0


def configure_compositor(scene: "bpy.types.Scene") -> None:
    """
    Build the Blender 4.x Compositor pipeline:
      Render Layers -> Glare (Fog Glow for emissive UI text/waveforms)
                    -> Lens Distortion (Projector dispersion 0.003)
                    -> Composite & Viewer
    """
    scene.use_nodes = True
    tree = scene.node_tree
    nodes = tree.nodes
    links = tree.links
    nodes.clear()

    rlayers = nodes.new(type="CompositorNodeRLayers")
    rlayers.location = (-450, 0)

    glare = nodes.new(type="CompositorNodeGlare")
    glare.location = (-120, 0)
    glare.glare_type = "FOG_GLOW"
    glare.quality = "HIGH"
    glare.mix = 0.0
    glare.threshold = 1.15
    if hasattr(glare, "size"):
        glare.size = 7

    lens = nodes.new(type="CompositorNodeLensdist")
    lens.location = (180, 0)
    if hasattr(lens, "use_fit"):
        lens.use_fit = True
    if hasattr(lens, "use_projector"):
        lens.use_projector = True

    # Set distortion & chromatic dispersion (0.003) across Blender 4.x node socket names
    for dist_name in ("Distort", "Distortion"):
        if dist_name in lens.inputs:
            lens.inputs[dist_name].default_value = -0.004
            break
    for disp_name in ("Dispersion",):
        if disp_name in lens.inputs:
            lens.inputs[disp_name].default_value = 0.003
            break

    comp = nodes.new(type="CompositorNodeComposite")
    comp.location = (480, 60)

    viewer = nodes.new(type="CompositorNodeViewer")
    viewer.location = (480, -100)

    links.new(rlayers.outputs["Image"], glare.inputs["Image"])
    links.new(glare.outputs["Image"], lens.inputs["Image"])
    links.new(lens.outputs["Image"], comp.inputs["Image"])
    links.new(lens.outputs["Image"], viewer.inputs["Image"])


def configure_ffmpeg_output(scene: "bpy.types.Scene", cfg: RenderConfig) -> None:
    """Configure high-profile H.264 MP4 output at `output/strataos_v1_trailer.mp4`."""
    scene.render.filepath = str(cfg.video_output_path)
    scene.render.image_settings.file_format = "FFMPEG"
    ffmpeg = scene.render.ffmpeg
    ffmpeg.format = "MPEG4"
    ffmpeg.codec = "H264"
    ffmpeg.constant_rate_factor = "HIGH" if not cfg.preview_mode else "MEDIUM"
    ffmpeg.ffmpeg_preset = "GOOD"
    ffmpeg.gopsize = cfg.fps // 2
    ffmpeg.audio_codec = "NONE"


def build_strataos_trailer(cfg: RenderConfig) -> None:
    """Assemble the complete 6-Act StrataOS v1.0.0 ('Bedrock') 3D trailer scene."""
    if bpy is None:
        raise RuntimeError(
            "render_strataos.py must be executed inside Blender 4.x:\n"
            "  blender --background --python strata_trailer/render_strataos.py -- --save-only"
        )

    from camera_rig import animate_full_trailer_camera, build_cinematic_camera_rig
    from geometry import build_studio_environment
    from materials import register_core_materials
    from scenes.act1_monolith_uefi import build_act1_monolith_uefi
    from scenes.act2_kernel_wasm import build_act2_kernel_wasm
    from scenes.act3_desktop_materialize import build_act3_desktop_materialize
    from scenes.act4_strataget_delivery import build_act4_strataget_delivery
    from scenes.act5_flagship_montage import build_act5_flagship_montage
    from scenes.act6_bedrock_finale import build_act6_bedrock_finale

    print("[1/6] Generating 2048x1280 high-DPI Pillow UI window textures...")
    textures = generate_all_ui_textures()

    print("[2/6] Clearing default scene & registering procedural shader library...")
    clear_scene()
    scene = bpy.context.scene
    register_core_materials()

    print("[3/6] Building obsidian studio floor, 3-point Area rim lighting & volumetric haze...")
    studio = build_studio_environment()

    print("[4/6] Constructing 6 Storyboard Acts (Frames 1–3600 @ 60fps)...")
    build_act1_monolith_uefi(textures)
    build_act2_kernel_wasm()
    build_act3_desktop_materialize(textures)
    build_act4_strataget_delivery(textures)
    build_act5_flagship_montage(textures)
    build_act6_bedrock_finale(studio["lights"])

    print("[5/6] Rigging tracked cinema camera (35mm-85mm zoom, f/2.0-f/2.8 rack focus DoF)...")
    cam_rig = build_cinematic_camera_rig()
    animate_full_trailer_camera(cam_rig)

    print("[6/6] Configuring EEVEE Next / Cycles, AgX color management & Fog-Glow Compositor...")
    configure_render_engine(scene, cfg)
    configure_compositor(scene)
    configure_ffmpeg_output(scene, cfg)

    scene.frame_set(1)
    cfg.blend_output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(cfg.blend_output_path))
    print(f"[SUCCESS] Saved Blender 4.x project -> {cfg.blend_output_path}")

    if not cfg.save_only:
        print(
            f"[RENDER] Rendering frames {cfg.frame_start}..{cfg.frame_end} (step={cfg.frame_step}) "
            f"at {cfg.resolution_x}x{cfg.resolution_y} ({scene.render.engine}) -> {cfg.video_output_path}"
        )
        bpy.ops.render.render(animation=True)
        print(f"[COMPLETE] Rendered trailer -> {cfg.video_output_path}")


if __name__ == "__main__":
    config = parse_cli_config()
    build_strataos_trailer(config)
