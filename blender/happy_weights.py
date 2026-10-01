"""Bone-weight fields for the happy golden retriever rig, in texture px (y down).
Art: blender/textures/golden_retriever_happy.png, 1448x1086.
Shared by build_happy_golden.py (inside Blender) and the 2D preview."""
import numpy as np

W_PX, H_PX = 1448, 1086

# Pivots (px) for each bone
PIVOTS = {
    "root":     (760, 1045),
    "body":     (760, 640),
    "chest":    (400, 590),
    "head":     (520, 450),
    "ear":      (440, 185),
    "jaw":      (285, 305),
    "tongue":   (228, 352),
    "tail":     (1115, 580),
    "tail_tip": (1255, 420),
}
PARENTS = {
    "root": None, "body": "root", "chest": "body", "head": "body",
    "ear": "head", "jaw": "head", "tongue": "jaw",
    "tail": "body", "tail_tip": "tail",
}


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ellipse_r(x, y, cx, cy, rx, ry):
    return np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)


def weights(x, y, playbow=False):
    """playbow=True: the front legs get their own bones (fleg forearm, fpaw paws)
    so they can fold forward at the elbow, instead of being pinned to root."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    front_col = ss(270, 300, x) * (1 - ss(640, 670, x))
    hind = ss(800, 830, x) * (1 - ss(1270, 1300, x)) * ss(760, 920, y)
    if playbow:
        # Front legs bend at the elbow: forearm -> 'fleg', paws -> 'fpaw' (child of
        # fleg, counter-rotated so they stay flat on the ground).
        FL = front_col * ss(740, 820, y)
        FPw = FL * ss(925, 960, y)
        R = np.maximum(hind, ss(940, 970, y) * (1 - front_col))
    else:
        FL = FPw = np.zeros_like(x)
        # Paws/lower legs pinned to root
        R = np.maximum(front_col * ss(730, 900, y), hind)
        R = np.maximum(R, ss(940, 970, y))          # everything at paw level

    # Tail: right of the rump curve, above the hind leg
    base_x = 1088 + (y - 470) * 0.30
    T = ss(-15, 25, x - base_x) * (1 - ss(690, 730, y)) * ss(1060, 1090, x)
    d_tail = np.hypot(x - 1115, y - 580)
    TT = ss(140, 300, d_tail)

    # Head: above a neck polyline
    yl = np.where(x < 500, 470.0, 470.0 - (x - 500) * 110.0 / 140.0)
    yl = yl + 90.0 * (1 - ss(195, 228, x))   # open space under the tongue follows the head
    H = ss(-30, 40, yl - y) * (1 - ss(610, 680, x))

    # Lower jaw (within head)
    # U = bottom edge of the upper lip's black outline (traced on the art). The jaw
    # starts just BELOW it, so the upper lip stays rigid with the head while panting.
    U = np.interp(x, [40, 60, 85, 130, 170, 210, 240, 262, 285, 330],
                     [335, 340, 349, 357, 352, 342, 330, 312, 300, 300])
    jaw_floor = 440 + 90 * (1 - ss(195, 228, x))   # deeper under the tongue (empty space)
    J = ss(2, 16, y - U) * (1 - ss(285, 320, x)) * (1 - ss(jaw_floor, jaw_floor + 30, y))
    Tg = 1 - ss(0.8, 1.15, ellipse_r(x, y, 160, 415, 95, 90))

    E = 1 - ss(0.8, 1.1, ellipse_r(x, y, 462, 320, 100, 125))
    C = np.exp(-ellipse_r(x, y, 400, 590, 170, 160) ** 2) * (1 - ss(680, 760, y))

    root = R
    nr = 1 - R - FL
    tail_all = T * nr
    tail_tip = tail_all * TT
    tail = tail_all * (1 - TT)
    b = nr * (1 - T)
    head_all = H * b
    jaw_all = head_all * J
    tongue = jaw_all * Tg
    jaw = jaw_all * (1 - Tg)
    head_rest = head_all * (1 - J)
    ear = head_rest * E
    head = head_rest * (1 - E)
    cb = b * (1 - H)
    chest = cb * C
    body = cb * (1 - C)
    out = dict(root=root, body=body, chest=chest, head=head, ear=ear,
               jaw=jaw, tongue=tongue, tail=tail, tail_tip=tail_tip)
    if playbow:
        out["fleg"] = FL - FPw
        out["fpaw"] = FPw
    return out


# Motion: (bone, channel, amplitude, period_frames, phase_frames[, centre])
#  rot: screen counter-clockwise degrees; bob: px up; scale: fraction
LOOP = 72
MOTION = [
    ("body",     "bob",   5.0, 12, 0),   # happy bounce
    ("body",     "rot",   1.2, 12, 3),   # rock forward/back with the bounce
    ("chest",    "scale", 0.025, 8, 0),  # quick panting breaths
    ("head",     "rot",   2.5, 24, 0),   # happy head tilt
    ("head",     "bob",   2.0, 8, 1),    # small nod on every pant
    ("ear",      "rot",   3.0, 12, 4),   # ear flops behind the bounce
    # Mouth parts only swing between the drawn pose (rest) and OPEN: closing past
    # the drawing squashes the tongue into the upper lip.  6th value = centre offset.
    ("jaw",      "rot",   2.5, 8, 0, 2.5),   # pant: 0..5 deg open
    ("tongue",   "rot",   3.0, 8, 1, 3.0),   # tongue flaps down 0..6 deg, a frame behind
    ("tongue",   "scale", 0.025, 8, 1, 0.025),  # and stretches out 0..5%
    ("tail",     "rot",   11.0, 12, 0),  # wag
    ("tail_tip", "rot",   9.0, 12, 2),   # tip whips behind the base
]


# ============================================================ bow art rig
# Art: blender/textures/golden_retriever_bow.png (1448x1086), the user's drawing of
# the full play bow.  Both front legs have an elbow (fore_*) and a wrist (paw_*) so
# they can fold from upright down to the drawn bow; hind lower legs are pinned.
BOW_PIVOTS = {
    "root":     (700, 980),
    "settle":   (1100, 700),   # hips: lowers the front end during the bend
    "body":     (620, 840),
    "chest":    (420, 770),
    "head":     (560, 660),
    "ear":      (450, 440),
    "jaw":      (280, 578),
    "tongue":   (230, 632),
    "tail":     (1150, 420),
    "tail_tip": (1280, 230),
    "fore_near": (640, 850),   # near elbow
    "paw_near":  (380, 940),   # near wrist
    "fore_far":  (450, 760),   # far elbow (hidden under the chest)
    "paw_far":   (210, 890),   # far wrist
}
BOW_PARENTS = {
    "root": None, "settle": "root", "body": "settle", "chest": "body", "head": "body",
    "ear": "head", "jaw": "head", "tongue": "jaw", "tail": "body", "tail_tip": "tail",
    "fore_near": "settle", "paw_near": "fore_near",
    "fore_far": "settle", "paw_far": "fore_far",
}
# Paw ground-contact points (px) used to keep the paws on the ground while bending
BOW_CONTACT = {"paw_near": (300, 978), "paw_far": (130, 957)}


def _line(x, p, q):
    return p[1] + (x - p[0]) * (q[1] - p[1]) / (q[0] - p[0])


def bow_weights(x, y):
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    hind = ss(950, 985, x) * ss(760, 880, y)                   # hind lower legs + paws

    # front legs (traced edges)
    # the leg weight ramps up over the ~40px of fur ABOVE each traced top outline, so
    # the black outline moves with its leg and the stretch spreads over the fur
    below_near_top = ss(-45, -8, y - _line(x, (565, 822), (300, 882)))
    right_of_far_paw = ss(203, 213, x)                         # just left of the near paw's outline
    belly = ss(-8, 8, y - _line(x, (410, 975), (650, 935))) * ss(400, 420, x)
    near_raw = below_near_top * right_of_far_paw * (1 - belly) * (1 - ss(640, 680, x))
    below_far_top = ss(-45, -8, y - _line(x, (290, 790), (70, 862)))
    far_raw = below_far_top * (1 - ss(320, 350, x)) * (1 - below_near_top * right_of_far_paw)
    near_paw = 1 - ss(360, 400, x)
    far_paw = 1 - ss(195, 235, x)

    R = hind
    legs = (near_raw + far_raw) * (1 - R)
    nr = 1 - R - legs

    bx = 1100 + (y - 330) * 0.64                               # tail base line
    T = ss(-15, 25, x - bx) * (1 - ss(490, 530, y)) * ss(1080, 1110, x)
    TT = ss(130, 300, np.hypot(x - 1150, y - 420))

    yl = np.interp(x, [0, 250, 300, 380, 450, 520, 600, 680],
                      [800, 800, 735, 730, 725, 710, 560, 500])   # neck line
    H = ss(-30, 40, yl - y) * (1 - ss(620, 690, x)) * (1 - ss(780, 830, y))

    U = np.interp(x, [40, 60, 80, 100, 130, 150, 180, 210, 240, 260, 278, 300, 340],
                     [610, 622, 632, 637, 637, 634, 627, 619, 609, 596, 578, 570, 570])
    jaw_floor = 715 + 85 * (1 - ss(195, 228, x))
    J = ss(2, 16, y - U) * (1 - ss(285, 320, x)) * (1 - ss(jaw_floor, jaw_floor + 30, y))
    Tg = 1 - ss(0.8, 1.15, ellipse_r(x, y, 150, 680, 90, 72))
    E = 1 - ss(0.8, 1.1, ellipse_r(x, y, 475, 575, 95, 130))
    C = np.exp(-ellipse_r(x, y, 420, 770, 150, 110) ** 2)

    tail_all = T * nr
    b = nr * (1 - T)
    head_all = H * b
    jaw_all = head_all * J
    head_rest = head_all * (1 - J)
    cb = b * (1 - H)
    nl = near_raw * (1 - R)
    fl = far_raw * (1 - R)
    return dict(root=R, settle=np.zeros_like(x),
                body=cb * (1 - C), chest=cb * C,
                head=head_rest * (1 - E), ear=head_rest * E,
                jaw=jaw_all * (1 - Tg), tongue=jaw_all * Tg,
                tail=tail_all * (1 - TT), tail_tip=tail_all * TT,
                fore_near=nl * (1 - near_paw), paw_near=nl * near_paw,
                fore_far=fl * (1 - far_paw), paw_far=fl * far_paw)


# ============================================================ standing -> bow bend rig
# The standing drawing (golden_retriever_happy.png) rigged so it can BEND into the
# play bow: hips, body, head (+ear/jaw/tongue), tail, and per front leg an upper arm
# (shoulder), forearm (elbow) and paw (wrist).  Hind lower legs stay on root.
BEND_PIVOTS = {
    "root":     (760, 1045),
    "hips":     (1100, 620),
    "body":     (800, 600),
    "head":     (540, 450),
    "ear":      (440, 185),
    "jaw":      (285, 305),
    "tongue":   (228, 352),
    "tail":     (1115, 580),
    "tail_tip": (1255, 420),
    "n_upper":  (540, 690),    # near (right-hand) front leg: shoulder
    "n_fore":   (545, 770),    #   elbow (short upper arm: it tucks under the chest in a bow)
    "n_paw":    (525, 955),    #   wrist
    "f_upper":  (420, 700),    # far (left-hand) front leg
    "f_fore":   (418, 780),
    "f_paw":    (405, 950),
}
BEND_PARENTS = {
    "root": None, "hips": "root", "body": "hips", "head": "body", "ear": "head",
    "jaw": "head", "tongue": "jaw", "tail": "hips", "tail_tip": "tail",
    "n_upper": "body", "n_fore": "n_upper", "n_paw": "n_fore",
    "f_upper": "body", "f_fore": "f_upper", "f_paw": "f_fore",
}


def bend_weights(x, y):
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    base = weights(x, y)                       # head/jaw/tongue/ear/tail split reused
    hind = ss(800, 830, x) * (1 - ss(1270, 1300, x)) * ss(760, 920, y)
    R = np.maximum(hind, ss(985, 1010, y) * ss(780, 820, x))   # hind paws + ground

    # front legs: near = right of the near leg's left outline, far = left of it
    near_left = np.interp(y, [620, 739, 796, 931, 1000], [411, 436, 461, 468, 405])
    is_near = ss(-6, 6, x - near_left + 4)
    paw_split = ss(398, 412, x)                # paw level: near paw from x~405
    is_near = np.where(y > 940, paw_split, is_near)
    left_edge = np.where(y > 905, 250.0, 345.0)        # the far paw reaches left to x~295
    col = ss(left_edge, left_edge + 20, x) * (1 - ss(640, 700, x))
    leg = col * ss(690, 760, y) * (1 - R)
    upper_s = 1 - ss(735, 825, y)              # upper arm above the elbow (~y 770); wide crease
    paw_s = ss(930, 960, y)
    fore_s = 1 - upper_s - paw_s
    nl, fl = leg * is_near, leg * (1 - is_near)

    rest = 1 - R - leg
    T = base["tail"] + base["tail_tip"]
    tail_frac = np.where(T > 0, base["tail_tip"] / np.maximum(T, 1e-9), 0)
    head_all = base["head"] + base["ear"] + base["jaw"] + base["tongue"]
    # renormalise the base split over what's left after root + legs
    tot = np.maximum(1 - base["root"], 1e-9)
    t_share = np.clip(T / tot, 0, 1)
    h_share = np.clip(head_all / tot, 0, 1)
    tail_all = rest * t_share
    head_part = rest * h_share
    body = rest - tail_all - head_part
    hs = np.maximum(head_all, 1e-9)
    hips = body * ss(880, 1080, x)             # rear half of the torso follows the hips
    return dict(
        root=R, hips=hips, body=body - hips,
        head=head_part * base["head"] / hs, ear=head_part * base["ear"] / hs,
        jaw=head_part * base["jaw"] / hs, tongue=head_part * base["tongue"] / hs,
        tail=tail_all * (1 - tail_frac), tail_tip=tail_all * tail_frac,
        n_upper=nl * upper_s, n_fore=nl * fore_s, n_paw=nl * paw_s,
        f_upper=fl * upper_s, f_fore=fl * fore_s, f_paw=fl * paw_s)
