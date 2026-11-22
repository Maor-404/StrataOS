"""
StrataOS v1.0.0 ("Bedrock") — Blender 4.x Procedural Shader Library
===================================================================
Implements physically-based procedural materials with Blender 4.x Principled BSDF
socket compatibility (`Specular IOR Level`, `Transmission Weight`, `Coat Weight`,
`Emission Color`, `Emission Strength`).
"""

from __future__ import annotations
from pathlib import Path
from typing import Any
from config import PALETTE_LINEAR, RGBA

try:
    import bpy
except ImportError:
    bpy = None  # Allows syntax check outside Blender


def set_bsdf_input(bsdf: Any, candidates: list[str], value: Any) -> None:
    """Safely set a Principled BSDF input across Blender 4.0 - 4.3+ socket naming."""
    for name in candidates:
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value
            return


def mat_obsidian_floor(name: str = "mat_obsidian_floor") -> Any:
    """
    Deep obsidian studio floor (#050507) with subtle procedural micro-anisotropy
    and crisp specular reflections for the sweeping light line in Act 1.
    """
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new(type="ShaderNodeOutputMaterial")
    out.location = (600, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (250, 0)
    set_bsdf_input(bsdf, ["Base Color"], PALETTE_LINEAR["obsidian_void"])
    set_bsdf_input(bsdf, ["Metallic"], 0.65)
    set_bsdf_input(bsdf, ["Specular IOR Level", "Specular"], 0.85)
    set_bsdf_input(bsdf, ["Coat Weight", "Clearcoat"], 0.35)
    set_bsdf_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.08)

    # Subtle micro-grain roughness variation using high-frequency Noise Texture
    tex_coord = nodes.new(type="ShaderNodeTexCoord")
    tex_coord.location = (-550, -120)

    noise = nodes.new(type="ShaderNodeTexNoise")
    noise.location = (-320, -120)
    noise.inputs["Scale"].default_value = 140.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.6

    ramp = nodes.new(type="ShaderNodeValToRGB")
    ramp.location = (-80, -120)
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.06, 0.06, 0.06, 1.0)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.16, 0.16, 0.16, 1.0)

    links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    return mat


def mat_frosted_glass(
    name: str = "mat_frosted_glass",
    tint: RGBA | None = None,
    roughness: float = 0.12,
    ior: float = 1.45,
) -> Any:
    """
    Frosted dark glass (#121215, roughness 0.12, IOR 1.45) used for the 4 Strata
    architecture plates and floating 3D OS window substrates.
    """
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    if hasattr(mat, "use_raytrace_refraction"):
        mat.use_raytrace_refraction = True

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new(type="ShaderNodeOutputMaterial")
    out.location = (450, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (120, 0)

    base_color = tint if tint is not None else PALETTE_LINEAR["frosted_glass"]
    set_bsdf_input(bsdf, ["Base Color"], base_color)
    set_bsdf_input(bsdf, ["Metallic"], 0.08)
    set_bsdf_input(bsdf, ["Roughness"], roughness)
    set_bsdf_input(bsdf, ["IOR"], ior)
    set_bsdf_input(bsdf, ["Transmission Weight", "Transmission"], 0.78)
    set_bsdf_input(bsdf, ["Specular IOR Level", "Specular"], 0.9)
    set_bsdf_input(bsdf, ["Coat Weight", "Clearcoat"], 0.45)
    set_bsdf_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.05)
    set_bsdf_input(bsdf, ["Alpha"], 0.92)

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def mat_titanium_bevel(name: str = "mat_titanium_bevel") -> Any:
    """
    Brushed anodized dark titanium (#18181b) for beveled window chassis edges
    and the Act 1 monolith slab.
    """
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new(type="ShaderNodeOutputMaterial")
    out.location = (550, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (220, 0)
    set_bsdf_input(bsdf, ["Base Color"], PALETTE_LINEAR["anodized_titanium"])
    set_bsdf_input(bsdf, ["Metallic"], 0.94)
    set_bsdf_input(bsdf, ["Roughness"], 0.22)
    set_bsdf_input(bsdf, ["Anisotropic"], 0.72)
    set_bsdf_input(bsdf, ["Specular IOR Level", "Specular"], 0.85)
    set_bsdf_input(bsdf, ["Coat Weight", "Clearcoat"], 0.2)

    # Subtle hairline brushed metal anisotropy
    tex_coord = nodes.new(type="ShaderNodeTexCoord")
    tex_coord.location = (-580, -140)

    mapping = nodes.new(type="ShaderNodeMapping")
    mapping.location = (-380, -140)
    mapping.inputs["Scale"].default_value = (1.0, 95.0, 1.0)

    noise = nodes.new(type="ShaderNodeTexNoise")
    noise.location = (-180, -140)
    noise.inputs["Scale"].default_value = 30.0
    noise.inputs["Detail"].default_value = 10.0

    bump = nodes.new(type="ShaderNodeBump")
    bump.location = (20, -180)
    bump.inputs["Strength"].default_value = 0.035

    links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    return mat


def mat_emissive_text(
    name: str = "mat_emissive_text",
    color: RGBA | None = None,
    strength: float = 4.5,
) -> Any:
    """
    Crisp emissive typography / indicator shader with keyframeable Emission Strength.
    """
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new(type="ShaderNodeOutputMaterial")
    out.location = (420, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    emit_color = color if color is not None else PALETTE_LINEAR["crisp_white"]

    set_bsdf_input(bsdf, ["Base Color"], emit_color)
    set_bsdf_input(bsdf, ["Roughness"], 0.15)
    set_bsdf_input(bsdf, ["Emission Color", "Emission"], emit_color)
    set_bsdf_input(bsdf, ["Emission Strength"], strength)

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def mat_wireframe_holo(
    name: str = "mat_wireframe_holo",
    color: RGBA | None = None,
    strength: float = 6.5,
) -> Any:
    """
    Restrained ice-blue (#38bdf8) holographic wireframe / data-bus shader with
    Fresnel edge emphasis for WASM blocks and Comlink ribbons.
    """
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new(type="ShaderNodeOutputMaterial")
    out.location = (520, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (200, 0)
    holo_color = color if color is not None else PALETTE_LINEAR["ice_blue"]

    set_bsdf_input(bsdf, ["Base Color"], holo_color)
    set_bsdf_input(bsdf, ["Metallic"], 0.2)
    set_bsdf_input(bsdf, ["Roughness"], 0.1)
    set_bsdf_input(bsdf, ["Transmission Weight", "Transmission"], 0.6)
    set_bsdf_input(bsdf, ["Emission Color", "Emission"], holo_color)
    set_bsdf_input(bsdf, ["Emission Strength"], strength)
    set_bsdf_input(bsdf, ["Alpha"], 0.88)

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def mat_oscilloscope_beam(
    name: str = "mat_oscilloscope_beam",
    strength: float = 11.0,
) -> Any:
    """
    High-intensity emerald (#10b981) phosphor beam shader for the Act 5 ByteScope
    3D X-Y Lissajous curve and WebGPU flow-field particles.
    """
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new(type="ShaderNodeOutputMaterial")
    out.location = (450, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (120, 0)
    emerald = PALETTE_LINEAR["emerald_signal"]

    set_bsdf_input(bsdf, ["Base Color"], emerald)
    set_bsdf_input(bsdf, ["Roughness"], 0.05)
    set_bsdf_input(bsdf, ["Emission Color", "Emission"], emerald)
    set_bsdf_input(bsdf, ["Emission Strength"], strength)

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def create_ui_screen_material(
    name: str,
    texture_path: Path,
    emission_strength: float = 1.65,
) -> Any:
    """
    Maps a high-DPI 2048x1280 Pillow-rendered OS window texture onto a glassy,
    self-illuminated display surface with crisp specular coat.
    """
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new(type="ShaderNodeOutputMaterial")
    out.location = (550, 0)

    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (220, 0)
    set_bsdf_input(bsdf, ["Metallic"], 0.05)
    set_bsdf_input(bsdf, ["Roughness"], 0.09)
    set_bsdf_input(bsdf, ["Specular IOR Level", "Specular"], 0.75)
    set_bsdf_input(bsdf, ["Coat Weight", "Clearcoat"], 0.5)
    set_bsdf_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.04)
    set_bsdf_input(bsdf, ["Emission Strength"], emission_strength)

    tex_node = nodes.new(type="ShaderNodeTexImage")
    tex_node.location = (-180, 0)
    tex_node.interpolation = "Cubic"
    tex_node.extension = "CLIP"

    if texture_path.exists():
        img = bpy.data.images.load(str(texture_path), check_existing=True)
        tex_node.image = img

    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    if "Emission Color" in bsdf.inputs:
        links.new(tex_node.outputs["Color"], bsdf.inputs["Emission Color"])
    elif "Emission" in bsdf.inputs:
        links.new(tex_node.outputs["Color"], bsdf.inputs["Emission"])

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def register_core_materials() -> dict[str, Any]:
    """Pre-register all core shaders so scenes can reference them immediately."""
    return {
        "obsidian_floor": mat_obsidian_floor(),
        "frosted_glass": mat_frosted_glass(),
        "titanium_bevel": mat_titanium_bevel(),
        "emissive_text": mat_emissive_text(),
        "emissive_cyan": mat_emissive_text("mat_emissive_cyan", PALETTE_LINEAR["ice_blue"], 5.5),
        "emissive_emerald": mat_emissive_text("mat_emissive_emerald", PALETTE_LINEAR["emerald_signal"], 5.5),
        "wireframe_holo": mat_wireframe_holo(),
        "oscilloscope_beam": mat_oscilloscope_beam(),
    }
