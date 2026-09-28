"""
Build a breathe + blink idle scene for a flat avatar PNG, the same setup as
golden_retriever_breathe.blend. Used for every dog avatar except the golden retriever:
german_shepherd, german_shepherd_sable, poodle, service_dog, bulldog, wolf.

Run from the command line (it creates/overwrites the .blend next to this script):
    blender -b --python build_breed_idle.py -- german_shepherd
    blender -b --python build_breed_idle.py -- german_shepherd_sable
    (same for poodle, service_dog, bulldog, wolf)
or in Blender's Scripting tab with BREED set below. It needs only bpy and numpy.

What it builds:
  - plane mesh "<breed>": an even ~8.5px grid over the avatar texture (faces kept only where
    the art is), 1 unit = texture height, standing upright facing the camera like the golden
  - shape keys:
      Breathe   - ribcage swell (back up a little, belly down, chest forward). Head, legs,
                  paws, hips and tail are pinned so they never move.
      Blink     - squashes the eye shut
      BlinkUndo - driven; cancels the squash while the closed-eye line texture shows
  - material: avatar texture, swapped for //textures/<breed>_blink.png (eye painted out, the
    closed-eye line drawn in) while Blink >= 0.7. It is switched by an Attribute node reading
    the object property "blink_swap" (a driven Value node made EEVEE recompile and flash grey).
  - timing: 72-frame (3s) loop at 24fps. Breathe 1 -> 37 -> 73(=1). Blink 50 -> 53 -> 56,
    so the line shows on frames 52-54.
  - straight-on orthographic camera, transparent film.
"""
import sys
import math
import bpy
import numpy as np

BREED = "german_shepherd"
if "--" in sys.argv:
    BREED = sys.argv[sys.argv.index("--") + 1]

# Per-dog settings, texture px (x right, y DOWN). All these avatars are 1254x1254.
# eye = (cx, cy, rx, ry) of the blink squash; rib = ribcage ellipse the breath swells; pins keep
# the head, ears, tail and hips still; legs pin each leg column below its leg top.
SHEPHERD_BODY = dict(
    BACK=8.0, BELLY=20.0, CHEST=16.0,
    rib=(620, 700, 330, 190), chest=(240, 660, 120, 150), chest_gate=(470, 540),
    pins=[("corner", 430, 520, 430, 500), ("right", 900, 1000)],
    legs=dict(front=(170, 200, 520, 550, 800, 870), hind=(680, 710, 780, 850), gap=(880, 930)),
)
DOGS = {
    "german_shepherd": dict(SHEPHERD_BODY, eye=(250.0, 314.0, 56.0, 48.0)),
    "german_shepherd_sable": dict(SHEPHERD_BODY, eye=(242.0, 312.0, 56.0, 49.0)),
    "poodle": dict(
        BACK=8.0, BELLY=20.0, CHEST=16.0,
        rib=(760, 720, 300, 170), chest=(270, 730, 90, 130), chest_gate=(600, 660),
        pins=[("ellipse", 330, 280, 300, 280),    # head + top-knot
              ("ellipse", 500, 510, 170, 220),    # big hanging ear
              ("ellipse", 1060, 490, 190, 190),   # tail pom-pom
              ("right", 1030, 1100)],             # hips
        legs=dict(front=(230, 260, 620, 650, 860, 920), hind=(700, 730, 800, 860), gap=(880, 920)),
        eye=(277.0, 386.0, 52.0, 54.0), line_w=88,
    ),
    "service_dog": dict(
        BACK=8.0, BELLY=20.0, CHEST=16.0,
        rib=(620, 690, 330, 185), chest=(230, 640, 100, 140), chest_gate=(450, 520),
        pins=[("ellipse", 290, 220, 290, 250),    # head + ear
              ("ellipse", 1110, 520, 160, 270),   # raised tail
              ("right", 960, 1030)],              # hips
        legs=dict(front=(190, 220, 500, 530, 820, 880), hind=(700, 730, 780, 840), gap=(860, 900)),
        eye=(253.0, 245.0, 54.0, 52.0), line_w=92,
    ),
    "bulldog": dict(
        BACK=8.0, BELLY=20.0, CHEST=16.0,
        rib=(720, 690, 380, 210), chest=(320, 710, 110, 140), chest_gate=(560, 620),
        pins=[("ellipse", 330, 360, 310, 270),    # head + jowls
              ("ellipse", 1110, 520, 90, 90),     # tail nub
              ("right", 1090, 1160)],             # hips
        legs=dict(front=(220, 250, 660, 690, 850, 910), hind=(840, 870, 860, 920), gap=(900, 940)),
        eye=(292.0, 325.0, 57.0, 56.0), line_w=99,
    ),
    "wolf": dict(
        BACK=8.0, BELLY=20.0, CHEST=16.0,
        rib=(640, 670, 320, 175), chest=(260, 650, 110, 140), chest_gate=(520, 580),
        pins=[("corner", 480, 580, 470, 560),     # head + neck ruff
              ("right", 920, 1000)],              # hips + tail
        legs=dict(front=(200, 230, 540, 570, 760, 830), hind=(700, 730, 750, 820), gap=(820, 870)),
        eye=(236.0, 298.0, 63.0, 44.0), line_w=112,
    ),
}

cfg = dict(DOGS[BREED], tex_size=(1254, 1254))

LOOP_FRAMES = 72
BLINK_PEAK = 53
BLINK_HALF = 3
SWAP_AT = 0.7
GRID_STEP = 8.5  # px

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3 - 2 * t)
def _breathe_field(x, y, c):
    cx, cy, rx, ry = c["rib"]
    r = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    w = 1 - ss(0.75, 1.35, r)
    t = (y - cy) / ry
    expand = np.where(t < 0, -c["BACK"] * np.clip(-t, 0, 1), c["BELLY"] * np.clip(t, 0, 1)) * w
    gx, gy, sx, sy = c["chest"]; g0, g1 = c["chest_gate"]
    chest = -c["CHEST"] * np.exp(-(((x - gx) / sx) ** 2 + ((y - gy) / sy) ** 2)) * ss(g0, g1, y)
    free = np.ones_like(x, dtype=float)
    for p in c["pins"]:
        if p[0] == "corner":
            _, x0, x1, y0, y1 = p; pin = (1 - ss(x0, x1, x)) * (1 - ss(y0, y1, y))
        elif p[0] == "ellipse":
            _, px, py, prx, pry = p; pr = np.sqrt(((x - px) / prx) ** 2 + ((y - py) / pry) ** 2); pin = 1 - ss(1.0, 1.3, pr)
        elif p[0] == "right":
            _, x0, x1 = p; pin = ss(x0, x1, x)
        free = free * (1 - pin)
    L = c["legs"]
    fa, fb, fc_, fd, fy0, fy1 = L["front"]; ha, hb, hy0, hy1 = L["hind"]; gy0, gy1 = L["gap"]
    front = ss(fa, fb, x) * (1 - ss(fc_, fd, x)); hind = ss(ha, hb, x)
    gap = 1 - np.maximum(front, hind)
    pin_leg = np.clip(front * ss(fy0, fy1, y) + hind * ss(hy0, hy1, y) + gap * ss(gy0, gy1, y), 0, 1)
    free = free * (1 - pin_leg)
    return chest * free, expand * free
def _blink_field(x, y, c):
    cx, cy, rx, ry = c["eye"]
    r = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    w = 1 - ss(0.8, 1.4, r)
    return np.zeros_like(x, dtype=float), -(y - cy) * 0.95 * w


def breathe_field(x, y):
    return _breathe_field(x, y, cfg)


def blink_field(x, y):
    return _blink_field(x, y, cfg)


# ---- fresh file, saved first so '//' relative paths resolve ------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
here = bpy.path.abspath("//") if bpy.data.filepath else None
import os
script_dir = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else os.getcwd()
blend_path = os.path.join(script_dir, f"{BREED}_breathe.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

TW, TH = cfg["tex_size"]
PPU = TH  # px per unit

# ---- mesh -------------------------------------------------------------------------------
tex = bpy.data.images.load(f"//../assets/avatars/{BREED}.png")
tex.filepath = f"//../assets/avatars/{BREED}.png"
px_alpha = np.array(tex.pixels[:], dtype=np.float32).reshape(TH, TW, 4)[::-1, :, 3]  # y down
nx = int(round(TW / GRID_STEP))
ny = int(round(TH / GRID_STEP))
xs = np.linspace(0, TW, nx + 1)
ys = np.linspace(0, TH, ny + 1)
# keep a cell if there is art within ~2 cells of it
occ = np.zeros((ny, nx), bool)
for j in range(ny):
    y0, y1 = int(ys[j]), int(min(TH, math.ceil(ys[j + 1])))
    for i in range(nx):
        x0, x1 = int(xs[i]), int(min(TW, math.ceil(xs[i + 1])))
        occ[j, i] = px_alpha[y0:y1, x0:x1].max() > 0.01
pad = np.zeros_like(occ)
for dj in range(-2, 3):
    for di in range(-2, 3):
        pad |= np.roll(np.roll(occ, dj, 0), di, 1)
vid = -np.ones((ny + 1, nx + 1), int)
verts, uvs_v = [], []
faces = []
for j in range(ny):
    for i in range(nx):
        if not pad[j, i]:
            continue
        quad = []
        for (jj, ii) in ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1)):
            if vid[jj, ii] < 0:
                vid[jj, ii] = len(verts)
                px, py = xs[ii], ys[jj]
                verts.append(((px - TW / 2) / PPU, (TH / 2 - py) / PPU, 0.0))
                uvs_v.append((px / TW, 1 - py / TH))
            quad.append(vid[jj, ii])
        faces.append(quad)
me = bpy.data.meshes.new(BREED)
me.from_pydata(verts, [], faces)
uvl = me.uv_layers.new(name="UVMap")
for loop in me.loops:
    uvl.data[loop.index].uv = uvs_v[loop.vertex_index]
me.update()
obj = bpy.data.objects.new(BREED, me)
bpy.context.scene.collection.objects.link(obj)
obj.rotation_euler = (math.pi / 2, 0, 0)  # stand up in the XZ plane, facing -Y (the camera)

# ---- shape keys -------------------------------------------------------------------------
co = np.array(verts)
px = co[:, 0] * PPU + TW / 2
py = TH / 2 - co[:, 1] * PPU
basis = obj.shape_key_add(name="Basis", from_mix=False)


def add_key(name, dxdy):
    dx, dy = dxdy
    kb = obj.shape_key_add(name=name, from_mix=False)
    kb.relative_key = basis
    new = co.copy()
    new[:, 0] += dx / PPU
    new[:, 1] -= dy / PPU
    kb.data.foreach_set("co", new.ravel())
    return kb, dx, dy


breathe, bdx, bdy = add_key("Breathe", breathe_field(px, py))
blink, kdx, kdy = add_key("Blink", blink_field(px, py))
undo, _, _ = add_key("BlinkUndo", (-kdx, -kdy))
keys = me.shape_keys

# ---- material ---------------------------------------------------------------------------
blink_img = bpy.data.images.load(f"//textures/{BREED}_blink.png")
blink_img.filepath = f"//textures/{BREED}_blink.png"
mat = bpy.data.materials.new(BREED)
mat.use_nodes = True
for attr, val in (("surface_render_method", "DITHERED"), ("blend_method", "HASHED")):
    try:
        setattr(mat, attr, val)
    except Exception:
        pass
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
t_open = nt.nodes.new("ShaderNodeTexImage"); t_open.image = tex; t_open.location = (-700, 300)
t_blink = nt.nodes.new("ShaderNodeTexImage"); t_blink.image = blink_img; t_blink.location = (-700, -50)
t_blink.name = t_blink.label = "Blink Texture"
swap = nt.nodes.new("ShaderNodeAttribute"); swap.name = swap.label = "Blink Swap"
swap.attribute_type = "OBJECT"; swap.attribute_name = "blink_swap"; swap.location = (-700, 550)
mix_c = nt.nodes.new("ShaderNodeMix"); mix_c.data_type = "RGBA"; mix_c.name = mix_c.label = "Blink Mix Color"
mix_a = nt.nodes.new("ShaderNodeMix"); mix_a.data_type = "FLOAT"; mix_a.name = mix_a.label = "Blink Mix Alpha"
mix_c.location = (-350, 250); mix_a.location = (-350, 0)
L = nt.links
L.new(swap.outputs["Fac"], mix_c.inputs[0]); L.new(swap.outputs["Fac"], mix_a.inputs[0])
L.new(t_open.outputs["Color"], mix_c.inputs[6]); L.new(t_blink.outputs["Color"], mix_c.inputs[7])
L.new(t_open.outputs["Alpha"], mix_a.inputs[2]); L.new(t_blink.outputs["Alpha"], mix_a.inputs[3])
L.new(mix_c.outputs[2], bsdf.inputs["Base Color"]); L.new(mix_a.outputs[0], bsdf.inputs["Alpha"])
bsdf.inputs["Roughness"].default_value = 1.0
me.materials.append(mat)


# ---- drivers ----------------------------------------------------------------------------
def blink_driver(target, prop, expr):
    fc = target.driver_add(prop)
    d = fc.driver
    d.type = "SCRIPTED"
    v = d.variables.new(); v.name = "b"; v.type = "SINGLE_PROP"
    v.targets[0].id_type = "KEY"; v.targets[0].id = keys
    v.targets[0].data_path = 'key_blocks["Blink"].value'
    d.expression = expr


obj["blink_swap"] = 0.0
blink_driver(obj, '["blink_swap"]', f"(b >= {SWAP_AT}) * 1.0")
blink_driver(undo, "value", f"(b >= {SWAP_AT}) * b")


# ---- keyframes ----------------------------------------------------------------------------
def key(kb, pts):
    for f, v in pts:
        kb.value = v
        kb.keyframe_insert("value", frame=f)


key(breathe, [(1, 0.0), (1 + LOOP_FRAMES // 2, 1.0), (LOOP_FRAMES + 1, 0.0)])
key(blink, [(BLINK_PEAK - BLINK_HALF, 0.0), (BLINK_PEAK, 1.0), (BLINK_PEAK + BLINK_HALF, 0.0)])
act = keys.animation_data.action
fcs = [fc for l in act.layers for st in l.strips for cb in st.channelbags for fc in cb.fcurves] \
    if hasattr(act, "layers") and len(act.layers) else list(act.fcurves)
for fc in fcs:
    for kp in fc.keyframe_points:
        kp.interpolation = "BEZIER"
        kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
    fc.update()

# ---- camera, light, scene ---------------------------------------------------------------
scene = bpy.context.scene
cam_data = bpy.data.cameras.new("Camera"); cam_data.type = "ORTHO"; cam_data.ortho_scale = TW / PPU
cam = bpy.data.objects.new("Camera", cam_data); scene.collection.objects.link(cam)
cam.location = (0, -3, 0); cam.rotation_euler = (math.pi / 2, 0, 0); scene.camera = cam
sun_data = bpy.data.lights.new("Light", "SUN"); sun_data.energy = 3.0
sun = bpy.data.objects.new("Light", sun_data); scene.collection.objects.link(sun)
sun.location = (0, -2, 2); sun.rotation_euler = (math.radians(60), 0, 0)
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        scene.render.engine = eng
        break
    except Exception:
        pass
scene.render.resolution_x = scene.render.resolution_y = 1000
scene.render.film_transparent = True
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, LOOP_FRAMES
scene.frame_set(1)

bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print(f"built {blend_path}: {len(verts)} verts, breathe max {np.hypot(bdx, bdy).max():.1f}px, "
      f"blink max {np.hypot(kdx, kdy).max():.1f}px")
