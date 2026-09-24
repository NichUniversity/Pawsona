import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, PanResponder, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";

import { PressableScale } from "../ui/PressableScale";
import { usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";

import { MinigameShell } from "./MinigameShell";
import { sharedGameStyles } from "./sharedGameStyles";

// --- Tight Squeeze: guide the paw through a glowing cave tunnel ---
// Each level is a painted cave image with a traced centerline route. The
// player drags the paw (or uses the D-pad) from the route's first point to
// its last. Touching a wall (or a falling rock) ends the run; clearing the
// last level wins it.
//
// Coordinates: every level is authored in its image's own pixel space
// (baseWidth x baseHeight). The image and the SVG overlay are stretched
// non-uniformly to fill the play area, so all route/collision math stays in
// that fixed design space and only on-screen positions/drag deltas get
// converted via scaleX/scaleY (see computeLayout).

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

// Touch must start within this many screen px of the paw to grab it.
const TS_GRAB_RADIUS = 36;
// D-pad movement speed, in screen px per second.
const TS_DPAD_SPEED = 140;
// Paid once when the run ends (win or lose).
const TS_COINS_PER_LEVEL_CLEARED = 2;
// Minimum play-area size, and the fallback before it's been measured.
const TS_MIN_TRACK_WIDTH = 220;
const TS_MIN_TRACK_HEIGHT = 280;
// Level-complete card entrance animation length.
const TS_LEVEL_CARD_IN_MS = 260;
// Pool of animated rock lanes (more than any level uses).
const TS_ROCK_POOL_SIZE = 6;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TSPoint = { x: number; y: number };
type TSGesture = { dx: number; dy: number };

// A rock lane: falls from TS_ROCK_FALL_TOP to TS_ROCK_FALL_BOTTOM at a fixed
// x every `period` ms, offset by `phase` (0..1) so lanes don't fall together.
type TSFallingRock = { x: number; radius: number; period: number; phase: number };

type TSLevelDesign = {
  label: string;
  instructions: string;
  backgroundImage: number; // require()'d image asset
  baseWidth: number; // image pixel size = design space
  baseHeight: number;
  points: TSPoint[]; // tunnel centerline; points[0] = start, last = finish
  halfWidth: number; // tunnel half-width around the centerline
  boneRadius: number; // paw's collision radius (eats into halfWidth)
  minAllowedHalfWidth: number; // floor so the corridor never collapses
  finishRadius: number; // how close to the last point counts as finished
  fallingRocks?: TSFallingRock[];
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function buildPathString(points: TSPoint[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

// Shortest distance from p to segment a-b.
function distanceToSegment(p: TSPoint, a: TSPoint, b: TSPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Inside the tunnel = within allowedHalfWidth of ANY segment. Cheap and
// handles the joints correctly; a player could in theory cut a tight corner
// while staying inside another segment's corridor, which is fine here.
function isInsideTunnel(p: TSPoint, points: TSPoint[], allowedHalfWidth: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (distanceToSegment(p, points[i], points[i + 1]) <= allowedHalfWidth) return true;
  }
  return false;
}

function computeLayout(trackWidth: number, trackHeight: number, design: TSLevelDesign) {
  const width = Math.max(TS_MIN_TRACK_WIDTH, trackWidth);
  const height = Math.max(TS_MIN_TRACK_HEIGHT, trackHeight);
  return {
    width,
    height,
    scaleX: width / design.baseWidth,
    scaleY: height / design.baseHeight,
  };
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
// Routes were traced from each image: threshold the lit tunnel (luminance >
// 200, largest connected region), take its centerline, smooth and resample.
// To add a level: drop in the image, trace its route the same way, and
// append a design to TS_LEVELS. Only level 1's art keeps the painted
// START/FINISH labels; later levels use "-nolabels" copies.

// Max design-space px between collision samples along one move (see
// attemptMoveBoneTo); well under the thinnest rock wall between tunnel parts.
const TS_SWEEP_STEP = 6;

const TS_CAVE_BASE_WIDTH = 941;
const TS_CAVE_BASE_HEIGHT = 1672;

// Shared tuning for the cave levels.
const TS_CAVE_COMMON = {
  baseWidth: TS_CAVE_BASE_WIDTH,
  baseHeight: TS_CAVE_BASE_HEIGHT,
  boneRadius: 11,
  minAllowedHalfWidth: 9,
  finishRadius: 60,
};

// Level 1 art (tight-squeeze-cave-crawl.png, 941x1672): straight tunnel,
// walls traced at y ~801-808 (top) and ~879-890 (bottom), so centered at
// y ~844 with a ~37px half-height.
const TS_CRAWL_PATH: TSPoint[] = Array.from({ length: 44 }, (_, i) => ({
  x: 40 + (i * (900 - 40)) / 43,
  y: 844,
}));

const TS_CAVE_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Cave Crawl",
  instructions: "Drag the paw through the glowing tunnel from START to FINISH. Don't scrape the cave walls!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-crawl.png"),
  points: TS_CRAWL_PATH,
  halfWidth: 37,
};

// Level 2 - gentle S-curve (tight-squeeze-cave-wave2.png, 941x1672). Traced
// from the lit tunnel; every route point is >= ~35px from a wall (median
// ~38), so halfWidth 34 keeps the paw fully inside the glow.
const TS_WAVE_PATH: TSPoint[] = [
  { x: 42.0, y: 744.2 },
  { x: 56.0, y: 744.7 },
  { x: 69.9, y: 744.2 },
  { x: 83.9, y: 744.5 },
  { x: 97.9, y: 743.8 },
  { x: 111.9, y: 743.9 },
  { x: 125.9, y: 744.1 },
  { x: 139.9, y: 744.7 },
  { x: 153.8, y: 746.0 },
  { x: 167.8, y: 747.1 },
  { x: 181.4, y: 750.4 },
  { x: 194.4, y: 755.5 },
  { x: 207.7, y: 760.0 },
  { x: 220.8, y: 764.7 },
  { x: 233.3, y: 771.0 },
  { x: 246.2, y: 776.6 },
  { x: 258.5, y: 783.2 },
  { x: 270.7, y: 790.2 },
  { x: 282.6, y: 797.5 },
  { x: 294.2, y: 805.3 },
  { x: 305.6, y: 813.4 },
  { x: 317.4, y: 821.0 },
  { x: 328.8, y: 829.1 },
  { x: 340.2, y: 837.2 },
  { x: 352.2, y: 844.5 },
  { x: 364.3, y: 851.5 },
  { x: 376.5, y: 858.3 },
  { x: 388.5, y: 865.4 },
  { x: 401.3, y: 871.2 },
  { x: 414.6, y: 875.5 },
  { x: 427.9, y: 880.0 },
  { x: 441.0, y: 884.8 },
  { x: 454.3, y: 889.4 },
  { x: 467.8, y: 893.0 },
  { x: 481.6, y: 895.1 },
  { x: 495.5, y: 896.1 },
  { x: 509.4, y: 898.2 },
  { x: 523.3, y: 899.5 },
  { x: 537.3, y: 899.9 },
  { x: 551.3, y: 899.3 },
  { x: 565.3, y: 899.3 },
  { x: 579.3, y: 898.8 },
  { x: 593.2, y: 897.9 },
  { x: 607.1, y: 896.3 },
  { x: 620.9, y: 893.8 },
  { x: 634.8, y: 892.2 },
  { x: 648.5, y: 889.4 },
  { x: 662.1, y: 886.0 },
  { x: 675.6, y: 882.2 },
  { x: 689.0, y: 878.3 },
  { x: 702.1, y: 873.4 },
  { x: 715.3, y: 868.6 },
  { x: 728.1, y: 863.0 },
  { x: 741.0, y: 857.5 },
  { x: 754.2, y: 852.9 },
  { x: 767.0, y: 847.2 },
  { x: 779.8, y: 841.6 },
  { x: 792.9, y: 836.5 },
  { x: 806.2, y: 832.3 },
  { x: 819.6, y: 828.1 },
  { x: 833.0, y: 824.2 },
  { x: 846.7, y: 821.3 },
  { x: 860.6, y: 820.0 },
  { x: 874.6, y: 819.2 },
  { x: 888.6, y: 819.0 },
  { x: 902.6, y: 818.3 }
];

const TS_WAVE_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Winding Tunnel",
  instructions: "Follow the tunnel as it dips down and curves back up to the far side. Careful on the bends!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-wave2.png"),
  points: TS_WAVE_PATH,
  halfWidth: 34,
};

// Level 3 - zigzag tunnel (tight-squeeze-cave-zigzag.png, 941x1672): two
// steps down with vertical drops. Traced along the tunnel's distance-transform
// ridge (per-column midpoints don't work on vertical sections). Clearance is
// >= 28px (median 32; the narrowest spot is the first drop at x ~279), so
// halfWidth 28 is the tightest squeeze so far.
const TS_ZIGZAG_PATH: TSPoint[] = [
  { x: 32.2, y: 561.0 },
  { x: 46.2, y: 561.4 },
  { x: 60.2, y: 561.8 },
  { x: 74.1, y: 561.2 },
  { x: 88.1, y: 560.5 },
  { x: 102.1, y: 559.5 },
  { x: 116.1, y: 559.0 },
  { x: 130.1, y: 559.0 },
  { x: 144.1, y: 559.0 },
  { x: 158.1, y: 559.0 },
  { x: 172.1, y: 559.0 },
  { x: 186.1, y: 559.0 },
  { x: 200.1, y: 559.1 },
  { x: 214.0, y: 560.3 },
  { x: 227.7, y: 563.3 },
  { x: 240.5, y: 568.8 },
  { x: 251.9, y: 577.0 },
  { x: 261.2, y: 587.3 },
  { x: 267.6, y: 599.8 },
  { x: 271.4, y: 613.2 },
  { x: 274.5, y: 626.9 },
  { x: 276.4, y: 640.7 },
  { x: 277.5, y: 654.7 },
  { x: 278.3, y: 668.7 },
  { x: 278.9, y: 682.7 },
  { x: 279.3, y: 696.7 },
  { x: 280.5, y: 710.6 },
  { x: 282.3, y: 724.5 },
  { x: 284.5, y: 738.3 },
  { x: 288.1, y: 751.8 },
  { x: 294.3, y: 764.3 },
  { x: 303.2, y: 775.1 },
  { x: 314.5, y: 783.4 },
  { x: 327.5, y: 788.3 },
  { x: 341.4, y: 790.1 },
  { x: 355.3, y: 791.4 },
  { x: 369.3, y: 792.0 },
  { x: 383.3, y: 792.0 },
  { x: 397.3, y: 792.0 },
  { x: 411.3, y: 792.0 },
  { x: 425.3, y: 791.8 },
  { x: 439.3, y: 791.2 },
  { x: 453.3, y: 790.7 },
  { x: 467.3, y: 789.8 },
  { x: 481.1, y: 788.0 },
  { x: 494.4, y: 783.7 },
  { x: 506.3, y: 776.3 },
  { x: 516.3, y: 766.6 },
  { x: 524.3, y: 755.1 },
  { x: 530.8, y: 742.7 },
  { x: 537.4, y: 730.4 },
  { x: 545.0, y: 718.6 },
  { x: 554.4, y: 708.3 },
  { x: 565.7, y: 700.0 },
  { x: 578.8, y: 695.4 },
  { x: 592.5, y: 692.5 },
  { x: 606.5, y: 691.3 },
  { x: 620.5, y: 691.3 },
  { x: 634.4, y: 692.4 },
  { x: 648.4, y: 693.4 },
  { x: 662.3, y: 694.4 },
  { x: 675.8, y: 697.9 },
  { x: 688.3, y: 704.2 },
  { x: 699.1, y: 713.2 },
  { x: 707.2, y: 724.5 },
  { x: 712.4, y: 737.5 },
  { x: 715.8, y: 751.1 },
  { x: 717.6, y: 764.9 },
  { x: 718.6, y: 778.9 },
  { x: 719.0, y: 792.9 },
  { x: 719.0, y: 806.9 },
  { x: 719.5, y: 820.9 },
  { x: 720.3, y: 834.9 },
  { x: 721.6, y: 848.8 },
  { x: 723.4, y: 862.7 },
  { x: 726.1, y: 876.4 },
  { x: 730.6, y: 889.6 },
  { x: 738.0, y: 901.5 },
  { x: 748.4, y: 910.8 },
  { x: 761.0, y: 916.7 },
  { x: 774.6, y: 920.2 },
  { x: 788.4, y: 922.1 },
  { x: 802.4, y: 922.9 },
  { x: 816.4, y: 923.0 },
  { x: 830.4, y: 922.7 },
  { x: 844.4, y: 922.1 },
  { x: 858.4, y: 922.0 },
  { x: 872.4, y: 922.0 },
  { x: 886.4, y: 921.7 },
  { x: 900.4, y: 921.1 }
];

const TS_ZIGZAG_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Zigzag",
  instructions: "The tunnel drops down twice. Slow down on the sharp corners and keep the paw off the walls!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-zigzag.png"),
  points: TS_ZIGZAG_PATH,
  halfWidth: 28,
};

// Level 4 - Rockfall: level 1's straight tunnel with its START/FINISH labels
// painted out (tight-squeeze-cave-crawl-nolabels.png: each label box was
// refilled row by row from the clean rock on either side, so the shading
// gradient above the tunnel carries straight through), plus three rock lanes.
// Each rock takes ~0.7s to cross the tunnel and is clear for ~1.3s, leaving a
// window to dash under.
const TS_ROCK_FALL_TOP = 650;
const TS_ROCK_FALL_BOTTOM = 1050;

const TS_ROCKFALL_DESIGN: TSLevelDesign = {
  ...TS_CAVE_DESIGN,
  label: "Rockfall",
  instructions: "Rocks are falling through the tunnel! Time your dash under each one. Touch a rock or a wall and it's game over.",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-crawl-nolabels.png"),
  fallingRocks: [
    { x: 250, radius: 26, period: 1900, phase: 0.0 },
    { x: 470, radius: 26, period: 2200, phase: 0.45 },
    { x: 690, radius: 26, period: 2000, phase: 0.8 },
  ],
};

// Level 5 - double wave (tight-squeeze-cave-crystal.png, 941x1672, blue
// crystal decorations): dips down, rises, then drops again to the exit.
// Traced along the distance-transform ridge like level 3. Clearance is
// >= 33.6px (median 37; narrowest at the first dip, x ~183), so halfWidth 33.
const TS_CRYSTAL_PATH: TSPoint[] = [
  { x: 32.2, y: 735.0 },
  { x: 46.2, y: 735.0 },
  { x: 60.2, y: 735.0 },
  { x: 74.2, y: 734.5 },
  { x: 88.1, y: 734.0 },
  { x: 102.1, y: 734.2 },
  { x: 116.1, y: 735.4 },
  { x: 130.0, y: 737.0 },
  { x: 143.7, y: 739.9 },
  { x: 156.0, y: 746.4 },
  { x: 166.6, y: 755.5 },
  { x: 175.5, y: 766.3 },
  { x: 183.3, y: 777.9 },
  { x: 190.3, y: 790.0 },
  { x: 196.7, y: 802.5 },
  { x: 203.5, y: 814.7 },
  { x: 211.0, y: 826.5 },
  { x: 219.3, y: 837.8 },
  { x: 228.6, y: 848.3 },
  { x: 238.8, y: 857.8 },
  { x: 250.3, y: 865.9 },
  { x: 262.9, y: 871.8 },
  { x: 276.5, y: 875.4 },
  { x: 290.3, y: 877.1 },
  { x: 304.3, y: 878.0 },
  { x: 318.3, y: 878.7 },
  { x: 332.2, y: 880.0 },
  { x: 346.2, y: 881.5 },
  { x: 360.1, y: 881.9 },
  { x: 374.1, y: 881.1 },
  { x: 388.1, y: 880.0 },
  { x: 402.0, y: 878.6 },
  { x: 415.4, y: 874.8 },
  { x: 428.4, y: 869.6 },
  { x: 440.9, y: 863.3 },
  { x: 452.7, y: 855.7 },
  { x: 463.9, y: 847.3 },
  { x: 474.7, y: 838.5 },
  { x: 485.5, y: 829.4 },
  { x: 496.1, y: 820.4 },
  { x: 507.1, y: 811.7 },
  { x: 518.8, y: 804.0 },
  { x: 531.0, y: 797.2 },
  { x: 543.9, y: 791.8 },
  { x: 557.3, y: 787.7 },
  { x: 571.0, y: 784.8 },
  { x: 585.0, y: 784.1 },
  { x: 599.0, y: 784.5 },
  { x: 613.0, y: 785.0 },
  { x: 627.0, y: 785.0 },
  { x: 641.0, y: 785.2 },
  { x: 654.8, y: 787.2 },
  { x: 667.9, y: 792.1 },
  { x: 680.0, y: 799.1 },
  { x: 691.2, y: 807.4 },
  { x: 701.5, y: 817.0 },
  { x: 710.9, y: 827.3 },
  { x: 720.2, y: 837.8 },
  { x: 730.0, y: 847.8 },
  { x: 740.3, y: 857.2 },
  { x: 751.5, y: 865.7 },
  { x: 764.0, y: 871.7 },
  { x: 777.6, y: 875.0 },
  { x: 791.5, y: 876.8 },
  { x: 805.5, y: 877.6 },
  { x: 819.5, y: 878.0 },
  { x: 833.5, y: 878.0 },
  { x: 847.5, y: 877.8 },
  { x: 861.5, y: 877.2 },
  { x: 875.5, y: 877.0 },
  { x: 889.5, y: 877.0 },
  { x: 903.5, y: 877.0 }
];

const TS_CRYSTAL_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Crystal Passage",
  instructions: "Ride the tunnel down, up, and down again past the crystals. Don't touch the walls!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-crystal.png"),
  points: TS_CRYSTAL_PATH,
  halfWidth: 33,
};

// Level 6 - vertical climb (tight-squeeze-cave-vertical.png, 941x1672):
// start at the BOTTOM, finish at the TOP. This art's tunnel is a darker
// amber (luminance ~194), so it was masked by red channel > 200 instead of
// luminance > 200, then traced along the distance-transform ridge. Clearance
// is >= 52px (median 54), so halfWidth 50. The start sits at y ~1560 rather
// than the very bottom edge to keep it clear of the iPhone home-swipe zone.
const TS_VERTICAL_PATH: TSPoint[] = [
  { x: 474.4, y: 1554.9 },
  { x: 474.0, y: 1540.9 },
  { x: 474.0, y: 1526.9 },
  { x: 474.0, y: 1512.9 },
  { x: 474.2, y: 1498.9 },
  { x: 474.8, y: 1484.9 },
  { x: 475.0, y: 1470.9 },
  { x: 475.0, y: 1456.9 },
  { x: 475.0, y: 1442.9 },
  { x: 475.0, y: 1428.9 },
  { x: 475.0, y: 1414.9 },
  { x: 474.7, y: 1400.9 },
  { x: 474.1, y: 1386.9 },
  { x: 474.0, y: 1372.9 },
  { x: 474.3, y: 1358.9 },
  { x: 474.9, y: 1344.9 },
  { x: 475.0, y: 1330.9 },
  { x: 475.0, y: 1316.9 },
  { x: 474.9, y: 1302.9 },
  { x: 474.3, y: 1288.9 },
  { x: 474.0, y: 1274.9 },
  { x: 474.0, y: 1260.9 },
  { x: 474.0, y: 1246.9 },
  { x: 474.0, y: 1232.9 },
  { x: 474.2, y: 1218.9 },
  { x: 474.8, y: 1205.0 },
  { x: 475.0, y: 1191.0 },
  { x: 475.0, y: 1177.0 },
  { x: 475.0, y: 1163.0 },
  { x: 474.8, y: 1149.0 },
  { x: 474.1, y: 1135.0 },
  { x: 474.0, y: 1121.0 },
  { x: 474.0, y: 1107.0 },
  { x: 474.0, y: 1093.0 },
  { x: 474.2, y: 1079.0 },
  { x: 475.0, y: 1065.0 },
  { x: 476.1, y: 1051.0 },
  { x: 476.9, y: 1037.1 },
  { x: 477.0, y: 1023.1 },
  { x: 476.7, y: 1009.1 },
  { x: 475.6, y: 995.1 },
  { x: 474.8, y: 981.1 },
  { x: 474.2, y: 967.1 },
  { x: 474.0, y: 953.1 },
  { x: 474.0, y: 939.1 },
  { x: 474.5, y: 925.2 },
  { x: 475.0, y: 911.2 },
  { x: 475.0, y: 897.2 },
  { x: 475.0, y: 883.2 },
  { x: 475.0, y: 869.2 },
  { x: 475.0, y: 855.2 },
  { x: 475.0, y: 841.2 },
  { x: 475.0, y: 827.2 },
  { x: 475.0, y: 813.2 },
  { x: 475.0, y: 799.2 },
  { x: 475.0, y: 785.2 },
  { x: 475.0, y: 771.2 },
  { x: 475.0, y: 757.2 },
  { x: 475.0, y: 743.2 },
  { x: 475.0, y: 729.2 },
  { x: 475.0, y: 715.2 },
  { x: 475.0, y: 701.2 },
  { x: 475.0, y: 687.2 },
  { x: 475.0, y: 673.2 },
  { x: 475.0, y: 659.2 },
  { x: 475.0, y: 645.2 },
  { x: 474.9, y: 631.2 },
  { x: 474.3, y: 617.2 },
  { x: 473.4, y: 603.2 },
  { x: 473.0, y: 589.2 },
  { x: 473.2, y: 575.2 },
  { x: 473.9, y: 561.2 },
  { x: 474.8, y: 547.3 },
  { x: 475.7, y: 533.3 },
  { x: 476.0, y: 519.3 },
  { x: 476.0, y: 505.3 },
  { x: 476.0, y: 491.3 },
  { x: 476.0, y: 477.3 },
  { x: 476.0, y: 463.3 },
  { x: 476.0, y: 449.3 },
  { x: 476.0, y: 435.3 },
  { x: 476.0, y: 421.3 },
  { x: 476.0, y: 407.3 },
  { x: 475.9, y: 393.3 },
  { x: 475.2, y: 379.3 },
  { x: 474.6, y: 365.3 },
  { x: 474.0, y: 351.3 },
  { x: 473.3, y: 337.4 },
  { x: 473.0, y: 323.4 },
  { x: 473.0, y: 309.4 },
  { x: 473.0, y: 295.4 },
  { x: 473.2, y: 281.4 },
  { x: 473.8, y: 267.4 },
  { x: 474.0, y: 253.4 },
  { x: 474.0, y: 239.4 },
  { x: 474.0, y: 225.4 },
  { x: 474.0, y: 211.4 },
  { x: 474.0, y: 197.4 },
  { x: 474.0, y: 183.4 },
  { x: 474.0, y: 169.4 },
  { x: 474.0, y: 155.4 },
  { x: 474.0, y: 141.4 },
  { x: 474.0, y: 127.4 },
  { x: 474.0, y: 113.4 },
  { x: 474.0, y: 99.4 },
  { x: 474.0, y: 85.4 },
  { x: 474.0, y: 71.4 },
  { x: 474.0, y: 57.4 },
  { x: 474.0, y: 43.4 }
];

const TS_VERTICAL_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Climb",
  instructions: "Climb straight up the shaft from the bottom to the top. Keep the paw centered!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-vertical.png"),
  points: TS_VERTICAL_PATH,
  halfWidth: 50,
};

// Level 7 - corner turn (tight-squeeze-cave-corner.png, 941x1672): climb
// up from the bottom, turn right at the top-left bend (y ~470), exit on the
// right edge. Masked by red channel > 200 like level 6, traced along the
// distance-transform ridge. Clearance >= 47px (median 51; narrowest just
// past the bend, x ~516), so halfWidth 46. Start kept at y ~1555, clear of
// the home-swipe zone.
const TS_CORNER_PATH: TSPoint[] = [
  { x: 387.0, y: 1554.8 },
  { x: 387.0, y: 1540.8 },
  { x: 387.0, y: 1526.8 },
  { x: 387.0, y: 1512.8 },
  { x: 387.0, y: 1498.8 },
  { x: 387.0, y: 1484.8 },
  { x: 387.0, y: 1470.8 },
  { x: 387.0, y: 1456.8 },
  { x: 387.0, y: 1442.8 },
  { x: 387.0, y: 1428.8 },
  { x: 387.0, y: 1414.8 },
  { x: 387.0, y: 1400.8 },
  { x: 387.0, y: 1386.8 },
  { x: 387.0, y: 1372.8 },
  { x: 387.0, y: 1358.8 },
  { x: 387.0, y: 1344.8 },
  { x: 387.0, y: 1330.8 },
  { x: 387.0, y: 1316.8 },
  { x: 387.0, y: 1302.8 },
  { x: 387.0, y: 1288.8 },
  { x: 387.0, y: 1274.8 },
  { x: 387.0, y: 1260.8 },
  { x: 387.0, y: 1246.8 },
  { x: 387.0, y: 1232.8 },
  { x: 387.0, y: 1218.8 },
  { x: 387.0, y: 1204.8 },
  { x: 387.0, y: 1190.8 },
  { x: 387.0, y: 1176.8 },
  { x: 386.9, y: 1162.8 },
  { x: 386.3, y: 1148.8 },
  { x: 386.0, y: 1134.8 },
  { x: 386.0, y: 1120.8 },
  { x: 386.0, y: 1106.8 },
  { x: 386.3, y: 1092.8 },
  { x: 387.4, y: 1078.9 },
  { x: 388.4, y: 1064.9 },
  { x: 389.0, y: 1050.9 },
  { x: 388.8, y: 1036.9 },
  { x: 388.2, y: 1022.9 },
  { x: 387.7, y: 1009.0 },
  { x: 386.9, y: 995.0 },
  { x: 386.1, y: 981.0 },
  { x: 386.0, y: 967.0 },
  { x: 386.0, y: 953.0 },
  { x: 386.3, y: 939.0 },
  { x: 387.2, y: 925.0 },
  { x: 387.9, y: 911.1 },
  { x: 388.0, y: 897.1 },
  { x: 388.0, y: 883.1 },
  { x: 387.9, y: 869.1 },
  { x: 387.2, y: 855.1 },
  { x: 387.0, y: 841.1 },
  { x: 387.0, y: 827.1 },
  { x: 387.7, y: 813.1 },
  { x: 389.0, y: 799.2 },
  { x: 389.9, y: 785.2 },
  { x: 390.0, y: 771.2 },
  { x: 389.9, y: 757.2 },
  { x: 389.3, y: 743.2 },
  { x: 389.0, y: 729.2 },
  { x: 389.0, y: 715.2 },
  { x: 389.0, y: 701.2 },
  { x: 389.0, y: 687.2 },
  { x: 389.0, y: 673.2 },
  { x: 389.2, y: 659.2 },
  { x: 389.8, y: 645.2 },
  { x: 390.0, y: 631.2 },
  { x: 390.0, y: 617.2 },
  { x: 390.0, y: 603.2 },
  { x: 390.0, y: 589.2 },
  { x: 390.7, y: 575.2 },
  { x: 392.6, y: 561.4 },
  { x: 395.8, y: 547.7 },
  { x: 400.4, y: 534.5 },
  { x: 406.7, y: 522.0 },
  { x: 414.7, y: 510.6 },
  { x: 424.2, y: 500.3 },
  { x: 435.1, y: 491.5 },
  { x: 447.2, y: 484.5 },
  { x: 460.2, y: 479.3 },
  { x: 473.7, y: 475.8 },
  { x: 487.6, y: 474.0 },
  { x: 501.5, y: 472.9 },
  { x: 515.5, y: 472.0 },
  { x: 529.5, y: 471.2 },
  { x: 543.5, y: 470.4 },
  { x: 557.5, y: 470.0 },
  { x: 571.5, y: 470.0 },
  { x: 585.5, y: 470.0 },
  { x: 599.5, y: 469.9 },
  { x: 613.4, y: 469.1 },
  { x: 627.4, y: 468.2 },
  { x: 641.4, y: 468.1 },
  { x: 655.4, y: 468.8 },
  { x: 669.3, y: 470.0 },
  { x: 683.3, y: 470.8 },
  { x: 697.3, y: 471.0 },
  { x: 711.3, y: 470.9 },
  { x: 725.3, y: 470.4 },
  { x: 739.3, y: 469.8 },
  { x: 753.3, y: 469.2 },
  { x: 767.3, y: 469.1 },
  { x: 781.2, y: 469.6 },
  { x: 795.2, y: 470.6 },
  { x: 809.2, y: 471.0 },
  { x: 823.2, y: 471.0 },
  { x: 837.2, y: 471.0 },
  { x: 851.2, y: 470.8 },
  { x: 865.2, y: 470.2 },
  { x: 879.2, y: 470.0 },
  { x: 893.2, y: 470.3 },
  { x: 907.2, y: 470.9 }
];

const TS_CORNER_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Corner",
  instructions: "Climb up the shaft, then take the sharp right turn at the top and squeeze out the far side!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-corner.png"),
  points: TS_CORNER_PATH,
  halfWidth: 46,
};

// Level 8 - serpentine climb (tight-squeeze-cave-serpent.png, 941x1672):
// start at the bottom, snake left-right up the screen through its hairpin
// bends, finish at the top-left. Masked by red channel > 200 like levels
// 6-7, traced along the distance-transform ridge. Clearance >= 48px (median
// ~54; narrowest at the middle-right bend, x ~507 y ~631), so halfWidth 46.
// Start kept at y ~1555, clear of the home-swipe zone.
const TS_SERPENT_PATH: TSPoint[] = [
  { x: 283.0, y: 1554.8 },
  { x: 283.0, y: 1540.8 },
  { x: 282.5, y: 1526.8 },
  { x: 282.0, y: 1512.8 },
  { x: 282.0, y: 1498.8 },
  { x: 282.0, y: 1484.8 },
  { x: 282.0, y: 1470.8 },
  { x: 282.0, y: 1456.8 },
  { x: 282.0, y: 1442.8 },
  { x: 281.7, y: 1428.8 },
  { x: 281.1, y: 1414.8 },
  { x: 281.0, y: 1400.8 },
  { x: 281.2, y: 1386.9 },
  { x: 282.3, y: 1372.9 },
  { x: 284.6, y: 1359.1 },
  { x: 288.4, y: 1345.6 },
  { x: 293.9, y: 1332.7 },
  { x: 301.4, y: 1321.0 },
  { x: 310.7, y: 1310.5 },
  { x: 321.0, y: 1301.0 },
  { x: 332.5, y: 1293.0 },
  { x: 345.0, y: 1286.9 },
  { x: 358.1, y: 1282.0 },
  { x: 371.7, y: 1278.4 },
  { x: 385.4, y: 1275.8 },
  { x: 399.3, y: 1273.9 },
  { x: 413.2, y: 1272.8 },
  { x: 427.2, y: 1272.0 },
  { x: 441.2, y: 1270.9 },
  { x: 455.1, y: 1269.5 },
  { x: 469.0, y: 1267.8 },
  { x: 482.9, y: 1266.2 },
  { x: 496.9, y: 1265.0 },
  { x: 510.8, y: 1264.1 },
  { x: 524.8, y: 1263.4 },
  { x: 538.8, y: 1262.4 },
  { x: 552.7, y: 1261.0 },
  { x: 566.5, y: 1258.8 },
  { x: 580.1, y: 1255.5 },
  { x: 593.4, y: 1251.1 },
  { x: 606.2, y: 1245.3 },
  { x: 617.9, y: 1237.7 },
  { x: 628.3, y: 1228.4 },
  { x: 637.8, y: 1218.1 },
  { x: 645.7, y: 1206.6 },
  { x: 651.7, y: 1193.9 },
  { x: 656.1, y: 1180.6 },
  { x: 659.2, y: 1167.0 },
  { x: 661.2, y: 1153.1 },
  { x: 662.3, y: 1139.2 },
  { x: 662.9, y: 1125.2 },
  { x: 663.0, y: 1111.2 },
  { x: 663.0, y: 1097.2 },
  { x: 663.1, y: 1083.2 },
  { x: 663.7, y: 1069.2 },
  { x: 664.0, y: 1055.2 },
  { x: 663.9, y: 1041.2 },
  { x: 663.0, y: 1027.3 },
  { x: 661.4, y: 1013.4 },
  { x: 658.5, y: 999.6 },
  { x: 654.2, y: 986.4 },
  { x: 647.9, y: 973.9 },
  { x: 639.3, y: 962.8 },
  { x: 629.2, y: 953.1 },
  { x: 617.8, y: 945.1 },
  { x: 605.3, y: 938.8 },
  { x: 592.1, y: 934.2 },
  { x: 578.5, y: 930.9 },
  { x: 564.6, y: 928.7 },
  { x: 550.7, y: 927.5 },
  { x: 536.7, y: 927.0 },
  { x: 522.7, y: 927.0 },
  { x: 508.7, y: 927.0 },
  { x: 494.7, y: 927.0 },
  { x: 480.7, y: 927.1 },
  { x: 466.7, y: 927.6 },
  { x: 452.7, y: 928.0 },
  { x: 438.7, y: 928.0 },
  { x: 424.7, y: 928.0 },
  { x: 410.7, y: 928.0 },
  { x: 396.7, y: 928.0 },
  { x: 382.7, y: 928.0 },
  { x: 368.7, y: 927.9 },
  { x: 354.8, y: 927.0 },
  { x: 340.9, y: 924.8 },
  { x: 327.4, y: 921.4 },
  { x: 314.2, y: 916.7 },
  { x: 301.7, y: 910.5 },
  { x: 290.3, y: 902.4 },
  { x: 280.2, y: 892.7 },
  { x: 271.3, y: 881.8 },
  { x: 264.4, y: 869.7 },
  { x: 259.5, y: 856.6 },
  { x: 256.1, y: 843.0 },
  { x: 254.0, y: 829.2 },
  { x: 253.1, y: 815.2 },
  { x: 253.0, y: 801.2 },
  { x: 253.0, y: 787.2 },
  { x: 253.0, y: 773.2 },
  { x: 253.0, y: 759.2 },
  { x: 253.1, y: 745.2 },
  { x: 253.7, y: 731.2 },
  { x: 255.7, y: 717.4 },
  { x: 259.0, y: 703.8 },
  { x: 263.8, y: 690.6 },
  { x: 270.5, y: 678.4 },
  { x: 279.2, y: 667.4 },
  { x: 289.1, y: 657.6 },
  { x: 300.4, y: 649.2 },
  { x: 312.8, y: 642.7 },
  { x: 325.9, y: 637.8 },
  { x: 339.4, y: 634.4 },
  { x: 353.2, y: 632.1 },
  { x: 367.2, y: 630.9 },
  { x: 381.2, y: 630.1 },
  { x: 395.2, y: 630.0 },
  { x: 409.2, y: 630.0 },
  { x: 423.2, y: 630.0 },
  { x: 437.2, y: 630.0 },
  { x: 451.2, y: 630.0 },
  { x: 465.2, y: 630.3 },
  { x: 479.1, y: 630.9 },
  { x: 493.1, y: 631.0 },
  { x: 507.1, y: 630.7 },
  { x: 521.1, y: 630.1 },
  { x: 535.1, y: 629.6 },
  { x: 549.1, y: 629.1 },
  { x: 563.1, y: 629.0 },
  { x: 577.1, y: 629.0 },
  { x: 591.1, y: 629.0 },
  { x: 605.1, y: 628.8 },
  { x: 619.1, y: 627.9 },
  { x: 632.9, y: 626.1 },
  { x: 646.6, y: 623.2 },
  { x: 660.0, y: 619.1 },
  { x: 672.8, y: 613.3 },
  { x: 684.4, y: 605.5 },
  { x: 694.7, y: 596.1 },
  { x: 703.9, y: 585.6 },
  { x: 711.3, y: 573.7 },
  { x: 716.6, y: 560.7 },
  { x: 720.3, y: 547.3 },
  { x: 722.7, y: 533.5 },
  { x: 723.9, y: 519.5 },
  { x: 724.5, y: 505.5 },
  { x: 725.0, y: 491.5 },
  { x: 725.0, y: 477.5 },
  { x: 725.0, y: 463.5 },
  { x: 725.0, y: 449.5 },
  { x: 725.0, y: 435.5 },
  { x: 724.9, y: 421.5 },
  { x: 724.4, y: 407.6 },
  { x: 723.9, y: 393.6 },
  { x: 723.1, y: 379.6 },
  { x: 721.7, y: 365.7 },
  { x: 719.3, y: 351.9 },
  { x: 715.7, y: 338.4 },
  { x: 710.5, y: 325.4 },
  { x: 703.6, y: 313.2 },
  { x: 694.8, y: 302.3 },
  { x: 684.7, y: 292.6 },
  { x: 673.6, y: 284.1 },
  { x: 661.4, y: 277.3 },
  { x: 648.4, y: 272.1 },
  { x: 634.9, y: 268.3 },
  { x: 621.2, y: 265.5 },
  { x: 607.4, y: 263.5 },
  { x: 593.4, y: 262.4 },
  { x: 579.4, y: 261.5 },
  { x: 565.4, y: 261.0 },
  { x: 551.4, y: 261.0 },
  { x: 537.4, y: 261.0 },
  { x: 523.4, y: 261.5 },
  { x: 509.5, y: 261.9 },
  { x: 495.5, y: 262.0 },
  { x: 481.5, y: 261.7 },
  { x: 467.5, y: 261.1 },
  { x: 453.5, y: 261.0 },
  { x: 439.5, y: 261.0 },
  { x: 425.5, y: 261.0 },
  { x: 411.5, y: 261.0 },
  { x: 397.5, y: 260.7 },
  { x: 383.5, y: 260.1 },
  { x: 369.5, y: 260.0 },
  { x: 355.5, y: 260.0 },
  { x: 341.5, y: 260.0 },
  { x: 327.5, y: 260.0 },
  { x: 313.5, y: 259.6 },
  { x: 299.5, y: 258.7 },
  { x: 285.6, y: 257.5 },
  { x: 271.7, y: 255.6 },
  { x: 258.0, y: 252.8 },
  { x: 244.6, y: 248.9 },
  { x: 231.6, y: 243.7 },
  { x: 219.2, y: 237.1 },
  { x: 207.9, y: 228.9 },
  { x: 197.7, y: 219.4 },
  { x: 188.4, y: 208.9 },
  { x: 180.6, y: 197.3 },
  { x: 174.5, y: 184.7 },
  { x: 169.9, y: 171.5 },
  { x: 166.7, y: 157.8 },
  { x: 164.7, y: 144.0 },
  { x: 163.8, y: 130.0 },
  { x: 163.1, y: 116.0 },
  { x: 163.0, y: 102.0 },
  { x: 163.0, y: 88.0 },
  { x: 163.0, y: 74.0 },
  { x: 163.0, y: 60.0 },
  { x: 163.0, y: 46.0 }
];

const TS_SERPENT_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Serpent",
  instructions: "Snake your way up through every hairpin bend to the top. Take the turns slow!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-serpent.png"),
  points: TS_SERPENT_PATH,
  halfWidth: 46,
};

// Level 9 - the maze (tight-squeeze-cave-maze.png, 941x1672): start at the
// bottom-right, wind through the whole tangle of switchbacks and finish at
// the top-left. Masked by red channel > 200, traced along the distance-
// transform ridge (370 points, the longest route). Clearance >= 42px (median
// ~45; narrowest at x ~594 y ~1054), so halfWidth 40. Non-adjacent parts of
// the route are >= ~129px apart, so the corridors never overlap. Start kept
// at y ~1555, clear of the home-swipe zone.
const TS_MAZE_PATH: TSPoint[] = [
  { x: 748.0, y: 1554.8 },
  { x: 748.0, y: 1540.8 },
  { x: 748.0, y: 1526.8 },
  { x: 748.0, y: 1512.8 },
  { x: 748.0, y: 1498.8 },
  { x: 748.0, y: 1484.8 },
  { x: 748.0, y: 1470.8 },
  { x: 748.0, y: 1456.8 },
  { x: 748.0, y: 1442.8 },
  { x: 747.6, y: 1428.8 },
  { x: 746.0, y: 1414.9 },
  { x: 742.2, y: 1401.5 },
  { x: 735.2, y: 1389.4 },
  { x: 725.5, y: 1379.4 },
  { x: 713.9, y: 1371.5 },
  { x: 700.9, y: 1366.5 },
  { x: 687.2, y: 1363.5 },
  { x: 673.3, y: 1362.2 },
  { x: 659.3, y: 1362.0 },
  { x: 645.3, y: 1362.0 },
  { x: 631.3, y: 1362.0 },
  { x: 617.3, y: 1362.0 },
  { x: 603.3, y: 1362.0 },
  { x: 589.3, y: 1362.0 },
  { x: 575.3, y: 1362.0 },
  { x: 561.3, y: 1362.0 },
  { x: 547.3, y: 1362.0 },
  { x: 533.3, y: 1362.0 },
  { x: 519.3, y: 1362.0 },
  { x: 505.3, y: 1362.0 },
  { x: 491.3, y: 1362.7 },
  { x: 477.5, y: 1364.9 },
  { x: 464.2, y: 1369.1 },
  { x: 451.9, y: 1375.9 },
  { x: 441.5, y: 1385.1 },
  { x: 432.7, y: 1396.0 },
  { x: 426.0, y: 1408.3 },
  { x: 420.0, y: 1420.9 },
  { x: 412.6, y: 1432.8 },
  { x: 403.1, y: 1443.1 },
  { x: 392.1, y: 1451.7 },
  { x: 379.4, y: 1457.7 },
  { x: 366.0, y: 1461.5 },
  { x: 352.1, y: 1463.5 },
  { x: 338.1, y: 1464.0 },
  { x: 324.1, y: 1464.0 },
  { x: 310.1, y: 1464.0 },
  { x: 296.1, y: 1464.0 },
  { x: 282.1, y: 1464.0 },
  { x: 268.1, y: 1464.0 },
  { x: 254.1, y: 1464.0 },
  { x: 240.1, y: 1464.0 },
  { x: 226.1, y: 1464.0 },
  { x: 212.2, y: 1463.6 },
  { x: 198.3, y: 1461.7 },
  { x: 184.7, y: 1458.2 },
  { x: 172.0, y: 1452.5 },
  { x: 160.8, y: 1444.1 },
  { x: 151.1, y: 1434.0 },
  { x: 143.6, y: 1422.3 },
  { x: 138.7, y: 1409.2 },
  { x: 136.0, y: 1395.4 },
  { x: 135.1, y: 1381.5 },
  { x: 135.0, y: 1367.5 },
  { x: 135.0, y: 1353.5 },
  { x: 135.0, y: 1339.5 },
  { x: 135.0, y: 1325.5 },
  { x: 135.4, y: 1311.5 },
  { x: 137.1, y: 1297.6 },
  { x: 140.6, y: 1284.1 },
  { x: 146.0, y: 1271.2 },
  { x: 153.8, y: 1259.5 },
  { x: 163.2, y: 1249.2 },
  { x: 173.8, y: 1240.0 },
  { x: 185.8, y: 1232.8 },
  { x: 198.9, y: 1228.0 },
  { x: 212.6, y: 1225.4 },
  { x: 226.6, y: 1224.2 },
  { x: 240.6, y: 1224.0 },
  { x: 254.6, y: 1223.5 },
  { x: 268.5, y: 1222.0 },
  { x: 282.1, y: 1218.8 },
  { x: 294.8, y: 1213.0 },
  { x: 305.8, y: 1204.4 },
  { x: 315.1, y: 1193.9 },
  { x: 321.7, y: 1181.6 },
  { x: 325.8, y: 1168.3 },
  { x: 328.0, y: 1154.4 },
  { x: 328.9, y: 1140.5 },
  { x: 329.0, y: 1126.5 },
  { x: 329.0, y: 1112.5 },
  { x: 329.0, y: 1098.5 },
  { x: 329.0, y: 1084.5 },
  { x: 329.0, y: 1070.5 },
  { x: 329.0, y: 1056.5 },
  { x: 329.0, y: 1042.5 },
  { x: 328.5, y: 1028.5 },
  { x: 327.0, y: 1014.6 },
  { x: 323.5, y: 1001.0 },
  { x: 316.2, y: 989.2 },
  { x: 306.0, y: 979.6 },
  { x: 293.8, y: 972.8 },
  { x: 280.3, y: 969.2 },
  { x: 266.4, y: 967.4 },
  { x: 252.4, y: 967.0 },
  { x: 238.4, y: 967.0 },
  { x: 224.4, y: 967.0 },
  { x: 210.4, y: 967.0 },
  { x: 196.4, y: 967.0 },
  { x: 182.4, y: 966.8 },
  { x: 168.5, y: 965.8 },
  { x: 154.7, y: 963.6 },
  { x: 141.3, y: 959.4 },
  { x: 129.2, y: 952.5 },
  { x: 118.9, y: 943.0 },
  { x: 111.1, y: 931.5 },
  { x: 106.5, y: 918.3 },
  { x: 104.1, y: 904.5 },
  { x: 103.2, y: 890.5 },
  { x: 103.0, y: 876.5 },
  { x: 103.0, y: 862.5 },
  { x: 103.0, y: 848.5 },
  { x: 103.0, y: 834.5 },
  { x: 103.0, y: 820.5 },
  { x: 103.0, y: 806.5 },
  { x: 103.0, y: 792.5 },
  { x: 103.0, y: 778.5 },
  { x: 103.0, y: 764.5 },
  { x: 103.0, y: 750.5 },
  { x: 103.0, y: 736.5 },
  { x: 103.0, y: 722.5 },
  { x: 103.0, y: 708.5 },
  { x: 103.1, y: 694.5 },
  { x: 104.3, y: 680.6 },
  { x: 107.1, y: 666.9 },
  { x: 111.9, y: 653.8 },
  { x: 119.0, y: 641.7 },
  { x: 128.3, y: 631.3 },
  { x: 139.0, y: 622.3 },
  { x: 151.2, y: 615.5 },
  { x: 164.4, y: 610.8 },
  { x: 178.1, y: 607.9 },
  { x: 192.0, y: 606.4 },
  { x: 206.0, y: 606.0 },
  { x: 220.0, y: 606.0 },
  { x: 234.0, y: 606.0 },
  { x: 248.0, y: 606.0 },
  { x: 262.0, y: 606.3 },
  { x: 275.9, y: 607.9 },
  { x: 289.4, y: 611.5 },
  { x: 301.6, y: 618.2 },
  { x: 311.9, y: 627.6 },
  { x: 320.0, y: 639.0 },
  { x: 324.6, y: 652.2 },
  { x: 326.6, y: 666.0 },
  { x: 327.0, y: 680.0 },
  { x: 327.0, y: 694.0 },
  { x: 327.0, y: 708.0 },
  { x: 327.0, y: 722.0 },
  { x: 327.0, y: 736.0 },
  { x: 327.0, y: 750.0 },
  { x: 327.6, y: 764.0 },
  { x: 329.1, y: 777.9 },
  { x: 332.0, y: 791.6 },
  { x: 337.4, y: 804.5 },
  { x: 345.6, y: 815.8 },
  { x: 355.8, y: 825.4 },
  { x: 367.7, y: 832.7 },
  { x: 381.0, y: 837.0 },
  { x: 394.8, y: 839.0 },
  { x: 408.8, y: 839.9 },
  { x: 422.8, y: 840.0 },
  { x: 436.8, y: 840.6 },
  { x: 450.7, y: 842.2 },
  { x: 464.3, y: 845.5 },
  { x: 476.9, y: 851.5 },
  { x: 487.7, y: 860.3 },
  { x: 496.7, y: 871.0 },
  { x: 502.9, y: 883.5 },
  { x: 506.4, y: 897.1 },
  { x: 507.8, y: 911.0 },
  { x: 508.0, y: 925.0 },
  { x: 508.0, y: 939.0 },
  { x: 508.0, y: 953.0 },
  { x: 508.2, y: 967.0 },
  { x: 509.2, y: 980.9 },
  { x: 511.3, y: 994.8 },
  { x: 515.2, y: 1008.2 },
  { x: 521.4, y: 1020.7 },
  { x: 530.2, y: 1031.6 },
  { x: 540.9, y: 1040.6 },
  { x: 553.2, y: 1047.2 },
  { x: 566.6, y: 1051.3 },
  { x: 580.4, y: 1053.5 },
  { x: 594.4, y: 1054.0 },
  { x: 608.4, y: 1054.0 },
  { x: 622.4, y: 1054.0 },
  { x: 636.4, y: 1054.0 },
  { x: 650.4, y: 1054.0 },
  { x: 664.4, y: 1054.0 },
  { x: 678.4, y: 1054.0 },
  { x: 692.4, y: 1054.0 },
  { x: 706.4, y: 1054.0 },
  { x: 720.4, y: 1054.0 },
  { x: 734.4, y: 1054.0 },
  { x: 748.4, y: 1054.0 },
  { x: 762.4, y: 1054.0 },
  { x: 776.4, y: 1054.0 },
  { x: 790.4, y: 1053.4 },
  { x: 804.1, y: 1050.8 },
  { x: 817.2, y: 1045.8 },
  { x: 828.6, y: 1037.7 },
  { x: 838.2, y: 1027.5 },
  { x: 845.2, y: 1015.5 },
  { x: 848.8, y: 1002.0 },
  { x: 849.8, y: 988.0 },
  { x: 848.8, y: 974.1 },
  { x: 845.5, y: 960.5 },
  { x: 839.1, y: 948.1 },
  { x: 829.7, y: 937.7 },
  { x: 818.2, y: 929.9 },
  { x: 805.1, y: 925.1 },
  { x: 791.3, y: 922.7 },
  { x: 777.3, y: 921.9 },
  { x: 763.4, y: 920.9 },
  { x: 749.6, y: 918.6 },
  { x: 736.3, y: 914.1 },
  { x: 724.4, y: 906.9 },
  { x: 714.3, y: 897.3 },
  { x: 706.4, y: 885.7 },
  { x: 701.4, y: 872.7 },
  { x: 698.9, y: 858.9 },
  { x: 698.1, y: 844.9 },
  { x: 698.0, y: 830.9 },
  { x: 698.0, y: 816.9 },
  { x: 698.0, y: 802.9 },
  { x: 698.0, y: 788.9 },
  { x: 697.3, y: 775.0 },
  { x: 695.4, y: 761.1 },
  { x: 691.7, y: 747.6 },
  { x: 685.3, y: 735.2 },
  { x: 676.1, y: 724.7 },
  { x: 665.2, y: 715.9 },
  { x: 652.7, y: 709.7 },
  { x: 639.1, y: 706.3 },
  { x: 625.3, y: 704.5 },
  { x: 611.3, y: 704.0 },
  { x: 597.3, y: 704.0 },
  { x: 583.3, y: 704.0 },
  { x: 569.3, y: 704.0 },
  { x: 555.3, y: 704.0 },
  { x: 541.3, y: 704.0 },
  { x: 527.3, y: 703.6 },
  { x: 513.4, y: 701.6 },
  { x: 500.0, y: 697.7 },
  { x: 487.8, y: 690.9 },
  { x: 477.5, y: 681.5 },
  { x: 469.4, y: 670.1 },
  { x: 464.1, y: 657.2 },
  { x: 461.4, y: 643.5 },
  { x: 460.2, y: 629.5 },
  { x: 460.0, y: 615.5 },
  { x: 460.0, y: 601.5 },
  { x: 460.0, y: 587.5 },
  { x: 460.0, y: 573.5 },
  { x: 460.0, y: 559.5 },
  { x: 460.0, y: 545.5 },
  { x: 460.0, y: 531.5 },
  { x: 460.6, y: 517.5 },
  { x: 462.3, y: 503.6 },
  { x: 465.9, y: 490.1 },
  { x: 472.1, y: 477.6 },
  { x: 480.9, y: 466.8 },
  { x: 491.6, y: 457.8 },
  { x: 504.0, y: 451.4 },
  { x: 517.5, y: 447.7 },
  { x: 531.4, y: 445.7 },
  { x: 545.3, y: 445.1 },
  { x: 559.3, y: 445.0 },
  { x: 573.3, y: 445.0 },
  { x: 587.3, y: 445.0 },
  { x: 601.3, y: 445.0 },
  { x: 615.3, y: 445.0 },
  { x: 629.3, y: 445.0 },
  { x: 643.3, y: 445.0 },
  { x: 657.3, y: 445.0 },
  { x: 671.3, y: 445.0 },
  { x: 685.3, y: 445.0 },
  { x: 699.3, y: 445.0 },
  { x: 713.3, y: 445.0 },
  { x: 727.3, y: 445.0 },
  { x: 741.3, y: 445.0 },
  { x: 755.3, y: 445.0 },
  { x: 769.3, y: 444.6 },
  { x: 783.2, y: 442.6 },
  { x: 796.6, y: 438.8 },
  { x: 809.1, y: 432.5 },
  { x: 819.9, y: 423.6 },
  { x: 829.1, y: 413.1 },
  { x: 835.8, y: 400.8 },
  { x: 839.7, y: 387.4 },
  { x: 841.6, y: 373.5 },
  { x: 842.0, y: 359.6 },
  { x: 842.0, y: 345.6 },
  { x: 842.0, y: 331.6 },
  { x: 842.0, y: 317.6 },
  { x: 842.0, y: 303.6 },
  { x: 842.0, y: 289.6 },
  { x: 841.8, y: 275.6 },
  { x: 840.6, y: 261.6 },
  { x: 838.0, y: 247.9 },
  { x: 833.4, y: 234.7 },
  { x: 826.2, y: 222.7 },
  { x: 816.7, y: 212.4 },
  { x: 805.7, y: 203.9 },
  { x: 793.1, y: 197.7 },
  { x: 779.6, y: 194.0 },
  { x: 765.8, y: 191.9 },
  { x: 751.8, y: 191.1 },
  { x: 737.8, y: 191.0 },
  { x: 723.8, y: 191.0 },
  { x: 709.8, y: 191.0 },
  { x: 695.8, y: 191.0 },
  { x: 681.8, y: 191.0 },
  { x: 667.8, y: 191.0 },
  { x: 653.8, y: 191.0 },
  { x: 639.8, y: 191.0 },
  { x: 625.8, y: 191.0 },
  { x: 611.8, y: 191.0 },
  { x: 597.8, y: 191.1 },
  { x: 583.8, y: 191.9 },
  { x: 570.0, y: 193.9 },
  { x: 556.4, y: 197.4 },
  { x: 543.4, y: 202.4 },
  { x: 530.6, y: 208.1 },
  { x: 517.4, y: 213.0 },
  { x: 503.9, y: 216.5 },
  { x: 490.0, y: 218.4 },
  { x: 476.1, y: 219.0 },
  { x: 462.1, y: 219.0 },
  { x: 448.1, y: 219.0 },
  { x: 434.1, y: 219.0 },
  { x: 420.1, y: 219.0 },
  { x: 406.1, y: 219.0 },
  { x: 392.1, y: 219.0 },
  { x: 378.1, y: 219.0 },
  { x: 364.1, y: 219.0 },
  { x: 350.1, y: 219.0 },
  { x: 336.1, y: 219.0 },
  { x: 322.1, y: 219.0 },
  { x: 308.1, y: 219.0 },
  { x: 294.1, y: 219.0 },
  { x: 280.1, y: 219.0 },
  { x: 266.1, y: 218.8 },
  { x: 252.1, y: 217.6 },
  { x: 238.4, y: 214.9 },
  { x: 225.1, y: 210.6 },
  { x: 212.5, y: 204.4 },
  { x: 201.2, y: 196.2 },
  { x: 191.2, y: 186.5 },
  { x: 182.6, y: 175.4 },
  { x: 175.9, y: 163.2 },
  { x: 170.9, y: 150.1 },
  { x: 167.5, y: 136.5 },
  { x: 165.6, y: 122.6 },
  { x: 165.0, y: 108.7 },
  { x: 165.0, y: 94.7 },
  { x: 165.0, y: 80.7 },
  { x: 165.0, y: 66.7 },
  { x: 165.0, y: 52.7 }
];

const TS_MAZE_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Maze",
  instructions: "The longest tunnel yet! Wind through every twist and turn from the bottom to the top. No shortcuts through the rock!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-maze.png"),
  points: TS_MAZE_PATH,
  halfWidth: 40,
};

// Level 10 - the surface (tight-squeeze-cave-surface.png, 941x1672): start at
// the bottom, wind up through the S-bends and burst out into the backyard
// at the top. This art has a sky/grass/fence strip at the top, so the tunnel
// was masked by colour (R > 235, G > 140, B < 140) to exclude the white
// clouds and tan fence, then traced along the distance-transform ridge.
// Clearance >= 49px (median 52; narrowest at x ~413 y ~1350), so halfWidth
// 46. Non-adjacent parts of the route are >= ~154px apart. Start kept at
// y ~1555, clear of the home-swipe zone.
const TS_SURFACE_PATH: TSPoint[] = [
  { x: 553.0, y: 1554.8 },
  { x: 553.0, y: 1540.8 },
  { x: 553.0, y: 1526.8 },
  { x: 553.0, y: 1512.8 },
  { x: 553.0, y: 1498.8 },
  { x: 553.0, y: 1484.8 },
  { x: 553.0, y: 1470.8 },
  { x: 553.0, y: 1456.8 },
  { x: 553.0, y: 1442.8 },
  { x: 552.7, y: 1428.8 },
  { x: 551.2, y: 1414.9 },
  { x: 547.1, y: 1401.5 },
  { x: 540.3, y: 1389.3 },
  { x: 531.3, y: 1378.6 },
  { x: 521.1, y: 1369.1 },
  { x: 509.6, y: 1361.1 },
  { x: 496.8, y: 1355.5 },
  { x: 483.2, y: 1352.1 },
  { x: 469.4, y: 1350.3 },
  { x: 455.4, y: 1350.0 },
  { x: 441.4, y: 1350.0 },
  { x: 427.4, y: 1350.0 },
  { x: 413.4, y: 1350.0 },
  { x: 399.4, y: 1350.0 },
  { x: 385.4, y: 1350.0 },
  { x: 371.4, y: 1350.0 },
  { x: 357.4, y: 1350.0 },
  { x: 343.4, y: 1350.0 },
  { x: 329.4, y: 1350.0 },
  { x: 315.4, y: 1350.0 },
  { x: 301.4, y: 1350.0 },
  { x: 287.4, y: 1350.0 },
  { x: 273.4, y: 1350.0 },
  { x: 259.4, y: 1349.3 },
  { x: 245.6, y: 1347.1 },
  { x: 232.2, y: 1342.9 },
  { x: 219.7, y: 1336.7 },
  { x: 208.4, y: 1328.5 },
  { x: 198.4, y: 1318.7 },
  { x: 190.1, y: 1307.4 },
  { x: 184.3, y: 1294.7 },
  { x: 180.9, y: 1281.2 },
  { x: 179.5, y: 1267.2 },
  { x: 179.0, y: 1253.3 },
  { x: 179.0, y: 1239.3 },
  { x: 179.0, y: 1225.3 },
  { x: 179.0, y: 1211.3 },
  { x: 179.0, y: 1197.3 },
  { x: 179.1, y: 1183.3 },
  { x: 180.1, y: 1169.3 },
  { x: 183.0, y: 1155.6 },
  { x: 188.1, y: 1142.6 },
  { x: 195.6, y: 1130.8 },
  { x: 205.0, y: 1120.4 },
  { x: 215.5, y: 1111.2 },
  { x: 227.4, y: 1103.9 },
  { x: 240.4, y: 1098.8 },
  { x: 254.1, y: 1095.6 },
  { x: 268.0, y: 1094.2 },
  { x: 282.0, y: 1094.0 },
  { x: 296.0, y: 1094.0 },
  { x: 310.0, y: 1094.0 },
  { x: 324.0, y: 1094.0 },
  { x: 338.0, y: 1094.0 },
  { x: 352.0, y: 1094.0 },
  { x: 366.0, y: 1094.0 },
  { x: 380.0, y: 1094.0 },
  { x: 394.0, y: 1094.0 },
  { x: 408.0, y: 1094.0 },
  { x: 422.0, y: 1094.0 },
  { x: 436.0, y: 1094.0 },
  { x: 450.0, y: 1094.0 },
  { x: 464.0, y: 1094.0 },
  { x: 478.0, y: 1094.0 },
  { x: 492.0, y: 1094.0 },
  { x: 506.0, y: 1094.0 },
  { x: 520.0, y: 1094.0 },
  { x: 534.0, y: 1094.0 },
  { x: 548.0, y: 1094.0 },
  { x: 562.0, y: 1094.0 },
  { x: 576.0, y: 1094.0 },
  { x: 590.0, y: 1094.0 },
  { x: 604.0, y: 1094.0 },
  { x: 618.0, y: 1094.0 },
  { x: 632.0, y: 1094.0 },
  { x: 646.0, y: 1094.0 },
  { x: 660.0, y: 1093.9 },
  { x: 674.0, y: 1093.1 },
  { x: 687.8, y: 1091.4 },
  { x: 701.3, y: 1087.5 },
  { x: 714.0, y: 1081.7 },
  { x: 725.2, y: 1073.3 },
  { x: 735.0, y: 1063.4 },
  { x: 743.4, y: 1052.2 },
  { x: 749.3, y: 1039.5 },
  { x: 752.7, y: 1025.9 },
  { x: 753.9, y: 1012.0 },
  { x: 754.4, y: 998.0 },
  { x: 754.9, y: 984.0 },
  { x: 755.0, y: 970.0 },
  { x: 755.0, y: 956.0 },
  { x: 755.0, y: 942.0 },
  { x: 755.0, y: 928.0 },
  { x: 755.0, y: 914.0 },
  { x: 755.0, y: 900.0 },
  { x: 754.9, y: 886.0 },
  { x: 754.2, y: 872.0 },
  { x: 752.1, y: 858.2 },
  { x: 747.9, y: 844.8 },
  { x: 741.3, y: 832.5 },
  { x: 732.4, y: 821.8 },
  { x: 722.0, y: 812.4 },
  { x: 710.2, y: 804.9 },
  { x: 697.3, y: 799.6 },
  { x: 683.7, y: 796.1 },
  { x: 669.8, y: 794.3 },
  { x: 655.8, y: 794.0 },
  { x: 641.8, y: 794.0 },
  { x: 627.8, y: 794.0 },
  { x: 613.8, y: 794.0 },
  { x: 599.8, y: 794.0 },
  { x: 585.8, y: 794.0 },
  { x: 571.8, y: 794.0 },
  { x: 557.8, y: 794.0 },
  { x: 543.8, y: 794.0 },
  { x: 529.8, y: 794.0 },
  { x: 515.8, y: 794.0 },
  { x: 501.8, y: 794.0 },
  { x: 487.8, y: 794.0 },
  { x: 473.8, y: 794.0 },
  { x: 459.8, y: 794.0 },
  { x: 445.8, y: 794.0 },
  { x: 431.8, y: 794.0 },
  { x: 417.8, y: 793.7 },
  { x: 403.9, y: 792.1 },
  { x: 390.4, y: 788.6 },
  { x: 377.5, y: 783.3 },
  { x: 365.8, y: 775.6 },
  { x: 355.5, y: 766.1 },
  { x: 346.3, y: 755.6 },
  { x: 339.1, y: 743.6 },
  { x: 334.1, y: 730.5 },
  { x: 331.1, y: 716.9 },
  { x: 330.1, y: 702.9 },
  { x: 330.0, y: 688.9 },
  { x: 330.0, y: 674.9 },
  { x: 330.0, y: 660.9 },
  { x: 330.0, y: 646.9 },
  { x: 330.0, y: 632.9 },
  { x: 330.3, y: 618.9 },
  { x: 330.9, y: 604.9 },
  { x: 331.4, y: 590.9 },
  { x: 333.3, y: 577.1 },
  { x: 337.1, y: 563.6 },
  { x: 343.3, y: 551.1 },
  { x: 351.7, y: 539.9 },
  { x: 361.6, y: 530.0 },
  { x: 372.8, y: 521.6 },
  { x: 385.3, y: 515.4 },
  { x: 398.6, y: 511.0 },
  { x: 412.3, y: 508.1 },
  { x: 426.2, y: 507.1 },
  { x: 440.2, y: 507.0 },
  { x: 454.2, y: 507.0 },
  { x: 468.2, y: 507.0 },
  { x: 482.2, y: 507.0 },
  { x: 496.2, y: 507.0 },
  { x: 510.2, y: 506.5 },
  { x: 524.2, y: 506.0 },
  { x: 538.2, y: 506.0 },
  { x: 552.2, y: 506.0 },
  { x: 566.2, y: 506.0 },
  { x: 580.2, y: 506.0 },
  { x: 594.2, y: 506.0 },
  { x: 608.2, y: 505.3 },
  { x: 621.9, y: 502.8 },
  { x: 635.2, y: 498.3 },
  { x: 647.6, y: 491.9 },
  { x: 658.8, y: 483.5 },
  { x: 668.8, y: 473.7 },
  { x: 677.3, y: 462.6 },
  { x: 683.5, y: 450.1 },
  { x: 687.4, y: 436.7 },
  { x: 689.5, y: 422.8 },
  { x: 690.0, y: 408.9 },
  { x: 690.0, y: 394.9 },
  { x: 690.0, y: 380.9 },
  { x: 690.0, y: 366.9 },
  { x: 690.0, y: 352.9 },
  { x: 690.0, y: 338.9 },
  { x: 690.0, y: 324.9 },
  { x: 690.0, y: 310.9 },
  { x: 690.0, y: 296.9 },
  { x: 690.0, y: 282.9 },
  { x: 690.0, y: 268.9 },
  { x: 690.0, y: 254.9 },
  { x: 690.0, y: 240.9 },
  { x: 690.0, y: 226.9 },
  { x: 690.0, y: 212.9 },
  { x: 690.0, y: 198.9 },
  { x: 690.0, y: 184.9 },
  { x: 690.0, y: 170.9 },
  { x: 690.0, y: 156.9 },
  { x: 690.0, y: 142.9 },
  { x: 690.0, y: 128.9 },
  { x: 690.0, y: 114.9 },
  { x: 690.0, y: 100.9 },
  { x: 690.0, y: 86.9 },
  { x: 690.0, y: 72.9 },
  { x: 690.0, y: 58.9 },
  { x: 690.0, y: 44.9 }
];

const TS_SURFACE_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "Back to the Surface",
  instructions: "One last climb! Wind up through the bends and pop out into the backyard!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-surface.png"),
  points: TS_SURFACE_PATH,
  halfWidth: 46,
};

// In play order. Clearing the last one wins the run.
const TS_LEVELS: TSLevelDesign[] = [
  TS_CAVE_DESIGN,
  TS_WAVE_DESIGN,
  TS_ZIGZAG_DESIGN,
  TS_ROCKFALL_DESIGN,
  TS_CRYSTAL_DESIGN,
  TS_VERTICAL_DESIGN,
  TS_CORNER_DESIGN,
  TS_SERPENT_DESIGN,
  TS_MAZE_DESIGN,
  TS_SURFACE_DESIGN,
];
const TS_TOTAL_LEVELS = TS_LEVELS.length;

function getLevelDesign(level: number): TSLevelDesign {
  return TS_LEVELS[Math.min(Math.max(level, 1), TS_TOTAL_LEVELS) - 1];
}

// ---------------------------------------------------------------------------
// Game component
// ---------------------------------------------------------------------------

export function TightSqueezeGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();

  // --- UI state ---
  // "levelComplete" = between levels: the play area is frozen under the
  // level-complete card until the player taps Next Level.
  const [gameState, setGameState] = useState<"idle" | "playing" | "levelComplete" | "gameover">("idle");
  const [level, setLevel] = useState(1);
  const [levelsCleared, setLevelsCleared] = useState(0);
  const [bestLevel, setBestLevel] = useState(0);
  const [won, setWon] = useState(false);
  const [lastCoins, setLastCoins] = useState(0);
  const [design, setDesign] = useState<TSLevelDesign>(() => getLevelDesign(1));
  const [playAreaSize, setPlayAreaSize] = useState({ width: 0, height: 0 });

  // --- Refs read by gesture/animation callbacks (which are created once) ---
  const gameStateRef = useRef(gameState);
  const levelRef = useRef(1);
  const levelsClearedRef = useRef(0);
  const designRef = useRef<TSLevelDesign>(design);
  const trackSizeRef = useRef({ width: 0, height: 0 });
  // Level-complete card: fades + springs in each time a level is cleared.
  const levelCardAnim = useRef(new Animated.Value(0)).current;

  // Paw position in design space (a ref, so dragging never re-renders);
  // bonePosX/Y are the matching screen-space Animated values.
  const boneBaseRef = useRef<TSPoint>({ ...design.points[0] });
  const boneDragStartRef = useRef<TSPoint>({ ...design.points[0] });
  const bonePosX = useRef(new Animated.Value(0)).current;
  const bonePosY = useRef(new Animated.Value(0)).current;

  // One screen-space Y + spin value per rock lane.
  const rockPosY = useRef(Array.from({ length: TS_ROCK_POOL_SIZE }, () => new Animated.Value(-9999))).current;
  const rockSpin = useRef(Array.from({ length: TS_ROCK_POOL_SIZE }, () => new Animated.Value(0))).current;

  const currentLayout = () =>
    computeLayout(trackSizeRef.current.width, trackSizeRef.current.height, designRef.current);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Re-apply the paw's screen position after each commit. Setting it inside
  // startGame/loadLevel alone isn't always reflected on first mount (notably
  // on web), which left the paw invisible until the first move.
  useEffect(() => {
    if (gameState === "idle") return;
    const layout = currentLayout();
    bonePosX.setValue(boneBaseRef.current.x * layout.scaleX);
    bonePosY.setValue(boneBaseRef.current.y * layout.scaleY);
  }, [gameState, design, playAreaSize.width, playAreaSize.height]);

  useEffect(() => {
    if (gameState !== "levelComplete") return;
    levelCardAnim.setValue(0);
    Animated.timing(levelCardAnim, {
      toValue: 1,
      duration: TS_LEVEL_CARD_IN_MS,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  }, [gameState]);

  // Falling rocks: animate each lane every frame and end the run on contact
  // (circle-vs-circle in design space). Restarts per level so every attempt
  // sees the same pattern.
  useEffect(() => {
    const rocks = design.fallingRocks;
    if (gameState !== "playing" || !rocks || rocks.length === 0) {
      rockPosY.forEach((v) => v.setValue(-9999));
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      if (gameStateRef.current !== "playing") return;
      const d = designRef.current;
      if (d.fallingRocks !== rocks) return;
      const layout = currentLayout();
      const bone = boneBaseRef.current;
      const t = now - start;
      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        const p = (t / r.period + r.phase) % 1;
        const y = TS_ROCK_FALL_TOP + p * (TS_ROCK_FALL_BOTTOM - TS_ROCK_FALL_TOP);
        rockPosY[i].setValue(y * layout.scaleY);
        rockSpin[i].setValue(p * 220);
        const hit = r.radius + d.boneRadius;
        if ((bone.x - r.x) ** 2 + (bone.y - y) ** 2 < hit * hit) {
          finishRun(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, design]);

  // --- Game flow ---

  // Move the paw to `point` (a level's start). Levels now always begin from a
  // fresh touch after the level-complete card, so there's no in-progress drag
  // offset to carry over.
  const placeBoneAt = (point: TSPoint) => {
    boneBaseRef.current = { ...point };
    const layout = currentLayout();
    boneDragStartRef.current = { ...point };
    bonePosX.setValue(point.x * layout.scaleX);
    bonePosY.setValue(point.y * layout.scaleY);
  };

  const loadLevel = (levelNumber: number) => {
    const next = getLevelDesign(levelNumber);
    designRef.current = next;
    setDesign(next);
    placeBoneAt(next.points[0]);
  };

  const startGame = () => {
    setWon(false);
    levelRef.current = 1;
    setLevel(1);
    levelsClearedRef.current = 0;
    setLevelsCleared(0);
    loadLevel(1);
    gameStateRef.current = "playing";
    setGameState("playing");
  };

  // Ends the run (win or lose) and pays out coins for levels cleared.
  const finishRun = (didWin: boolean) => {
    if (gameStateRef.current !== "playing") return;
    gameStateRef.current = "gameover";
    setWon(didWin);
    setGameState("gameover");
    setBestLevel((prev) => Math.max(prev, levelRef.current));
    const coinsEarned = levelsClearedRef.current * TS_COINS_PER_LEVEL_CLEARED;
    if (coinsEarned > 0) earnCoins(coinsEarned);
    setLastCoins(coinsEarned);
  };

  // Clearing a level (other than the last) pauses on the level-complete card;
  // the next level only loads when the player taps Next Level.
  const handleLevelComplete = () => {
    levelsClearedRef.current += 1;
    setLevelsCleared(levelsClearedRef.current);
    if (levelRef.current >= TS_TOTAL_LEVELS) {
      finishRun(true);
      return;
    }
    stopDpadMove();
    gameStateRef.current = "levelComplete";
    setGameState("levelComplete");
  };

  const goToNextLevel = () => {
    if (gameStateRef.current !== "levelComplete") return;
    const nextLevel = levelRef.current + 1;
    levelRef.current = nextLevel;
    setLevel(nextLevel);
    loadLevel(nextLevel);
    gameStateRef.current = "playing";
    setGameState("playing");
  };

  // Shared by drag and D-pad: clamp to the canvas, move the paw, then check
  // finish first and walls second.
  const attemptMoveBoneTo = (rawX: number, rawY: number) => {
    if (gameStateRef.current !== "playing") return;
    const d = designRef.current;
    const layout = currentLayout();
    const x = Math.max(0, Math.min(d.baseWidth, rawX));
    const y = Math.max(0, Math.min(d.baseHeight, rawY));
    const prev = boneBaseRef.current;
    const allowedHalfWidth = Math.max(d.minAllowedHalfWidth, d.halfWidth - d.boneRadius);
    const finish = d.points[d.points.length - 1];

    // Swept check: a fast flick can jump several px per move event, enough to
    // hop over a thin rock wall between two parts of a winding tunnel. Sample
    // the straight line from the previous position in small steps and stop at
    // the first point that finishes the level or leaves the tunnel.
    const dist = Math.hypot(x - prev.x, y - prev.y);
    const steps = Math.max(1, Math.ceil(dist / TS_SWEEP_STEP));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sx = prev.x + (x - prev.x) * t;
      const sy = prev.y + (y - prev.y) * t;
      const reachedFinish = Math.hypot(sx - finish.x, sy - finish.y) <= d.finishRadius;
      const hitWall = !reachedFinish && !isInsideTunnel({ x: sx, y: sy }, d.points, allowedHalfWidth);
      if (reachedFinish || hitWall || i === steps) {
        boneBaseRef.current = { x: sx, y: sy };
        bonePosX.setValue(sx * layout.scaleX);
        bonePosY.setValue(sy * layout.scaleY);
        if (reachedFinish) handleLevelComplete();
        else if (hitWall) finishRun(false);
        return;
      }
    }
  };

  // --- Touch drag (only grabs when the touch starts near the paw) ---

  const isTouchNearBone = (evt: { nativeEvent: { locationX: number; locationY: number } }) => {
    const layout = currentLayout();
    const { locationX, locationY } = evt.nativeEvent;
    return (
      Math.hypot(
        locationX - boneBaseRef.current.x * layout.scaleX,
        locationY - boneBaseRef.current.y * layout.scaleY
      ) <= TS_GRAB_RADIUS
    );
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => gameStateRef.current === "playing" && isTouchNearBone(evt),
      onMoveShouldSetPanResponder: (evt, gesture) =>
        gameStateRef.current === "playing" &&
        (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2) &&
        isTouchNearBone(evt),
      onPanResponderGrant: () => {
        boneDragStartRef.current = { ...boneBaseRef.current };
      },
      onPanResponderMove: (_evt, gesture) => {
        const layout = currentLayout();
        attemptMoveBoneTo(
          boneDragStartRef.current.x + gesture.dx / layout.scaleX,
          boneDragStartRef.current.y + gesture.dy / layout.scaleY
        );
      },
    })
  ).current;

  // --- D-pad (hold a button to move continuously) ---

  const dpadDirectionRef = useRef<TSGesture | null>(null);
  const dpadRafRef = useRef<number | null>(null);
  const dpadLastTimeRef = useRef<number | null>(null);

  const stopDpadLoop = () => {
    if (dpadRafRef.current !== null) {
      cancelAnimationFrame(dpadRafRef.current);
      dpadRafRef.current = null;
    }
    dpadLastTimeRef.current = null;
  };

  const dpadTick = (time: number) => {
    const dir = dpadDirectionRef.current;
    if (dir === null || gameStateRef.current !== "playing") {
      stopDpadLoop();
      return;
    }
    if (dpadLastTimeRef.current === null) dpadLastTimeRef.current = time;
    const elapsedSec = (time - dpadLastTimeRef.current) / 1000;
    dpadLastTimeRef.current = time;

    const layout = currentLayout();
    attemptMoveBoneTo(
      boneBaseRef.current.x + (dir.dx * TS_DPAD_SPEED * elapsedSec) / layout.scaleX,
      boneBaseRef.current.y + (dir.dy * TS_DPAD_SPEED * elapsedSec) / layout.scaleY
    );
    dpadRafRef.current = requestAnimationFrame(dpadTick);
  };

  const startDpadMove = (dx: number, dy: number) => {
    if (gameStateRef.current !== "playing") return;
    dpadDirectionRef.current = { dx, dy };
    dpadLastTimeRef.current = null;
    if (dpadRafRef.current === null) dpadRafRef.current = requestAnimationFrame(dpadTick);
  };

  const stopDpadMove = () => {
    dpadDirectionRef.current = null;
    stopDpadLoop();
  };

  useEffect(() => stopDpadLoop, []);

  // dx/dy are unit length (diagonals use SQRT1_2) so every direction moves
  // at the same speed.
  const renderDpadButton = (dx: number, dy: number, label: string) => (
    <PressableScale
      style={[styles.tsDpadButton, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}
      onPressIn={() => startDpadMove(dx, dy)}
      onPressOut={stopDpadMove}
    >
      <Text style={[styles.tsDpadArrow, { color: theme.text.primary }]}>{label}</Text>
    </PressableScale>
  );

  // --- Render ---

  const layout = computeLayout(
    playAreaSize.width || trackSizeRef.current.width,
    playAreaSize.height || trackSizeRef.current.height,
    design
  );
  const boneSize = Math.round(20 * layout.scaleX); // drag wrapper size
  const pawSize = Math.max(20, Math.round(Math.max(14, Math.round(boneSize * 0.55)) * 1.45)); // visible paw
  const tunnelPath = buildPathString(design.points);
  const startPoint = design.points[0];
  const finishPoint = design.points[design.points.length - 1];

  // No title prop: Tight Squeeze runs without the top banner.
  return (
    <MinigameShell onExit={onExit}>
      {gameState !== "idle" && (
        <View style={[sharedGameStyles.scoreRow, { width: layout.width }]}>
          <Text style={[sharedGameStyles.scoreText, { color: theme.text.primary }]}>
            🦴 Level {level}: {design.label}
          </Text>
          <Text style={[sharedGameStyles.bestScoreText, { color: theme.text.secondary }]}>
            Best {Math.max(bestLevel, gameState === "playing" || gameState === "levelComplete" ? level : 0)}
          </Text>
        </View>
      )}

      <View
        style={sharedGameStyles.gameFullScreenPlayWrap}
        onLayout={(e) => {
          const width = Math.round(e.nativeEvent.layout.width);
          const height = Math.round(e.nativeEvent.layout.height);
          trackSizeRef.current = { width, height };
          setPlayAreaSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        }}
      >
        {gameState === "idle" ? (
          <View style={sharedGameStyles.gameFullScreenIdleContent}>
            <Text style={[sharedGameStyles.gameSubtitle, { color: theme.text.secondary }]}>
              {"Guide the paw through each glowing cave tunnel, start to finish — the squeeze gets tighter every level. Touch a wall and it's game over!"}
            </Text>
            <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
              <Text style={sharedGameStyles.primaryButtonText}>Start Game</Text>
            </PressableScale>
          </View>
        ) : (
          playAreaSize.width > 0 && (
            <View style={[styles.tsTrack, { width: layout.width, height: layout.height }]} {...panResponder.panHandlers}>
              {/* Cave art, stretched to the same box as the SVG so traced points line up. */}
              <Image source={design.backgroundImage} resizeMode="stretch" style={{ width: layout.width, height: layout.height }} />

              <Svg
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${design.baseWidth} ${design.baseHeight}`}
                preserveAspectRatio="none"
                style={StyleSheet.absoluteFill}
              >
                {/* Faint dashed centerline as a steering aid. */}
                <Path d={tunnelPath} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="5 6" fill="none" />
                <Circle cx={startPoint.x} cy={startPoint.y} r={6} fill="#3DBE64" />
                <Circle cx={finishPoint.x} cy={finishPoint.y} r={6} fill="#E0483E" />
              </Svg>

              {gameState === "playing" &&
                design.fallingRocks?.map((rock, i) => {
                  const w = rock.radius * 2 * layout.scaleX;
                  const h = rock.radius * 2 * layout.scaleY;
                  return (
                    <Animated.View
                      key={`rock-${i}`}
                      style={{
                        position: "absolute",
                        left: rock.x * layout.scaleX - w / 2,
                        top: 0,
                        width: w,
                        height: h,
                        pointerEvents: "none",
                        transform: [
                          { translateY: Animated.subtract(rockPosY[i], h / 2) },
                          { rotate: rockSpin[i].interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }) },
                        ],
                      }}
                    >
                      <TSRock />
                    </Animated.View>
                  );
                })}

              <Animated.View
                style={[
                  styles.tsBoneWrapper,
                  {
                    width: boneSize,
                    height: boneSize,
                    transform: [
                      { translateX: Animated.subtract(bonePosX, boneSize / 2) },
                      { translateY: Animated.subtract(bonePosY, boneSize / 2) },
                    ],
                  },
                ]}
              >
                <TSPawMarker size={pawSize} />
              </Animated.View>

              {gameState === "levelComplete" && (
                <View style={styles.tsLevelOverlay}>
                  <Animated.View
                    style={[
                      styles.tsLevelCard,
                      {
                        opacity: levelCardAnim,
                        transform: [{ scale: levelCardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
                      },
                    ]}
                  >
                    <View style={styles.tsLevelBadge}>
                      <TSPawMarker size={30} />
                    </View>
                    <Text style={styles.tsLevelKicker}>LEVEL {level} OF {TS_TOTAL_LEVELS}</Text>
                    <Text style={styles.tsLevelTitle}>Level Complete!</Text>
                    <Text style={styles.tsLevelName}>{design.label}</Text>

                    {/* Cave-glow progress bar: one segment per level. */}
                    <View style={styles.tsLevelProgress}>
                      {TS_LEVELS.map((_, i) => (
                        <View
                          key={i}
                          style={[styles.tsLevelProgressSeg, i < levelsCleared && styles.tsLevelProgressSegDone]}
                        />
                      ))}
                    </View>

                    <View style={styles.tsLevelStatsRow}>
                      <View style={styles.tsLevelStat}>
                        <Text style={styles.tsLevelStatValue}>{levelsCleared}</Text>
                        <Text style={styles.tsLevelStatLabel}>caves cleared</Text>
                      </View>
                      <View style={styles.tsLevelStatDivider} />
                      <View style={styles.tsLevelStat}>
                        <Text style={styles.tsLevelStatValue}>+{levelsCleared * TS_COINS_PER_LEVEL_CLEARED} 🪙</Text>
                        <Text style={styles.tsLevelStatLabel}>coins this run</Text>
                      </View>
                    </View>

                    <Text style={styles.tsLevelUpNext}>
                      Up next: <Text style={styles.tsLevelUpNextName}>{getLevelDesign(level + 1).label}</Text>
                    </Text>

                    <PressableScale style={styles.tsLevelButton} onPress={goToNextLevel}>
                      <Text style={styles.tsLevelButtonText}>Next Level →</Text>
                    </PressableScale>
                  </Animated.View>
                </View>
              )}

              {/* 8-way D-pad, bottom-right, inset past the safe area. */}
              {gameState === "playing" && (
                <View style={[styles.tsDpad, { bottom: insets.bottom + 16, right: insets.right + 16 }]}>
                  <View style={styles.tsDpadRow}>
                    {renderDpadButton(-Math.SQRT1_2, -Math.SQRT1_2, "↖")}
                    {renderDpadButton(0, -1, "↑")}
                    {renderDpadButton(Math.SQRT1_2, -Math.SQRT1_2, "↗")}
                  </View>
                  <View style={styles.tsDpadRow}>
                    {renderDpadButton(-1, 0, "←")}
                    <View style={styles.tsDpadSpacer} />
                    {renderDpadButton(1, 0, "→")}
                  </View>
                  <View style={styles.tsDpadRow}>
                    {renderDpadButton(-Math.SQRT1_2, Math.SQRT1_2, "↙")}
                    {renderDpadButton(0, 1, "↓")}
                    {renderDpadButton(Math.SQRT1_2, Math.SQRT1_2, "↘")}
                  </View>
                </View>
              )}
            </View>
          )
        )}
      </View>

      {gameState === "playing" && (
        <Text style={[sharedGameStyles.instructionsText, { color: theme.text.secondary }]}>{design.instructions}</Text>
      )}

      {gameState === "gameover" && (
        <>
          <Text style={[sharedGameStyles.gameOverText, { color: theme.text.primary }]}>
            {won ? (
              `You squeezed through all ${TS_TOTAL_LEVELS} caves! 🎉 +${lastCoins} coins`
            ) : (
              <>
                Hit a wall on level {level}! Cleared {levelsCleared} level{levelsCleared === 1 ? "" : "s"} this run 🎉{" "}
                {lastCoins > 0 ? `+${lastCoins} coins` : "Steady those hands next time!"}
              </>
            )}
          </Text>
          <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
            <Text style={sharedGameStyles.primaryButtonText}>Play Again</Text>
          </PressableScale>
        </>
      )}
    </MinigameShell>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const TS_DPAD_BUTTON_SIZE = 40;

const styles = StyleSheet.create({
  tsTrack: {
    borderRadius: 18,
    backgroundColor: "#EAD9B7",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#4A3220",
  },
  tsBoneWrapper: {
    position: "absolute",
    left: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  // --- Level-complete card: cave rock browns with the tunnel's amber glow ---
  tsLevelOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: "rgba(26,12,6,0.62)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  tsLevelCard: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    backgroundColor: "#48271A",
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#FFB547",
    paddingTop: 34,
    paddingBottom: 20,
    paddingHorizontal: 20,
    shadowColor: "#FFB547",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  tsLevelBadge: {
    position: "absolute",
    top: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFD27A",
    borderWidth: 3,
    borderColor: "#2E170D",
    alignItems: "center",
    justifyContent: "center",
  },
  tsLevelKicker: {
    color: "#E0A868",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  tsLevelTitle: {
    color: "#FFE6A8",
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
    textAlign: "center",
    textShadowColor: "rgba(255,181,71,0.6)",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  tsLevelName: {
    color: "#F3D2A2",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },
  tsLevelProgress: {
    flexDirection: "row",
    width: "100%",
    marginTop: 16,
    gap: 4,
  },
  tsLevelProgressSeg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2E170D",
  },
  tsLevelProgressSegDone: {
    backgroundColor: "#FFC65C",
  },
  tsLevelStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#351C11",
  },
  tsLevelStat: {
    flex: 1,
    alignItems: "center",
  },
  tsLevelStatValue: {
    color: "#FFE6A8",
    fontSize: 20,
    fontWeight: "900",
  },
  tsLevelStatLabel: {
    color: "#C9986A",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  tsLevelStatDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#5E321D",
  },
  tsLevelUpNext: {
    color: "#C9986A",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 14,
    textAlign: "center",
  },
  tsLevelUpNextName: {
    color: "#FFE6A8",
    fontWeight: "800",
  },
  tsLevelButton: {
    marginTop: 14,
    alignSelf: "stretch",
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 13,
    backgroundColor: "#FFC65C",
    borderWidth: 2,
    borderColor: "#2E170D",
  },
  tsLevelButtonText: {
    color: "#2E170D",
    fontSize: 16,
    fontWeight: "900",
  },
  tsDpad: {
    position: "absolute",
    zIndex: 10,
    alignItems: "center",
  },
  tsDpadRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tsDpadButton: {
    width: TS_DPAD_BUTTON_SIZE,
    height: TS_DPAD_BUTTON_SIZE,
    margin: 2,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Empty center cell, same footprint as a button.
  tsDpadSpacer: {
    width: TS_DPAD_BUTTON_SIZE,
    height: TS_DPAD_BUTTON_SIZE,
    margin: 2,
  },
  tsDpadArrow: {
    fontSize: 17,
    fontWeight: "800",
  },
});

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

// The draggable paw: black pads over slightly larger white copies, so it
// reads on both the bright tunnel and the dark rock.
function TSPawMarker({ size }: { size: number }) {
  const toes = [
    { cx: 5.2, cy: 9.6, rx: 2.3, ry: 2.9, rot: -25 },
    { cx: 9.4, cy: 5.6, rx: 2.4, ry: 3.1, rot: -8 },
    { cx: 14.6, cy: 5.6, rx: 2.4, ry: 3.1, rot: 8 },
    { cx: 18.8, cy: 9.6, rx: 2.3, ry: 2.9, rot: 25 },
  ];
  const pad = "M12 11.2c-3.1 0-6.4 3.4-6.4 6.3 0 2.1 1.6 3.1 3.3 3.1 1.3 0 2.1-.7 3.1-.7s1.8.7 3.1.7c1.7 0 3.3-1 3.3-3.1 0-2.9-3.3-6.3-6.4-6.3z";
  const shapes = (fill: string, stroke?: string) => (
    <G>
      {toes.map((t, i) => (
        // Plain SVG transform string: rotation/origin props trigger a
        // transform-origin warning on react-native-web.
        <G key={i} transform={`rotate(${t.rot} ${t.cx} ${t.cy})`}>
          <Ellipse cx={t.cx} cy={t.cy} rx={t.rx} ry={t.ry} fill={fill} stroke={stroke} strokeWidth={stroke ? 2.6 : 0} />
        </G>
      ))}
      <Path d={pad} fill={fill} stroke={stroke} strokeWidth={stroke ? 2.6 : 0} strokeLinejoin="round" />
    </G>
  );
  return (
    <View style={{ pointerEvents: "none" }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {shapes("#fff", "#fff")}
        {shapes("#1A1A1A")}
      </Svg>
    </View>
  );
}

// A falling boulder drawn to match the cave art: a chunky rounded-polygon
// rock like the painted ones, in the art's own browns (sampled from the level
// image) - lighter top facet, darker side facet, a dark rim like the gaps
// between the painted rocks, and a faint warm edge where the tunnel glow
// catches its underside. Fills whatever box it's given.
function TSRock() {
  const body =
    "M11.4 8.6 Q15 5 20.4 4.7 L27.6 4.3 Q33 4 36.3 7 L40.7 11 Q44 14 44.3 19.1 L44.7 25.9 Q45 31 42 34.9 L38 40.1 Q35 44 29.3 44.3 L21.7 44.7 Q16 45 12.4 41.7 L7.6 37.3 Q4 34 3.7 28.9 L3.3 22.1 Q3 17 6.6 13.4 Z";
  const topFacet =
    "M11.4 8.6 Q15 5 20.4 4.7 L27.6 4.3 Q33 4 36.3 7 L40.7 11 Q44 14 42.2 15.8 L39.8 18.2 Q38 20 33.2 20.9 L26.8 22.1 Q22 23 17.2 21.8 L10.8 20.2 Q6 19 5.1 18.4 L3.9 17.6 Q3 17 6.6 13.4 Z";
  const sideFacet =
    "M42.5 15.5 Q44 14 44.2 18.2 L44.8 26.8 Q45 31 42.5 34.2 L37.5 40.8 Q35 44 33.8 41.2 L31.2 35.8 Q30 33 32 29.8 L36 23.2 Q38 20 39.5 18.5 Z";
  return (
    <Svg width="100%" height="100%" viewBox="0 0 48 48">
      <Path d={body} fill="#562E1C" stroke="#2E170D" strokeWidth={2.6} strokeLinejoin="round" />
      <Path d={topFacet} fill="#693A21" />
      <Path d={sideFacet} fill="#45251A" />
      <Path d="M13 9.5 Q16 6.8 21 6.6 L27 6.3" stroke="#7E4A2A" strokeWidth={1.4} strokeLinecap="round" fill="none" />
      <Path d="M7.6 37.3 L12.4 41.7 Q16 45 21.7 44.7 L29.3 44.3 Q35 44 38 40.1" stroke="#C06A22" strokeOpacity={0.5} strokeWidth={1.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
