"""Matching points: standing drawing (golden_retriever_happy.png) -> bow drawing
(golden_retriever_bow.png), both in texture px (y down).  BOW_OFFSET places the
bow drawing in the standing drawing's frame (back paws roughly in place)."""
BOW_OFFSET = (-115, 75)

# Front-leg joints in the BOW drawing (bow px, before BOW_OFFSET): the standing dog's
# legs are posed so its elbow/wrist land here, and its paws stay flat throughout.
BOW_JOINTS = {
    "near": {"elbow": (640, 900), "wrist": (380, 945)},
    "far":  {"elbow": (450, 830), "wrist": (210, 895)},
}

PAIRS = [
    # head
    ((40, 245), (42, 520)), ((265, 215), (270, 495)), ((270, 300), (270, 575)),
    ((130, 445), (130, 720)), ((470, 435), (470, 700)), ((360, 50), (360, 345)),
    ((595, 280), (600, 530)), ((255, 430), (255, 695)),
    # back line, neck -> tail junction
    ((675, 410), (700, 530)), ((800, 432), (825, 460)), ((925, 422), (952, 374)),
    ((1050, 445), (1076, 342)), ((1100, 470), (1127, 351)),
    # tail
    ((1344, 264), (1202, 45)), ((1440, 451), (1440, 270)), ((1300, 689), (1290, 495)),
    ((1400, 330), (1405, 110)), ((1250, 400), (1255, 255)), ((1180, 462), (1185, 350)),
    ((1150, 657), (1225, 478)),
    # rear thigh outline
    ((1137, 670), (1238, 540)), ((1231, 820), (1321, 714)),
    # hind legs / paws
    ((950, 1040), (1070, 945)), ((855, 990), (995, 905)), ((1170, 1048), (1280, 975)),
    ((1255, 1010), (1360, 940)), ((900, 860), (1010, 830)), ((830, 720), (960, 700)),
    # chest / belly
    ((240, 520), (275, 790)), ((330, 690), (320, 860)), ((700, 775), (800, 905)),
    ((630, 780), (690, 975)),
    # near front leg (right-hand leg in the standing drawing)
    ((495, 1045), (310, 980)), ((405, 995), (215, 935)), ((590, 1000), (410, 960)),
    ((465, 870), (430, 865)), ((625, 860), (640, 925)),
    # far front leg (left-hand leg)
    ((370, 1035), (130, 957)), ((300, 985), (50, 912)), ((368, 850), (230, 820)),
]


def in_front_legs(p):
    """Standing-drawing px inside the front legs: their shape is set by the leg bones,
    so outline matching is skipped there."""
    return p[1] > 690 and p[0] < 690
