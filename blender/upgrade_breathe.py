"""
Rebuild the golden retriever's Breathe shape key and loop timing so the idle reads well at
app size (the dog is only ~50pt tall on the Home lawn).

Run once in Blender: Scripting tab -> Open this file -> Run Script, then Ctrl+S.
Safe to re-run: it always rebuilds Breathe from the Basis, never stacks on itself.

Breath shape (at the inhale peak):
  - back line rises slightly over the ribcage only (fades out before the hips)
  - TAIL STAYS STILL (lifting the back into the tail base stretched the tail)
  - belly drops between the legs
  - chest pushes forward
  - HEAD STAYS STILL. At lawn size even a 1px head bob on every breath reads as the dog
    shaking, because the face is where the eye goes. The lift fades out through the neck.
  - legs and paws stay pinned, so the dog never lifts off the ground
The original key is kept, muted, as "Breathe_orig" in case you want it back.

Timing: one slow breath per loop (LOOP_FRAMES at 24fps = 3s) with one blink on the exhale.
This replaces the Breathe keys (1 -> 24 -> 48) and Blink keys (30 -> 33 -> 36) and sets the
scene end frame. The loop is LOOP_FRAMES long: the last key sits on LOOP_FRAMES + 1, which
equals frame 1, so playback wraps seamlessly.

Tune the strength with the numbers below (texture pixels at full inhale).
"""
import bpy
import numpy as np

OBJ_NAME = "golden_retriever"
BACK_RISE = 5.0     # back line up (ribcage only; the tail never moves)
BELLY_DROP = 13.0   # belly down
CHEST_PUSH = 10.0   # chest forward

LOOP_FRAMES = 72    # 3s at 24fps
BLINK_PEAK = 53     # blink on the exhale; closes over 3 frames, opens over 3
BLINK_HALF = 3

TEX_W, TEX_H = 900, 670   # the avatar texture the plane is built from (1 unit = 670px)
PX_PER_UNIT = TEX_H


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def breathe_field(x, y):
    """Displacement in texture px (x right, y DOWN) at full inhale."""
    # Pinned areas: leg columns below the leg tops; the belly gap can sag a little lower.
    front_leg = ss(170, 200, x) * (1 - ss(375, 395, x))
    hind_leg = ss(495, 515, x) * (1 - ss(770, 790, x))
    leg_col = np.maximum(front_leg, hind_leg)
    pin = leg_col * ss(405, 465, y) + (1 - leg_col) * ss(470, 515, y)
    free = 1 - np.clip(pin, 0, 1)
    # Head (x < ~330, incl. the ear) gets no lift; it fades in through the neck.
    # Lift only over the ribcage: fades in through the neck and out before the hips, so the
    # head and the tail (x > ~640) stay still.
    body_lift = ss(320, 450, x) * (1 - ss(520, 630, x))
    up = -BACK_RISE * ss(380, 270, y) * body_lift
    body_x = ss(230, 330, x) * (1 - ss(600, 690, x))
    down = BELLY_DROP * ss(370, 470, y) * body_x
    dy = (up + down) * free
    # Chest swell, kept below the chin (y > ~270) so the face doesn't move.
    chest = np.exp(-(((x - 195) / 70) ** 2 + ((y - 360) / 70) ** 2)) * ss(255, 305, y)
    dx = -CHEST_PUSH * chest * free
    return dx, dy


def channelbag_fcurves(anim_data):
    """F-curves of an action, for both layered (4.4+) and legacy actions."""
    act = anim_data.action
    if hasattr(act, "layers") and len(act.layers):
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out.extend(cb.fcurves)
        return out
    return list(act.fcurves)


def rekey(kb, points):
    """Replace every keyframe on key block `kb`'s value with (frame, value) points."""
    path = f'key_blocks["{kb.name}"].value'
    for fc in channelbag_fcurves(keys.animation_data):
        if fc.data_path == path:
            while len(fc.keyframe_points):
                fc.keyframe_points.remove(fc.keyframe_points[0])
    for frame, value in points:
        kb.value = value
        kb.keyframe_insert("value", frame=frame)
    for fc in channelbag_fcurves(keys.animation_data):
        if fc.data_path == path:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
                kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
            fc.update()


obj = bpy.data.objects[OBJ_NAME]
keys = obj.data.shape_keys
kbs = keys.key_blocks
basis = keys.reference_key
breathe = kbs["Breathe"]

# Keep the original once (never overwrite an existing backup on re-runs).
if "Breathe_orig" not in kbs:
    orig = obj.shape_key_add(name="Breathe_orig", from_mix=False)
    orig.relative_key = basis
    for i, p in enumerate(breathe.data):
        orig.data[i].co = p.co
    orig.mute = True
    orig.value = 0.0

# ---- Breath shape ---------------------------------------------------------------------
n = len(basis.data)
co = np.empty(n * 3)
basis.data.foreach_get("co", co)
co = co.reshape(n, 3)

# Plane coords -> texture px (plane is centred, 1 unit = 670px, y up).
px = (co[:, 0] + TEX_W / PX_PER_UNIT / 2) * PX_PER_UNIT
py = (TEX_H / PX_PER_UNIT / 2 - co[:, 1]) * PX_PER_UNIT
dx, dy = breathe_field(px, py)

new = co.copy()
new[:, 0] += dx / PX_PER_UNIT
new[:, 1] -= dy / PX_PER_UNIT   # texture y is down, plane y is up
breathe.data.foreach_set("co", new.ravel())
obj.data.update()

# ---- Timing ---------------------------------------------------------------------------
end = LOOP_FRAMES + 1  # == frame 1 of the next loop
rekey(breathe, [(1, 0.0), (1 + LOOP_FRAMES // 2, 1.0), (end, 0.0)])
rekey(kbs["Blink"], [(BLINK_PEAK - BLINK_HALF, 0.0), (BLINK_PEAK, 1.0), (BLINK_PEAK + BLINK_HALF, 0.0)])
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = LOOP_FRAMES
scene.frame_set(1)

print(f"Breathe rebuilt: max move {np.hypot(dx, dy).max():.1f}px, loop {LOOP_FRAMES} frames "
      f"({LOOP_FRAMES / scene.render.fps:.1f}s), blink peak {BLINK_PEAK}. Save with Ctrl+S.")
