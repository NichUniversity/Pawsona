"""Build blender/golden_retriever_happy.blend: the open-mouth golden retriever
panting happily and wiggling like he just got pets.

Rig: textured plane (grid, 8px) + armature with smooth vertex-group weights from
happy_weights.py. Bones: root (paws pinned) > body > chest / head > ear / jaw > tongue,
and body > tail > tail_tip. Every motion is a keyed sine with a Cycles modifier and a
period that divides 72, so the 3s / 24fps loop is seamless.

Run:  blender -b -P build_happy_golden.py            (or python3 with the bpy module)
Re-run safely: it rebuilds the file from scratch. Tweak MOTION in happy_weights.py.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import happy_weights as hw  # noqa: E402

OUT = os.path.join(HERE, "golden_retriever_happy.blend")
TEX_REL = "//textures/golden_retriever_happy.png"
GRID = 8  # px between vertices


def px2w(px, py):
    """Texture px (y down) -> world XZ (height 1, centred)."""
    return (px - hw.W_PX / 2) / hw.H_PX, (hw.H_PX / 2 - py) / hw.H_PX


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)  # so // paths resolve
scene = bpy.context.scene

# ---------------------------------------------------------------- mesh
xs = np.arange(0, hw.W_PX + 1, GRID, dtype=float)
xs[-1] = hw.W_PX
ys = np.arange(0, hw.H_PX + 1, GRID, dtype=float)
ys[-1] = hw.H_PX
nx, ny = len(xs), len(ys)
gx, gy = np.meshgrid(xs, ys)
px, py = gx.ravel(), gy.ravel()
wx, wz = px2w(px, py)
verts = [(float(a), 0.0, float(b)) for a, b in zip(wx, wz)]
faces = []
for j in range(ny - 1):
    for i in range(nx - 1):
        v0 = j * nx + i
        faces.append((v0, v0 + nx, v0 + nx + 1, v0 + 1))  # normal faces -Y (camera)
mesh = bpy.data.meshes.new("golden_happy")
mesh.from_pydata(verts, [], faces)
uv = mesh.uv_layers.new(name="UVMap")
u = px / hw.W_PX
v = 1 - py / hw.H_PX
for poly in mesh.polygons:
    for li in poly.loop_indices:
        vi = mesh.loops[li].vertex_index
        uv.data[li].uv = (u[vi], v[vi])
mesh.update()
dog = bpy.data.objects.new("golden_happy", mesh)
scene.collection.objects.link(dog)

# ---------------------------------------------------------------- material (unlit)
img = bpy.data.images.load(TEX_REL)
mat = bpy.data.materials.new("Golden Happy")
mat.use_nodes = True
mat.surface_render_method = "BLENDED"
nt = mat.node_tree
nt.nodes.clear()
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.location = (-600, 0)
tex.extension = "CLIP"
emit = nt.nodes.new("ShaderNodeEmission"); emit.location = (-300, 100)
transp = nt.nodes.new("ShaderNodeBsdfTransparent"); transp.location = (-300, -100)
mix = nt.nodes.new("ShaderNodeMixShader"); mix.location = (-50, 0)
outn = nt.nodes.new("ShaderNodeOutputMaterial"); outn.location = (200, 0)
nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
nt.links.new(transp.outputs[0], mix.inputs[1])
nt.links.new(emit.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], outn.inputs["Surface"])
mesh.materials.append(mat)

# ---------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new("golden_happy_rig")
arm = bpy.data.objects.new("golden_happy_rig", arm_data)
scene.collection.objects.link(arm)
arm.show_in_front = True
arm_data.display_type = "STICK"
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for name, (bx, by) in hw.PIVOTS.items():
    eb = arm_data.edit_bones.new(name)
    x, z = px2w(bx, by)
    eb.head = (x, 0, z)
    eb.tail = (x, 0, z + 0.04)  # every bone points up: local Z = world -Y
    eb.roll = 0
for name, parent in hw.PARENTS.items():
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")

# sanity: local Z must be world -Y so +rot = screen counter-clockwise
for b in arm_data.bones:
    zax = b.matrix_local.to_3x3().col[2]
    assert (zax - Vector((0, -1, 0))).length < 1e-5, (b.name, zax)

# ---------------------------------------------------------------- weights
W = hw.weights(px, py)
for name, w in W.items():
    vg = dog.vertex_groups.new(name=name)
    for i in np.nonzero(w > 1e-4)[0]:
        vg.add([int(i)], float(w[i]), "REPLACE")
dog.parent = arm
mod = dog.modifiers.new("Armature", "ARMATURE")
mod.object = arm

# ---------------------------------------------------------------- animation
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = hw.LOOP
for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"

keyed = set()
for bone, chan, amp, period, phase, *centre in hw.MOTION:
    c = centre[0] if centre else 0.0
    assert hw.LOOP % period == 0, (bone, period)
    pb = arm.pose.bones[bone]
    f0 = 1 + phase
    for k, f in enumerate((f0, f0 + period / 2, f0 + period)):
        s = 1 if k % 2 == 0 else -1
        if chan == "rot":
            pb.rotation_euler = (0, 0, math.radians(c + amp * s))
            pb.keyframe_insert("rotation_euler", index=2, frame=f)
        elif chan == "bob":
            pb.location = (0, (c + amp * s) / hw.H_PX, 0)
            pb.keyframe_insert("location", index=1, frame=f)
        elif chan == "scale":
            sc = 1 + c + amp * s
            pb.scale = (sc, sc, sc)
            pb.keyframe_insert("scale", frame=f)
    keyed.add(bone)

from bpy_extras import anim_utils  # noqa: E402
ad = arm.animation_data
ad.action.name = "golden_happy_pant_wiggle"
cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
for fc in cb.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "BEZIER"
        kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
    fc.modifiers.new("CYCLES")
    fc.update()
for pb in arm.pose.bones:  # reset rest values (keys drive the animated channels)
    pb.location = (0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
    pb.scale = (1, 1, 1)

# ---------------------------------------------------------------- camera / render
cam_data = bpy.data.cameras.new("Camera")
cam_data.type = "ORTHO"
cam_data.ortho_scale = (hw.W_PX / hw.H_PX) * 1.06
cam = bpy.data.objects.new("Camera", cam_data)
cam.location = (0, -3, 0)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.collection.objects.link(cam)
scene.camera = cam
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.render.film_transparent = True
scene.render.resolution_x = 1448
scene.render.resolution_y = 1086
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.frame_set(1)

bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("saved", OUT, "verts", len(verts), "bones", len(arm_data.bones), "fcurves", len(cb.fcurves))
