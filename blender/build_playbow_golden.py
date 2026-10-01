"""Build blender/golden_retriever_playbow.blend: the golden goes from the ORIGINAL
STANDING drawing down into a play bow by actually bending (no fades), as if waiting
for the user to throw the ball, then holds the bow (the user's own bow drawing) with
a calm tail wag, a little wiggle and panting.

Frames 1-34  the standing drawing (textures/golden_retriever_happy.png) on a bend rig
             (happy_weights.bend_weights): hips, body, head, tail and, per front leg,
             upper arm / forearm / paw bones joined at shoulder, elbow and wrist.
             The bones bend it toward the bow; a corrective shape key ("bow_fit")
             makes frame 34 land exactly on the bow drawing's shape.
Frames 24-34  (CUT_AT) the bow drawing (textures/golden_retriever_bow.png) takes over
             with a hard cut (no fade), bent to exactly the standing dog's shape at
             that frame, and unbends into its drawn pose: frame 34 == frame 35.
Frame 35     the bow drawing (textures/golden_retriever_bow.png) at rest,
             placed where the bent standing dog ended.
Frames 35-106  seamless 72-frame hold loop on the bow drawing (frame 107 == frame 35).
Play 1-34 once, then loop 35-106.

How the end pose is found (no hand-keyed angles):
  1. bow_landmarks.PAIRS: ~40 matching points standing -> bow (+ BOW_OFFSET).
  2. A thin-plate-spline warp T through those points says where every pixel of the
     standing drawing should end up.
  3. Each bone's end rotation is a least-squares fit of its pixels to T (tail and
     ear/jaw stay attached; hips/body/head may also translate).  The front legs are
     posed like real joints instead: upper arm aims at the bow drawing's elbow,
     forearm at its wrist (bow_landmarks.BOW_JOINTS), paw kept flat every frame.
  4. Whatever the rigid bones can't match goes into the "bow_fit" shape key:
     delta = M^-1 (T(v) - A(v)), M = blended bone rotation, so armature + shape key
     reproduce T exactly at full strength.

HOW TO TWEAK (Windows)
  1. Close golden_retriever_playbow.blend in Blender (this script rewrites it).
  2. Change a setting below in a text editor (VS Code), save.
  3. Double-click rebuild_playbow.bat in this folder (or in PowerShell, in this folder:
     & "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P build_playbow_golden.py ).
     It takes a few seconds and prints the leg/paw numbers.  Re-open the .blend.

  Settings, most useful first (all in this file):
    TIMING      when each body part moves: (start frame, end frame).  Bigger gap = slower.
    FOLD        extra elbow bend in the MIDDLE of the move (deg, frame window).
                More negative "_fore" = forearms tuck back more before reaching forward.
    PAW_RIGID   1 = paws keep their drawn shape (only turn/grow/slide). 0 = paws warp freely.
    PAW_MAX_GROW  how much a paw may grow evenly toward the bow drawing's bigger paws.
    LEG_SLIM    front-leg thickness during the move (1 = standing drawing, 0.6 = bow).
    PAW_HEIGHT  paw height during the move (1 = standing drawing).
    SLIM_KEY    frames over which the legs slim down (shape key \"leg_slim\").
    FORE_RIGID  0..1, how much the lower forearm moves with its paw instead of warping.
    FIT_KEY     frames over which the corrective shape key "bow_fit" fades in.
    CUT_AT      frame where the bow drawing takes over (its fur appears); earlier =
                the bow drawing does more of the bend.
    BW_OSC      the hold motions (wag, wiggle, panting) after frame 35.
  In other files:
    bow_landmarks.PAIRS      matching points standing -> bow (move one to fix a part
                             that lands in the wrong place at frame 34).
    bow_landmarks.BOW_JOINTS where each front elbow/wrist should end up.
    happy_weights.BEND_PIVOTS  joint positions (shoulder/elbow/wrist...) on the
                             standing drawing, in image pixels (x right, y down).

Run:  python3 build_playbow_golden.py     (bpy module)  or  blender -b -P ...
Only needs Blender's own Python (bpy + numpy).
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector


class ThinPlate:
    """Thin-plate-spline warp (numpy only, so this script also runs inside Blender).
    Same maths as scipy's RBFInterpolator(kernel="thin_plate_spline", smoothing=lam)."""

    def __init__(self, src, vals, smoothing=0.0):
        self.c = np.asarray(src, float)
        n = len(self.c)
        K = self._k(self.c, self.c) + smoothing * np.eye(n)
        P = np.hstack([np.ones((n, 1)), self.c])
        A = np.zeros((n + 3, n + 3))
        A[:n, :n], A[:n, n:], A[n:, :n] = K, P, P.T
        rhs = np.vstack([np.asarray(vals, float), np.zeros((3, 2))])
        sol = np.linalg.solve(A, rhs)
        self.w, self.a = sol[:n], sol[n:]

    @staticmethod
    def _k(a, b):
        r = np.hypot(a[:, None, 0] - b[None, :, 0], a[:, None, 1] - b[None, :, 1])
        with np.errstate(divide="ignore", invalid="ignore"):
            return np.where(r > 0, r * r * np.log(r), 0.0)

    def __call__(self, x):
        x = np.asarray(x, float)
        out = np.empty((len(x), 2))
        for i in range(0, len(x), 20000):
            xi = x[i:i + 20000]
            out[i:i + 20000] = self._k(xi, self.c) @ self.w + self.a[0] + xi @ self.a[1:]
        return out


HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import happy_weights as hw  # noqa: E402
import bow_landmarks as lm  # noqa: E402

OUT = os.path.join(HERE, "golden_retriever_playbow.blend")
GRID = 8

BOW_AT = 35                          # first hold frame (fully bowed, the bow drawing at rest)
CUT_AT = 24                          # frame where the bow drawing takes over the move (see below)
HOLD = 72
END = BOW_AT + HOLD - 1              # 106

# --------------------------------------------------------------- transition timing
# (start, end) frame of each bone's eased move into the bow.  Body leads, the legs
# bend a beat behind it, the head follows last; all finish by frame 34.
TIMING = {
    "hips": (3, 30), "body": (3, 30), "tail": (4, 30), "tail_tip": (6, 31),
    "n_upper": (8, 31), "f_upper": (8, 31),      # legs swing forward after the elbows fold
    "n_fore": (12, 33), "f_fore": (12, 33),
    "n_paw": (9, 33), "f_paw": (9, 33),          # (paws are kept flat every frame)
    "head": (12, 34), "ear": (9, 34), "jaw": (7, 33), "tongue": (7, 33),
}
FIT_KEY = (8, 34)                    # corrective shape key ramp
PAW_RIGID = 1.0                      # 1 = paws keep their drawn shape (turn + even grow only); 0 = free warp
PAW_MAX_GROW = 1.05                  # cap on how much a paw may grow evenly toward the bow drawing's paws
# Leg size (shape key "leg_slim"): the standing drawing's front legs are drawn thicker
# than the bow drawing's, so they are slimmed EARLY in the move and then stay the
# bow's size all the way down.
LEG_SLIM = 0.60                      # forearm thickness vs the standing drawing (bow legs ~0.6)
PAW_HEIGHT = 0.76                    # paw height vs the standing drawing (bow paws are flatter)
SLIM_KEY = (3, 14)                   # frames over which leg_slim fades in
FORE_RIGID = 0.6                     # 0..1: how much the forearm follows its paw's even stretch
# Mid-move elbow fold (deg, added on top of the eased end pose as a smooth hump):
# as the chest drops the elbow bends (upper arm tips back, forearm angles forward),
# then the legs extend forward into the bow.
FOLD = {
    "n_upper": (22.0, (3, 24)), "f_upper": (22.0, (3, 24)),
    "n_fore": (-55.0, (3, 28)), "f_fore": (-55.0, (3, 28)),
}
FREE_TRANSLATE = {"hips", "body", "head"}   # everything else stays joined at its pivot

ST_OSC = [                           # panting while it goes down (bone, chan, amp, period, phase, centre)
    ("jaw",    "rot",   2.5,   8, 0, 2.5),
    ("tongue", "rot",   3.0,   8, 1, 3.0),
    ("tongue", "scale", 0.025, 8, 1, 0.025),
]
ST_OSC_OUT = (26, 34)                # panting eases off so frame 34 matches the drawing

BW_OSC = [                           # hold on the bow drawing (calm)
    ("chest",    "scale", 0.015, 8,  0, 0.0),   # panting breaths
    ("jaw",      "rot",   2.5,   8,  0, 2.5),   # 0..5 deg open (never past the drawing)
    ("tongue",   "rot",   3.0,   8,  1, 3.0),
    ("tongue",   "scale", 0.025, 8,  1, 0.025),
    ("head",     "rot",   1.0,  24,  0, 0.0),   # gentle head tilt
    ("head",     "bob",   1.0,   8,  1, 0.0),
    ("ear",      "rot",   1.5,  12,  4, 0.0),
    ("body",     "rot",   0.6,  12,  0, 0.0),   # small wiggle (pivot at the chest)
    ("body",     "bob",   1.0,  12,  3, 0.0),
    ("tail",     "rot",   8.0,   8,  0, 0.0),   # wag
    ("tail_tip", "rot",   6.0,   8,  2, 0.0),
]


def bump(f, a, b):
    """0 -> 1 -> 0 smooth hump between frames a and b."""
    t = min(max((f - a) / (b - a), 0.0), 1.0)
    return math.sin(math.pi * t) ** 2


def smoother(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * t * (t * (t * 6 - 15) + 10)


def ramp(f, a, b):
    return smoother((f - a) / (b - a))


def px2w(px, py):
    return (px - hw.W_PX / 2) / hw.H_PX, (hw.H_PX / 2 - py) / hw.H_PX


def up(p):                           # texture px (y down) -> x right / y up
    p = np.asarray(p, float)
    return np.stack([p[..., 0], -p[..., 1]], -1)


def rot2(a):
    c, s_ = math.cos(a), math.sin(a)
    return np.array([[c, -s_], [s_, c]])


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
scene = bpy.context.scene

xs = np.arange(0, hw.W_PX + 1, GRID, dtype=float); xs[-1] = hw.W_PX
ys = np.arange(0, hw.H_PX + 1, GRID, dtype=float); ys[-1] = hw.H_PX
nx, ny = len(xs), len(ys)
gx, gy = np.meshgrid(xs, ys)
PX, PY = gx.ravel(), gy.ravel()


def make_material(name, tex_rel):
    img = bpy.data.images.load(tex_rel)
    mat = bpy.data.materials.new(name)
    mat.surface_render_method = "BLENDED"
    nt = mat.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.extension = "CLIP"
    tex.location = (-700, 0)
    # "show" is an on/off object property (keyed CONSTANT): a hard cut, never a fade
    show = nt.nodes.new("ShaderNodeAttribute"); show.attribute_type = "OBJECT"
    show.attribute_name = "show"; show.location = (-700, -300)
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.location = (-400, -150)
    emit = nt.nodes.new("ShaderNodeEmission"); emit.location = (-300, 100)
    transp = nt.nodes.new("ShaderNodeBsdfTransparent"); transp.location = (-300, -50)
    mix = nt.nodes.new("ShaderNodeMixShader"); mix.location = (-50, 0)
    outn = nt.nodes.new("ShaderNodeOutputMaterial"); outn.location = (200, 0)
    nt.links.new(tex.outputs["Alpha"], mul.inputs[0])
    nt.links.new(show.outputs["Fac"], mul.inputs[1])
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(mul.outputs[0], mix.inputs["Fac"])
    nt.links.new(transp.outputs[0], mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], outn.inputs["Surface"])
    return mat


def make_dog(name, tex_rel, W, depth, pivots, parents, offset_px=(0, 0), base_y=0.0):
    ox, oz = offset_px[0] / hw.H_PX, -offset_px[1] / hw.H_PX
    wx, wz = px2w(PX, PY)
    verts = [(float(a + ox), float(c + base_y), float(b + oz)) for a, b, c in zip(wx, wz, depth)]
    faces = [(j * nx + i, (j + 1) * nx + i, (j + 1) * nx + i + 1, j * nx + i + 1)
             for j in range(ny - 1) for i in range(nx - 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name="UVMap")
    u, v = PX / hw.W_PX, 1 - PY / hw.H_PX
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            uv.data[li].uv = (u[vi], v[vi])
    mesh.update()
    mesh.materials.append(make_material(name, tex_rel))
    dog = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(dog)
    dog["show"] = 1.0

    arm = bpy.data.objects.new(name + "_rig", bpy.data.armatures.new(name + "_rig"))
    scene.collection.objects.link(arm)
    arm.show_in_front = True
    arm.data.display_type = "STICK"
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, (bx, by) in pivots.items():
        eb = arm.data.edit_bones.new(bname)
        x, z = px2w(bx, by)
        eb.head = (x + ox, base_y, z + oz)
        eb.tail = (x + ox, base_y, z + oz + 0.04)
        eb.roll = 0
    for bname, parent in parents.items():
        if parent:
            arm.data.edit_bones[bname].parent = arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for b in arm.data.bones:
        m = b.matrix_local.to_3x3()
        assert (m.col[2] - Vector((0, -1, 0))).length < 1e-5, b.name   # +rot = screen CCW
        assert (m.col[0] - Vector((1, 0, 0))).length < 1e-5, b.name    # local X = screen right
    for bname, w in W.items():
        vg = dog.vertex_groups.new(name=bname)
        for i in np.nonzero(w > 1e-4)[0]:
            vg.add([int(i)], float(w[i]), "REPLACE")
    dog.parent = arm
    mod = dog.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    return dog, arm


def key_channel(arm, bone, chan, f, val):
    pb = arm.pose.bones[bone]
    if chan == "rot":
        pb.rotation_euler = (0, 0, math.radians(val))
        pb.keyframe_insert("rotation_euler", index=2, frame=f)
    elif chan == "bob":
        pb.location[1] = val / hw.H_PX
        pb.keyframe_insert("location", index=1, frame=f)
    elif chan == "x":
        pb.location[0] = val / hw.H_PX
        pb.keyframe_insert("location", index=0, frame=f)
    elif chan == "scale":
        pb.scale = (1 + val,) * 3
        pb.keyframe_insert("scale", frame=f)


def osc_value(osc, bone, chan, f):
    v = 0.0
    for b, c, amp, period, phase, centre in osc:
        if b == bone and c == chan:
            v += centre + amp * math.cos(2 * math.pi * (f - 1 - phase) / period)
    return v


# ================================================================== fit the end pose
Ws = hw.bend_weights(PX, PY)
_img = bpy.data.images.load("//textures/golden_retriever_happy.png")
alpha = np.asarray(_img.pixels[:]).reshape(hw.H_PX, hw.W_PX, 4)[::-1, :, 3]   # y down
A_ok = alpha[np.clip(PY.astype(int), 0, hw.H_PX - 1), np.clip(PX.astype(int), 0, hw.W_PX - 1)] > 0.5

# warp from the hand-placed landmarks (outline-dense matching was tried: it folds the
# mesh at the tail base, so the corrective key stays smooth with landmarks only)
_pairs = list(lm.PAIRS)
S = np.array([p_ for p_, _ in _pairs], float)
B = np.array([np.add(q_, lm.BOW_OFFSET) for _, q_ in _pairs], float)
tps = ThinPlate(S, B - S, smoothing=30.0)
print("  warp points: %d landmarks" % len(_pairs))
V = np.stack([PX, PY], 1)
TV = V + tps(V)                       # body target at frame 34 (px, y down)
V_up, TV_up = up(V), up(TV)

order = []                            # parents before children


def _visit(b):
    if b in order:
        return
    p = hw.BEND_PARENTS[b]
    if p:
        _visit(p)
    order.append(b)


for _b in hw.BEND_PARENTS:
    _visit(_b)

G = {}                                # world rigid transform per bone: x -> R(th)(x - p) + p + d
for b in order:
    p = up(hw.BEND_PIVOTS[b])
    par = hw.BEND_PARENTS[b]
    sel = (Ws[b] > 0.5) & A_ok
    if b == "root" or sel.sum() < 20:
        if par is None:
            G[b] = (0.0, np.zeros(2))
        else:                         # no pixels of its own: follow the parent rigidly
            th_p, d_p = G[par]
            pp = up(hw.BEND_PIVOTS[par])
            q = rot2(th_p) @ (p - pp) + pp + d_p
            G[b] = (th_p, q - p)
        continue
    P, T = V_up[sel], TV_up[sel]
    if b in FREE_TRANSLATE:
        Pc, Tc = P - P.mean(0), T - T.mean(0)
        th = math.atan2((Pc[:, 0] * Tc[:, 1] - Pc[:, 1] * Tc[:, 0]).sum(), (Pc * Tc).sum())
        d = T.mean(0) - (rot2(th) @ (P.mean(0) - p) + p)
    else:                             # pivot stays attached to the parent
        th_p, d_p = G[par]
        pp = up(hw.BEND_PIVOTS[par])
        q = rot2(th_p) @ (p - pp) + pp + d_p
        a_, b_ = P - p, T - q
        th = math.atan2((a_[:, 0] * b_[:, 1] - a_[:, 1] * b_[:, 0]).sum(), (a_ * b_).sum())
        d = q - p
    G[b] = (th, d)

# ---- front legs: pose them like real joints instead of the free fit --------------
def _ang(v):
    return math.atan2(v[1], v[0])


def _pivot_world(b):
    th, d = G[b]
    return up(hw.BEND_PIVOTS[b]) + d          # a bone's own pivot only translates


LEG_TARGET = {}
for side, (u_, f_, w_) in (("near", ("n_upper", "n_fore", "n_paw")), ("far", ("f_upper", "f_fore", "f_paw"))):
    S0, E0, W0 = (up(hw.BEND_PIVOTS[k]) for k in (u_, f_, w_))
    Et = up(np.array(lm.BOW_JOINTS[side]["elbow"]) + lm.BOW_OFFSET)
    Wt = up(np.array(lm.BOW_JOINTS[side]["wrist"]) + lm.BOW_OFFSET)
    th_b, d_b = G["body"]
    pb = up(hw.BEND_PIVOTS["body"])
    Sw = rot2(th_b) @ (S0 - pb) + pb + d_b                      # shoulder after the body moves
    # 2-bone IK: wrist to the bow drawing's wrist, elbow bending backward
    Lu, Lf = float(np.hypot(*(E0 - S0))), float(np.hypot(*(W0 - E0)))
    dvec = Wt - Sw
    dist = float(np.hypot(*dvec))
    if dist >= Lu + Lf - 1e-6:                                   # out of reach: leg straight
        Ew = Sw + dvec / dist * Lu
    else:
        a_ = (Lu * Lu - Lf * Lf + dist * dist) / (2 * dist)
        h = math.sqrt(max(Lu * Lu - a_ * a_, 0.0))
        base = Sw + dvec / dist * a_
        perp = np.array([-dvec[1], dvec[0]]) / dist
        cands = [base + perp * h, base - perp * h]
        Ew = max(cands, key=lambda e: e[0])                      # elbow behind (larger x)
    th_u = _ang(Ew - Sw) - _ang(E0 - S0)
    G[u_] = (th_u, Sw - S0)
    th_f = _ang(Wt - Ew) - _ang(W0 - E0)
    G[f_] = (th_f, Ew - E0)
    Ww = rot2(th_f) @ (W0 - E0) + Ew
    G[w_] = (0.0, Ww - W0)                                       # paw stays flat
    print("  leg %-4s shoulder %s -> elbow %s (target %s) -> wrist %s (target %s)" % (
        side, np.round(up(Sw)).astype(int), np.round(up(Ew)).astype(int), np.round(up(Et)).astype(int),
        np.round(up(Ww)).astype(int), np.round(up(Wt)).astype(int)))
    LEG_TARGET[side] = (u_, f_, w_)

LOCAL = {}                            # pose channels: rot (deg CCW), loc (px, x right / y up)
for b in order:
    th, d = G[b]
    p = up(hw.BEND_PIVOTS[b])
    par = hw.BEND_PARENTS[b]
    if par is None:
        LOCAL[b] = (math.degrees(th), d)
        continue
    th_p, d_p = G[par]
    pp = up(hw.BEND_PIVOTS[par])
    loc = rot2(-th_p) @ (p + d - pp - d_p) + pp - p
    LOCAL[b] = (math.degrees((th - th_p + math.pi) % (2 * math.pi) - math.pi), loc)

# ---- leg_slim: rest-space slimming of the front legs (px, y up) -----------------
SLIM = np.zeros_like(V_up)
for side, (u_, f_, w_) in (("near", ("n_upper", "n_fore", "n_paw")), ("far", ("f_upper", "f_fore", "f_paw"))):
    cx = hw.BEND_PIVOTS[f_][0]                           # forearm centre line (rest, x)
    w_thin = Ws[f_] + 0.5 * Ws[u_]                       # forearm fully, upper arm half
    SLIM[:, 0] += w_thin * (cx - V_up[:, 0]) * (1 - LEG_SLIM)
    sel = (Ws[w_] > 0.5) & A_ok
    y_bottom = V_up[sel, 1].min()                        # paw sole (rest, y up)
    SLIM[:, 1] += Ws[w_] * (y_bottom - V_up[:, 1]) * (1 - PAW_HEIGHT)
V_eff = V_up + SLIM                                      # rest positions once slimmed

# armature-only end positions (linear blend of the bone transforms) and the residual
Aend = np.zeros_like(V_up)
M = np.zeros((len(V_up), 2, 2))
for b in order:
    th, d = G[b]
    p = up(hw.BEND_PIVOTS[b])
    R = rot2(th)
    Aend += Ws[b][:, None] * ((V_eff - p) @ R.T + p + d)
    M += Ws[b][:, None, None] * R

# front legs: target = posed leg, stretched along the forearm so the wrist reaches the
# bow drawing's wrist (paw carried rigidly with it).  Blended in by leg weight.
TV_up_final = TV_up.copy()
leg_total = np.zeros(len(V_up))
leg_target = np.zeros_like(V_up)
for side, (u_, f_, w_) in (("near", ("n_upper", "n_fore", "n_paw")), ("far", ("f_upper", "f_fore", "f_paw"))):
    E0, W0 = up(hw.BEND_PIVOTS[f_]), up(hw.BEND_PIVOTS[w_])
    th_f, d_f = G[f_]
    Ew = E0 + d_f
    Ww = rot2(th_f) @ (W0 - E0) + Ew
    Wt = up(np.array(lm.BOW_JOINTS[side]["wrist"]) + lm.BOW_OFFSET)
    L = float(np.hypot(*(Ww - Ew)))
    u = (Ww - Ew) / L
    ut = (Wt - Ew) / float(np.hypot(*(Wt - Ew)))
    s_ = float(np.hypot(*(Wt - Ew))) / L
    rel = Aend - Ew
    t = rel @ u                                   # distance along the forearm
    n_ = rel - t[:, None] * u[None, :]
    tc = np.clip(t, 0, None)
    stretched = np.where((t <= L)[:, None], (tc * s_)[:, None] * ut[None, :],
                         (L * s_ + (t - L))[:, None] * ut[None, :])
    # rotate the perpendicular part by the same small re-aim (u -> ut)
    ang = math.atan2(u[0] * ut[1] - u[1] * ut[0], u @ ut)
    n_rot = n_ @ rot2(ang).T
    tgt = Ew + np.where((t > 0)[:, None], stretched + n_rot, rel)
    w = Ws[u_] + Ws[f_] + Ws[w_]
    leg_total += w
    leg_target += w[:, None] * tgt
TV_up_final = TV_up                   # (leg-axis stretch target tried: curled the paws)

det = M[:, 0, 0] * M[:, 1, 1] - M[:, 0, 1] * M[:, 1, 0]
det = np.where(np.abs(det) < 0.2, 0.2, det)
Minv = np.stack([np.stack([M[:, 1, 1], -M[:, 0, 1]], -1),
                 np.stack([-M[:, 1, 0], M[:, 0, 0]], -1)], -2) / det[:, None, None]
DELTA = np.einsum("nij,nj->ni", Minv, TV_up_final - Aend)     # rest-space shape-key offset (px, y up)

# Clean paws: inside each paw the free corrective warp is replaced by one similarity
# transform (turn + even grow + slide), so the toes never smear, skew or squash.  PAW_RIGID = 0 turns
# this off; values in between blend.  Same idea, weaker, for the forearm (FORE_RIGID).
for paw, fore in (("n_paw", "n_fore"), ("f_paw", "f_fore")):
    sel = (Ws[paw] > 0.5) & A_ok
    # one SIMILARITY transform per paw (turn + even grow + slide, no skew), fitted to
    # where the corrective warp wanted the paw: keeps the drawn paw shape exactly.
    Pv, Qv = V_eff[sel], V_eff[sel] + DELTA[sel]
    mp, mq = Pv.mean(0), Qv.mean(0)
    Pc, Qc = Pv - mp, Qv - mq
    ang = math.atan2((Pc[:, 0] * Qc[:, 1] - Pc[:, 1] * Qc[:, 0]).sum(), (Pc * Qc).sum())
    R_ = rot2(ang)
    sc = float(((Pc @ R_.T) * Qc).sum() / (Pc * Pc).sum())
    sc = min(max(sc, 1.0), PAW_MAX_GROW)
    aff = ((V_eff - mp) @ R_.T) * sc + mq - V_eff
    print("  %s: turn %.1f deg, grow x%.2f" % (paw, math.degrees(ang), sc))
    k = (PAW_RIGID * Ws[paw])[:, None]
    DELTA = (1 - k) * DELTA + k * aff
    kf = (FORE_RIGID * Ws[fore])[:, None]
    DELTA = (1 - kf) * DELTA + kf * aff

# ================================================================== standing dog (bend rig)
head_s = Ws["head"] + Ws["ear"] + Ws["jaw"] + Ws["tongue"]
legs_n = Ws["n_upper"] + Ws["n_fore"] + Ws["n_paw"]
legs_f = Ws["f_upper"] + Ws["f_fore"] + Ws["f_paw"]
# Layer depth (camera looks down +Y).  Parts sit at different depths, and a gentle
# gradient by rest position means any fold of the mesh onto itself is never coplanar
# (coplanar overlaps speckle in Cycles).
yn, xn = PY / hw.H_PX, PX / hw.W_PX
depth_s = (-0.008 * legs_n * (0.7 + 0.3 * yn) + 0.004 * legs_f * (1.3 - 0.3 * yn)
           + 0.006 * Ws["root"] + 0.005 * (Ws["tail"] + Ws["tail_tip"]) - 0.003 * head_s
           - 0.0015 * yn - 0.0008 * xn)
st_dog, st_arm = make_dog("golden_standing", "//textures/golden_retriever_happy.png",
                          Ws, depth_s, hw.BEND_PIVOTS, hw.BEND_PARENTS)
st_dog.shape_key_add(name="Basis", from_mix=False)
co0 = np.zeros(len(PX) * 3)
st_dog.data.shape_keys.key_blocks["Basis"].data.foreach_get("co", co0)
co0 = co0.reshape(-1, 3)


def add_key(name, off):
    k = st_dog.shape_key_add(name=name, from_mix=False)
    c = co0.copy()
    c[:, 0] += off[:, 0] / hw.H_PX
    c[:, 2] += off[:, 1] / hw.H_PX
    k.data.foreach_set("co", c.ravel())
    return k


slim = add_key("leg_slim", SLIM)      # front legs to the bow drawing's size
fit = add_key("bow_fit", DELTA)       # everything else lines up with the bow drawing

# ================================================================== bow drawing (hold)
Wb = hw.bow_weights(PX, PY)
head_b = Wb["head"] + Wb["ear"] + Wb["jaw"] + Wb["tongue"]
depth_b = (0.006 * Wb["root"] - 0.006 * (Wb["fore_near"] + Wb["paw_near"])
           + 0.004 * (Wb["fore_far"] + Wb["paw_far"])
           + 0.005 * (Wb["tail"] + Wb["tail_tip"]) - 0.003 * head_b)
bw_dog, bw_arm = make_dog("golden_bow", "//textures/golden_retriever_bow.png",
                          Wb, depth_b, hw.BOW_PIVOTS, hw.BOW_PARENTS,
                          offset_px=lm.BOW_OFFSET, base_y=0.03)

# ================================================================== keys
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = END
for _o in BW_OSC:
    assert HOLD % _o[3] == 0

GROUND_LOG = []
GROUND_FIX = {}                       # (bone, frame) -> extra deg on the upper arm (paws on the ground)


def rot_at(b, f):
    """local rotation (deg) of a standing-rig bone at frame f: eased end pose + fold."""
    v = LOCAL[b][0] * ramp(f, *TIMING.get(b, (3, 30)))
    if b in FOLD:
        amp, (a_, b_) = FOLD[b]
        v += amp * bump(f, a_, b_)
    return v + GROUND_FIX.get((b, f), 0.0)


def key_frame(f):
    out = 1 - ramp(f, *ST_OSC_OUT)
    for b in order:
        if b == "root":
            continue
        e = ramp(f, *TIMING.get(b, (3, 30)))
        rdeg, loc = LOCAL[b]
        val = rot_at(b, f) + out * osc_value(ST_OSC, b, "rot", f)
        if b in ("n_paw", "f_paw"):                 # keep the paw flat on every frame
            up_b, fo_b = ("n_upper", "n_fore") if b == "n_paw" else ("f_upper", "f_fore")
            val = -sum(rot_at(k, f) for k in ("hips", "body", up_b, fo_b))
        key_channel(st_arm, b, "rot", f, val)
        if b in FREE_TRANSLATE:
            key_channel(st_arm, b, "x", f, loc[0] * e)
            key_channel(st_arm, b, "bob", f, loc[1] * e)
        if any(o[0] == b and o[1] == "scale" for o in ST_OSC):
            key_channel(st_arm, b, "scale", f, out * osc_value(ST_OSC, b, "scale", f))
    fit.value = ramp(f, *FIT_KEY)
    fit.keyframe_insert("value", frame=f)
    slim.value = ramp(f, *SLIM_KEY)
    slim.keyframe_insert("value", frame=f)


for f in range(1, BOW_AT):
    key_frame(f)

# ---- keep the front paws on the ground through the bend ------------------------
# Measure each paw's lowest opaque vertex on the evaluated mesh and nudge that leg's
# upper arm (paw stays flat) until it sits on the ground line, which eases from the
# standing ground to the bow drawing's as the fit key comes in.  Fades to 0 at 34.
paw_sel = {s_: ((Ws[s_[0] + "_paw"] > 0.5) & A_ok) for s_ in ("n", "f")}


def paw_bottoms(f):
    scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = st_dog.evaluated_get(dg)
    m = ev.to_mesh()
    c = np.zeros(len(m.vertices) * 3)
    m.vertices.foreach_get("co", c)
    ev.to_mesh_clear()
    z = c.reshape(-1, 3)[:, 2]
    return {k: float(z[v].min()) for k, v in paw_sel.items()}


g0 = paw_bottoms(1)
g_end = paw_bottoms(BOW_AT - 1)
for f in range(2, BOW_AT - 1):
    k = ramp(f, *FIT_KEY)
    fade = 1 - ramp(f, 26, BOW_AT - 1)
    for _it in range(4):
        zb = paw_bottoms(f)
        changed = False
        for side in ("n", "f"):
            target = (1 - k) * g0[side] + k * g_end[side]
            err_px = (zb[side] - target) * hw.H_PX           # + = paw above ground
            if abs(err_px) > 1.0:
                ub = side + "_upper"
                # a CCW turn of the upper arm lifts a forward-reaching paw; ~0.4 deg/px
                GROUND_FIX[(ub, f)] = GROUND_FIX.get((ub, f), 0.0) + 0.4 * err_px * fade
                changed = True
        if not changed:
            break
        key_frame(f)
    GROUND_LOG.append((f, {s_: round((paw_bottoms(f)[s_] - ((1 - k) * g0[s_] + k * g_end[s_])) * hw.H_PX, 1)
                           for s_ in ("n", "f")}))

from bpy_extras import anim_utils as anim_utils_mod  # noqa: E402
bw_chans = sorted({(o[0], o[1]) for o in BW_OSC})
for f in range(BOW_AT, END + 1):
    for bone, chan in bw_chans:
        key_channel(bw_arm, bone, chan, f, osc_value(BW_OSC, bone, chan, f))
for bone, chan in bw_chans:          # seamless hold loop
    assert abs(osc_value(BW_OSC, bone, chan, BOW_AT) - osc_value(BW_OSC, bone, chan, END + 1)) < 1e-9

# ---- the bow drawing finishes the move (frames CUT_AT..34) -----------------------
# So that frame 34 is EXACTLY the bow drawing (fur and all, same as frame 35), the bow
# drawing takes over at CUT_AT.  At that frame it is bent into exactly the shape the
# standing dog has there, then it unbends into its own drawn pose by frame 34.
# Each bow vertex b is paired with the standing-drawing point u that lands on b at
# frame 34 (Newton solve), so at frame f it sits at
#     E_f(u) + s(f) * (b - E_34(u)),   s: 0 at CUT_AT -> 1 at frame 34
# baked as one shape key per frame ("bend_24" ... "bend_34") on the bow mesh.
def eval_xz(obj, f):
    scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    m = ev.to_mesh()
    c = np.zeros(len(m.vertices) * 3)
    m.vertices.foreach_get("co", c)
    ev.to_mesh_clear()
    c = c.reshape(-1, 3)
    return c[:, [0, 2]].copy()


E = {f: eval_xz(st_dog, f).reshape(ny, nx, 2) for f in range(CUT_AT, BOW_AT)}


def samp(G2, u):
    """bilinear sample of a (ny, nx, 2) grid at fractional (i, j) indices"""
    i = np.clip(u[:, 0], 0, nx - 1.001)
    j = np.clip(u[:, 1], 0, ny - 1.001)
    i0, j0 = np.floor(i).astype(int), np.floor(j).astype(int)
    fi, fj = (i - i0)[:, None], (j - j0)[:, None]
    return ((1 - fi) * (1 - fj) * G2[j0, i0] + fi * (1 - fj) * G2[j0, i0 + 1]
            + (1 - fi) * fj * G2[j0 + 1, i0] + fi * fj * G2[j0 + 1, i0 + 1])


bw_rest = np.zeros(len(PX) * 3)
bw_dog.data.vertices.foreach_get("co", bw_rest)
bw_rest = bw_rest.reshape(-1, 3)
P35 = eval_xz(bw_dog, BOW_AT)      # bow drawing as shown at frame 35 (its hold pose applied)
bxz = P35                          # the shape the move must end on
# first guess: inverse landmark warp (bow px -> standing px), then Newton on E_34
inv = ThinPlate(B, S - B, smoothing=30.0)
b_px = np.stack([PX + lm.BOW_OFFSET[0], PY + lm.BOW_OFFSET[1]], 1)
s_px = b_px + inv(b_px)
u = np.stack([np.interp(s_px[:, 0], xs, np.arange(nx)), np.interp(s_px[:, 1], ys, np.arange(ny))], 1)
E34 = E[BOW_AT - 1]
for _it in range(25):
    r = samp(E34, u) - bxz
    h = 0.25
    Ji = (samp(E34, u + [h, 0]) - samp(E34, u - [h, 0])) / (2 * h)
    Jj = (samp(E34, u + [0, h]) - samp(E34, u - [0, h])) / (2 * h)
    det_ = Ji[:, 0] * Jj[:, 1] - Ji[:, 1] * Jj[:, 0]
    ok = np.abs(det_) > 1e-9
    di = np.where(ok, (Jj[:, 1] * r[:, 0] - Jj[:, 0] * r[:, 1]) / np.where(ok, det_, 1), 0)
    dj = np.where(ok, (-Ji[:, 1] * r[:, 0] + Ji[:, 0] * r[:, 1]) / np.where(ok, det_, 1), 0)
    u = u - np.clip(np.stack([di, dj], 1), -3, 3)
    u[:, 0] = np.clip(u[:, 0], 0, nx - 1.001)
    u[:, 1] = np.clip(u[:, 1], 0, ny - 1.001)
res_px = np.hypot(*(samp(E34, u) - bxz).T) * hw.H_PX
_bimg_a = np.asarray(bpy.data.images.load("//textures/golden_retriever_bow.png").pixels[:]
                     ).reshape(hw.H_PX, hw.W_PX, 4)[::-1, :, 3]
B_ok = _bimg_a[np.clip(PY.astype(int), 0, hw.H_PX - 1), np.clip(PX.astype(int), 0, hw.W_PX - 1)] > 0.5
print("  bow->standing match: median %.1f px, 95%% %.1f px (opaque)" %
      (np.median(res_px[B_ok]), np.percentile(res_px[B_ok], 95)))

# bow mesh: probe how its frame-35 pose moves a rest offset (x -> M x + c per vertex)
bw_dog.shape_key_add(name="Basis", from_mix=False)
P0 = eval_xz(bw_dog, BOW_AT)
probe = bw_dog.shape_key_add(name="probe", from_mix=False)
cols = []
for axis in (0, 2):
    c = bw_rest.copy()
    c[:, axis] += 0.01
    probe.data.foreach_set("co", c.ravel())
    probe.value = 1.0
    cols.append((eval_xz(bw_dog, BOW_AT) - P0) / 0.01)
bw_dog.shape_key_remove(probe)
Mb = np.stack(cols, -1)                                   # (n, 2, 2): columns d/dx, d/dz
detb = Mb[:, 0, 0] * Mb[:, 1, 1] - Mb[:, 0, 1] * Mb[:, 1, 0]
Mbi = np.stack([np.stack([Mb[:, 1, 1], -Mb[:, 0, 1]], -1),
                np.stack([-Mb[:, 1, 0], Mb[:, 0, 0]], -1)], -2) / detb[:, None, None]
def blur2(a, sig):
    """gaussian blur of a (ny, nx, ...) grid along both grid axes (numpy only)"""
    r = int(3 * sig) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2)
    k /= k.sum()
    out = a
    for ax in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[ax] = (r, r)
        q = np.pad(out, pad, mode="edge")
        acc = np.zeros_like(out)
        for t, kv in enumerate(k):
            sl = [slice(None)] * out.ndim
            sl[ax] = slice(t, t + out.shape[ax])
            acc = acc + kv * q[tuple(sl)]
        out = acc
    return out


def smooth_fill(D, good, sig):
    """normalized convolution: fill D from 'good' cells only"""
    g = good[..., None].astype(float)
    num = blur2(D * g, sig)
    den = blur2(g, sig)
    return num / np.maximum(den, 1e-6)


# Where the pairing is ambiguous (the standing dog's front legs overlap each other),
# the map can fold or tear.  Find those cells (Jacobian of b -> X_CUT folds/stretches),
# and there use a smooth offset filled in from the well-behaved surroundings.
D_cut = (samp(E[CUT_AT], u) - bxz).reshape(ny, nx, 2)
Xg = bxz.reshape(ny, nx, 2) + D_cut
gx_ = np.gradient(Xg, axis=1)
gy_ = np.gradient(Xg, axis=0)
rx_ = np.gradient(bxz.reshape(ny, nx, 2), axis=1)
ry_ = np.gradient(bxz.reshape(ny, nx, 2), axis=0)
jac_rest = rx_[..., 0] * ry_[..., 1] - rx_[..., 1] * ry_[..., 0]   # (rows run downward: negative)
jac = (gx_[..., 0] * gy_[..., 1] - gx_[..., 1] * gy_[..., 0]) / jac_rest
badc = (jac < 0.35) | (jac > 3.0)
bad_soft = np.clip(blur2(badc.astype(float)[..., None], 2.0)[..., 0] * 3.0, 0, 1)
print("  hand-off: %.1f%% of bow cells re-smoothed" % (100 * (bad_soft > 0.05).mean()))
for f in range(CUT_AT, BOW_AT):
    sf = ramp(f, CUT_AT, BOW_AT - 1)
    X = samp(E[f], u) + sf * (bxz - samp(E34, u))         # world target (x, z)
    Dg = (X - bxz).reshape(ny, nx, 2)
    fill = smooth_fill(Dg, bad_soft < 0.05, 4.0)
    fill = np.where(np.isfinite(fill), fill, Dg)
    Dg = (1 - bad_soft[..., None]) * Dg + bad_soft[..., None] * fill
    X = bxz + Dg.reshape(-1, 2)
    d = np.einsum("nij,nj->ni", Mbi, X - P0)              # rest-space offset
    k = bw_dog.shape_key_add(name="bend_%d" % f, from_mix=False)
    c = bw_rest.copy()
    c[:, 0] += d[:, 0]
    c[:, 2] += d[:, 1]
    k.data.foreach_set("co", c.ravel())
    for ff, v in ((f - 1, 0.0), (f, 1.0), (f + 1, 0.0)):
        k.value = v
        k.keyframe_insert("value", frame=ff)
kad = bw_dog.data.shape_keys.animation_data
for fc in anim_utils_mod.action_get_channelbag_for_slot(kad.action, kad.action_slot).fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "CONSTANT"

# hard cut: standing visible 1..CUT_AT-1, bow drawing from CUT_AT (CONSTANT keys, no fade)
from bpy_extras import anim_utils  # noqa: E402
for dog, vis in ((st_dog, lambda f: f < CUT_AT), (bw_dog, lambda f: f >= CUT_AT)):
    for f in (1, CUT_AT - 1, CUT_AT, END):
        dog["show"] = 1.0 if vis(f) else 0.0
        dog.keyframe_insert('["show"]', frame=f)
    ad = dog.animation_data
    for fc in anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"
st_arm.animation_data.action.name = "golden_standing_bend"
bw_arm.animation_data.action.name = "golden_bow_hold"

# ================================================================== camera / render
cam_data = bpy.data.cameras.new("Camera")
cam_data.type = "ORTHO"
cam_data.ortho_scale = (hw.W_PX / hw.H_PX) * 1.18
cam = bpy.data.objects.new("Camera", cam_data)
cam.location = (-0.06, -3, 0.0)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.collection.objects.link(cam)
scene.camera = cam
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.cycles.transparent_max_bounces = 16
scene.render.film_transparent = True
scene.render.resolution_x = 1448
scene.render.resolution_y = 1086
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("saved", OUT, "frames", END)
for b in order:
    r, loc = LOCAL[b]
    print("  %-9s rot %7.1f  loc (%6.1f, %6.1f)" % (b, r, loc[0], loc[1]))
for f, e in GROUND_LOG:
    if f % 4 == 0:
        print("  frame %2d paw height off ground (px, +above):" % f, e)
dmag = np.hypot(*DELTA[A_ok].T)
print("  residual |delta| px: median %.1f  95%% %.1f (opaque verts)" % (np.median(dmag), np.percentile(dmag, 95)))
