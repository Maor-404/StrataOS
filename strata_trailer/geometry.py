"""
StrataOS v1.0.0 ("Bedrock") — Reusable Procedural 3D Geometry Builders
======================================================================
Constructs beveled dark-glass OS windows with 36px-proportion title bars,
glowing Comlink data-bus ribbons, 3D wireframe WASM package cubes,
2,000+ WebGPU flow-field particle swarms, and 3D Lissajous oscilloscope curves.
"""

from __future__ import annotations
import math
from pathlib import Path
from typing import Any, Sequence

from config import PALETTE_LINEAR
from materials import (
    create_ui_screen_material,
    mat_emissive_text,
    mat_frosted_glass,
    mat_obsidian_floor,
    mat_oscilloscope_beam,
    mat_titanium_bevel,
    mat_wireframe_holo,
)

try:
    import bpy
    import bmesh
    from mathutils import Vector
except ImportError:
    bpy = None
    bmesh = None
    Vector = None


def get_or_create_collection(name: str, parent: Any = None) -> Any:
    """Return or create a named scene collection for clean outliner hierarchy."""
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    col = bpy.data.collections.new(name)
    target_parent = parent if parent is not None else bpy.context.scene.collection
    target_parent.children.link(col)
    return col


def link_exclusively(obj: Any, collection: Any) -> None:
    """Link an object exclusively to the specified collection."""
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)


def build_studio_environment() -> dict[str, Any]:
    """
    Create the obsidian reflective floor (#050507), three-point studio rim lighting
    (large soft Area lights tuned for specular highlights on beveled glass),
    and subtle volumetric haze (Principled Volume density 0.004).
    """
    env_col = get_or_create_collection("00_Studio_Environment")

    # 1. World Shader with Principled Volume (low density 0.004)
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("StrataStudioWorld")
        bpy.context.scene.world = world
    world.use_nodes = True
    wnodes = world.node_tree.nodes
    wlinks = world.node_tree.links
    wnodes.clear()

    w_out = wnodes.new(type="ShaderNodeOutputWorld")
    w_out.location = (400, 0)

    w_bg = wnodes.new(type="ShaderNodeBackground")
    w_bg.location = (120, 80)
    w_bg.inputs["Color"].default_value = PALETTE_LINEAR["obsidian_void"]
    w_bg.inputs["Strength"].default_value = 0.35

    w_vol = wnodes.new(type="ShaderNodeVolumePrincipled")
    w_vol.location = (120, -120)
    w_vol.inputs["Color"].default_value = (0.04, 0.07, 0.10, 1.0)
    w_vol.inputs["Density"].default_value = 0.004
    w_vol.inputs["Anisotropy"].default_value = 0.45

    wlinks.new(w_bg.outputs["Background"], w_out.inputs["Surface"])
    wlinks.new(w_vol.outputs["Volume"], w_out.inputs["Volume"])

    # 2. Reflective Obsidian Studio Floor
    bpy.ops.mesh.primitive_plane_add(size=80.0, location=(0.0, 0.0, -2.4))
    floor = bpy.context.active_object
    floor.name = "Studio_Obsidian_Floor"
    floor.data.materials.append(mat_obsidian_floor())
    link_exclusively(floor, env_col)

    # 3. Three-Point Studio Rim Lighting (Large Soft Area Lights)
    lights = {}
    light_specs = [
        # (name, location, rotation_euler_deg, size_x, size_y, energy, color)
        (
            "Key_Top_Specular",
            (0.0, -5.5, 8.5),
            (32.0, 0.0, 0.0),
            7.5,
            4.0,
            650.0,
            (0.96, 0.98, 1.0),
        ),
        (
            "Rim_IceBlue_Left",
            (-8.5, 3.5, 4.2),
            (58.0, 0.0, -128.0),
            5.0,
            6.0,
            480.0,
            PALETTE_LINEAR["ice_blue"][:3],
        ),
        (
            "Rim_Emerald_Right",
            (8.5, 4.0, 3.6),
            (62.0, 0.0, 132.0),
            5.0,
            5.5,
            390.0,
            PALETTE_LINEAR["emerald_signal"][:3],
        ),
        (
            "Back_Silhouette_Grazing",
            (0.0, 9.0, 2.2),
            (-78.0, 0.0, 0.0),
            10.0,
            2.2,
            520.0,
            (0.85, 0.92, 1.0),
        ),
    ]

    for lname, loc, rot_deg, sx, sy, energy, col in light_specs:
        light_data = bpy.data.lights.new(name=lname, type="AREA")
        light_data.shape = "RECTANGLE"
        light_data.size = sx
        light_data.size_y = sy
        light_data.energy = energy
        light_data.color = col
        light_obj = bpy.data.objects.new(name=lname, object_data=light_data)
        light_obj.location = loc
        light_obj.rotation_euler = tuple(math.radians(a) for a in rot_deg)
        link_exclusively(light_obj, env_col)
        lights[lname] = light_obj

    return {"floor": floor, "lights": lights, "collection": env_col}


def build_beveled_slab(
    name: str,
    dimensions: tuple[float, float, float],
    bevel_width: float,
    material: Any,
    collection: Any,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> Any:
    """Create a precision beveled architectural plate or titanium slab."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name

    # Apply target dimensions at mesh level so bevel modifier is uniform
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.scale(bm, vec=dimensions, verts=bm.verts)
    bm.to_mesh(obj.data)
    bm.free()

    bevel = obj.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = bevel_width
    bevel.segments = 4
    bevel.limit_method = "ANGLE"

    for poly in obj.data.polygons:
        poly.use_smooth = True

    obj.data.materials.append(material)
    link_exclusively(obj, collection)
    return obj


def build_glass_os_window(
    name: str,
    width: float,
    height: float,
    texture_path: Path,
    collection: Any,
    depth: float = 0.075,
    emission_strength: float = 1.65,
) -> Any:
    """
    Build a 3D StrataOS floating glass window assembly:
      - Parent Empty controller (`name`)
      - Anodized titanium beveled perimeter frame (`#18181b`)
      - Frosted dark glass backing slab (`#121215`, roughness 0.12, IOR 1.45)
      - Raised 36px-proportion top title-bar rail with specular cyan indicator
      - High-DPI 2048x1280 UI display plane on front face
    """
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.4
    link_exclusively(root, collection)

    # 1. Frosted Dark Glass Substrate
    glass_body = build_beveled_slab(
        name=f"{name}_GlassSubstrate",
        dimensions=(width, depth, height),
        bevel_width=0.018,
        material=mat_frosted_glass(),
        collection=collection,
    )
    glass_body.parent = root

    # 2. Brushed Titanium Beveled Rim Chassis
    chassis = build_beveled_slab(
        name=f"{name}_TitaniumRim",
        dimensions=(width + 0.04, depth * 0.82, height + 0.04),
        bevel_width=0.022,
        material=mat_titanium_bevel(),
        collection=collection,
        location=(0.0, 0.008, 0.0),
    )
    chassis.parent = root

    # 3. 36px-proportion Title Bar Specular Accent Rail (36 / 640 = 5.625% of height)
    title_h = height * 0.05625
    title_rail = build_beveled_slab(
        name=f"{name}_TitleBarRail",
        dimensions=(width * 0.992, depth + 0.008, title_h),
        bevel_width=0.006,
        material=mat_titanium_bevel(),
        collection=collection,
        location=(0.0, -0.002, (height * 0.5) - (title_h * 0.5)),
    )
    title_rail.parent = root

    # 4. Crisp High-DPI 2048x1280 Textured UI Screen Plane (facing -Y toward camera)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0.0, -(depth * 0.5) - 0.003, 0.0))
    screen = bpy.context.active_object
    screen.name = f"{name}_UIScreen"
    screen.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    screen.scale = (width * 0.985, height * 0.985, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    screen_mat = create_ui_screen_material(
        name=f"mat_ui_{name}",
        texture_path=texture_path,
        emission_strength=emission_strength,
    )
    screen.data.materials.append(screen_mat)
    link_exclusively(screen, collection)
    screen.parent = root

    return root


def build_data_bus_ribbon(
    name: str,
    points: Sequence[tuple[float, float, float]],
    bevel_depth: float,
    material: Any,
    collection: Any,
) -> Any:
    """Create a 3D glowing spline ribbon for Comlink RPC and Copilot AI streams."""
    curve_data = bpy.data.curves.new(name=f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 24
    curve_data.bevel_depth = bevel_depth
    curve_data.bevel_resolution = 6

    spline = curve_data.splines.new(type="POLY")
    spline.points.add(len(points) - 1)
    for idx, (x, y, z) in enumerate(points):
        spline.points[idx].co = (x, y, z, 1.0)

    obj = bpy.data.objects.new(name, curve_data)
    obj.data.materials.append(material)
    link_exclusively(obj, collection)
    return obj


def build_wasm_wireframe_cube(
    name: str,
    size: float,
    collection: Any,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> Any:
    """
    Create a dual-layer 3D WebAssembly package cube:
      - Outer glowing wireframe cage (`Wireframe` modifier)
      - Inner frosted dark glass core
    """
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = size * 0.5
    root.location = location
    link_exclusively(root, collection)

    # Outer wireframe cage
    bpy.ops.mesh.primitive_cube_add(size=size, location=(0.0, 0.0, 0.0))
    cage = bpy.context.active_object
    cage.name = f"{name}_WireCage"
    subd = cage.modifiers.new(name="Subdiv", type="SUBSURF")
    subd.subdivision_type = "SIMPLE"
    subd.levels = 1
    subd.render_levels = 1

    wire = cage.modifiers.new(name="Wireframe", type="WIREFRAME")
    wire.thickness = size * 0.045
    wire.use_replace = True
    cage.data.materials.append(mat_wireframe_holo())
    link_exclusively(cage, collection)
    cage.parent = root

    # Inner frosted core
    core = build_beveled_slab(
        name=f"{name}_GlassCore",
        dimensions=(size * 0.68, size * 0.68, size * 0.68),
        bevel_width=size * 0.04,
        material=mat_frosted_glass(),
        collection=collection,
    )
    core.parent = root

    return root


def build_flow_field_particles(
    name: str,
    count: int,
    collection: Any,
    origin: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> Any:
    """
    Generate a single high-performance mesh containing 2,000+ 3D tetrahedral
    flow-field particles arranged along spiral curl-noise streamlines so it
    erupts outward from the WebGPU Studio window at 60fps.
    """
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    bm = bmesh.new()

    golden_angle = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(count):
        t = i / max(1, count - 1)
        theta = i * golden_angle * 4.0
        radius = 0.25 + 3.6 * (t ** 0.72)
        px = math.cos(theta) * radius
        py = -0.2 - 3.2 * (t ** 1.1) + 0.35 * math.sin(theta * 2.0)
        pz = math.sin(theta) * (radius * 0.62) + 0.25 * math.cos(t * 12.0)

        # Build a tiny 3D diamond/tetrahedron at (px, py, pz)
        s = 0.018 + 0.022 * (1.0 - t * 0.5)
        v0 = bm.verts.new((px, py - s * 1.8, pz))
        v1 = bm.verts.new((px - s, py + s, pz - s))
        v2 = bm.verts.new((px + s, py + s, pz - s))
        v3 = bm.verts.new((px, py + s, pz + s * 1.2))
        bm.faces.new((v0, v1, v2))
        bm.faces.new((v0, v2, v3))
        bm.faces.new((v0, v3, v1))
        bm.faces.new((v1, v3, v2))

    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    obj.location = origin
    obj.data.materials.append(mat_wireframe_holo("mat_webgpu_particles", PALETTE_LINEAR["ice_blue"], 8.5))
    link_exclusively(obj, collection)
    return obj


def build_oscilloscope_lissajous(
    name: str,
    collection: Any,
    radius_x: float = 2.2,
    radius_y: float = 1.35,
    resolution: int = 360,
) -> Any:
    """
    Build a physical, glowing 3D emerald X-Y Oscilloscope Lissajous curve
    in front of the ByteScope window with dynamic Wave modifiers for 60fps morphing.
    """
    curve_data = bpy.data.curves.new(name=f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 16
    curve_data.bevel_depth = 0.026
    curve_data.bevel_resolution = 6

    spline = curve_data.splines.new(type="POLY")
    spline.use_cyclic_u = True
    spline.points.add(resolution - 1)

    for i in range(resolution):
        t = (i / float(resolution)) * 2.0 * math.pi
        x = math.sin(3.0 * t + 0.45) * radius_x
        y = -0.35 + math.cos(5.0 * t) * 0.38
        z = math.sin(4.0 * t) * radius_y
        spline.points[i].co = (x, y, z, 1.0)

    obj = bpy.data.objects.new(name, curve_data)
    obj.data.materials.append(mat_oscilloscope_beam())

    # Add a Wave modifier so the 3D Lissajous curve pulses organically across frames
    wave = obj.modifiers.new(name="HarmonicPulse", type="WAVE")
    wave.use_normal = False
    wave.use_x = True
    wave.use_y = True
    wave.use_z = True
    wave.height = 0.22
    wave.width = 1.1
    wave.narrowness = 1.5
    wave.speed = 0.18

    link_exclusively(obj, collection)
    return obj


def build_3d_text(
    name: str,
    text: str,
    size: float,
    collection: Any,
    material: Any | None = None,
    extrude: float = 0.015,
    bevel_depth: float = 0.003,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation_deg: tuple[float, float, float] = (90.0, 0.0, 0.0),
    align_x: str = "CENTER",
) -> Any:
    """Create crisp 3D beveled typography in Blender 4.x."""
    font_curve = bpy.data.curves.new(type="FONT", name=f"{name}_FontCurve")
    font_curve.body = text
    font_curve.size = size
    font_curve.extrude = extrude
    font_curve.bevel_depth = bevel_depth
    font_curve.bevel_resolution = 3
    font_curve.align_x = align_x
    font_curve.align_y = "CENTER"

    obj = bpy.data.objects.new(name=name, object_data=font_curve)
    obj.location = location
    obj.rotation_euler = tuple(math.radians(a) for a in rotation_deg)
    obj.data.materials.append(material if material is not None else mat_emissive_text())
    link_exclusively(obj, collection)
    return obj
