"""
Wire the hand-drawn closed-eye line into the golden retriever Blink.

Run once in Blender: Scripting tab -> Open this file -> Run Script, then Ctrl+S.
Safe to re-run: it removes what it made last time before rebuilding.

What it does
------------
1. Loads //textures/golden_retriever_blink.png: the avatar texture with the eye painted out
   and the closed-eye line drawn in.
2. Material: adds a second Image Texture plus two Mix nodes (color and alpha), switched by the
   object property "blink_swap" (an Attribute node, so EEVEE never recompiles), so the
   material switches to the closed-eye texture while the dog is fully blinking.
3. Adds a "BlinkUndo" shape key that cancels the Blink squash while the line is showing,
   so the line keeps its drawn shape instead of being flattened.
Both are driven off the existing Blink shape key value, so your Blink keyframes
(30 -> 33 -> 36) still control the timing. The line shows while Blink >= SWAP_AT
(frames 32-34 with the current keys). Frames 31 and 35 keep the squash as the closing
and opening motion.
"""
import bpy

OBJ_NAME = "golden_retriever"
BLINK_KEY = "Blink"
UNDO_KEY = "BlinkUndo"
BLINK_IMAGE_PATH = "//textures/golden_retriever_blink.png"
SWAP_AT = 0.7  # Blink value at which the closed-eye line takes over

obj = bpy.data.objects[OBJ_NAME]
mesh = obj.data
keys = mesh.shape_keys
blink = keys.key_blocks[BLINK_KEY]


def add_blink_driver(target_struct, prop, expression):
    """Driver reading the Blink shape key value as variable `b`."""
    target_struct.driver_remove(prop)
    fc = target_struct.driver_add(prop)
    drv = fc.driver
    drv.type = "SCRIPTED"
    var = drv.variables.new()
    var.name = "b"
    var.type = "SINGLE_PROP"
    var.targets[0].id_type = "KEY"
    var.targets[0].id = keys
    var.targets[0].data_path = f'key_blocks["{BLINK_KEY}"].value'
    drv.expression = expression
    # Simple expressions run without "Auto Run Python Scripts" being enabled.
    if not drv.is_simple_expression:
        print("WARNING: driver is not a simple expression; enable Auto Run Python Scripts")
    return fc


# ---- 1. Closed-eye texture ------------------------------------------------------------
img = bpy.data.images.get("golden_retriever_blink.png")
if img is None:
    img = bpy.data.images.load(BLINK_IMAGE_PATH, check_existing=True)
img.filepath = BLINK_IMAGE_PATH
img.reload()

# ---- 2. Material swap -----------------------------------------------------------------
mat = obj.active_material
nt = mat.node_tree
for name in ("Blink Texture", "Blink Mix Color", "Blink Mix Alpha", "Blink Swap"):
    n = nt.nodes.get(name)
    if n:
        nt.nodes.remove(n)

open_tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and "blink" not in n.image.name)
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")

blink_tex = nt.nodes.new("ShaderNodeTexImage")
blink_tex.name = blink_tex.label = "Blink Texture"
blink_tex.image = img
blink_tex.interpolation = open_tex.interpolation
blink_tex.extension = open_tex.extension
blink_tex.location = (open_tex.location.x, open_tex.location.y - 320)

# The swap factor is read from an object custom property through an Attribute node. It is NOT
# a driven Value node: EEVEE bakes Value-node numbers into the compiled shader, so every time a
# driven value jumped (0 -> 1 at the blink) EEVEE recompiled the material and briefly showed its
# grey placeholder over the whole plane. Object attributes are passed in as live uniforms, so
# changing them never triggers a recompile.
if nt.animation_data:  # clear the old Value-node driver from the first version of this script
    for fc in list(nt.animation_data.drivers):
        if 'nodes["Blink Swap"]' in fc.data_path:
            nt.animation_data.drivers.remove(fc)
obj["blink_swap"] = 0.0
swap = nt.nodes.new("ShaderNodeAttribute")
swap.name = swap.label = "Blink Swap"
swap.attribute_type = "OBJECT"
swap.attribute_name = "blink_swap"
swap.location = (open_tex.location.x, open_tex.location.y + 200)

mix_c = nt.nodes.new("ShaderNodeMix")
mix_c.name = mix_c.label = "Blink Mix Color"
mix_c.data_type = "RGBA"
mix_c.location = (open_tex.location.x + 320, open_tex.location.y + 60)

mix_a = nt.nodes.new("ShaderNodeMix")
mix_a.name = mix_a.label = "Blink Mix Alpha"
mix_a.data_type = "FLOAT"
mix_a.location = (open_tex.location.x + 320, open_tex.location.y - 200)

L = nt.links
# ShaderNodeMix sockets: Factor(0), A/B float (2,3), A/B color (6,7); outputs float (0), color (2)
L.new(swap.outputs["Fac"], mix_c.inputs[0])
L.new(swap.outputs["Fac"], mix_a.inputs[0])
L.new(open_tex.outputs["Color"], mix_c.inputs[6])
L.new(blink_tex.outputs["Color"], mix_c.inputs[7])
L.new(open_tex.outputs["Alpha"], mix_a.inputs[2])
L.new(blink_tex.outputs["Alpha"], mix_a.inputs[3])
L.new(mix_c.outputs[2], bsdf.inputs["Base Color"])
L.new(mix_a.outputs[0], bsdf.inputs["Alpha"])

add_blink_driver(obj, '["blink_swap"]', f"(b >= {SWAP_AT}) * 1.0")

# ---- 3. BlinkUndo shape key (cancels the squash while the line shows) -----------------
old = keys.key_blocks.get(UNDO_KEY)
if old:
    obj.shape_key_remove(old)
basis = keys.reference_key
undo = obj.shape_key_add(name=UNDO_KEY, from_mix=False)
undo.relative_key = basis
for i in range(len(mesh.vertices)):
    undo.data[i].co = 2 * basis.data[i].co - blink.data[i].co  # basis - (blink - basis)
add_blink_driver(undo, "value", f"(b >= {SWAP_AT}) * b")

print("Blink line wired in. Scrub to frame 33 to check, then save (Ctrl+S).")
