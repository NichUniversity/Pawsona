import { useEffect, useRef, useState } from "react";
import { Animated, Image, PanResponder, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";

import { PressableScale } from "../ui/PressableScale";
import { usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";

import { MinigameShell } from "./MinigameShell";
import { sharedGameStyles } from "./sharedGameStyles";

// --- Tight Squeeze (steady-hand navigation, one touch = game over) ---
// Redesigned 2026-09-13 per explicit user request: drag a bone through a
// hollow (outline-only) dog shape, level by level, replacing the original
// vertical scrolling-passage version (a scrolling cave the dog itself slid
// through — see git history / the old claude/tight-squeeze-minigame.md for
// that version). The draggable piece started as a placeholder bone emoji
// (🦴) as <Text>, same template approach every other minigame in this file
// uses until real art arrives; per explicit user request it's now a plain
// small black dot instead ("instead of a bone, have the user drag a mini
// black dot for now" — see boneDotSize near the render logic further down),
// still just a placeholder standing in for real bone art.
//
// Same day: wired in a "critter maze" system (TSLevelDesign /
// TS_CUSTOM_LEVELS below). Level 1 uses Nich's actual reference image as
// the on-screen art, rendered full-bleed behind the play area — the
// collision corridor isn't hand-guessed, it's the real maze line traced out
// of that image (thresholded to isolate the white line from the brown
// fill, connected-component-filtered to drop the START/FINISH lettering,
// skeletonized to a centerline, then walked and resampled — see the
// TS_LEVEL1_* comments further down for the exact recipe, kept for when the
// next critter needs the same treatment), so the touchable tunnel lines up
// with what's actually drawn. Nich tried a dog-shaped reference image
// first ("Rex the Retriever" — nose, one spiral through the ear, along the
// back, one spiral through the curled tail, out the tip) then asked to
// swap it for a bone-shaped one instead ("The Big Bone" — see below; its
// outline is a full loop with two equally-valid routes through it, top or
// bottom, which is why TSLevelDesign grew an optional `paths` field
// alongside `points`). Per Nich: future levels will be other critters
// (e.g. "level 2 will be someone else, like a cat") — trace each new
// reference image the same way and append a design to TS_CUSTOM_LEVELS.
// Any level number past the end of that array falls back to the original
// procedural zigzag generator (through the placeholder head-only outline)
// so the game never breaks while new critters are still being authored.

// Base/reference design size the dog silhouette + tunnel path are authored
// at. The SVG uses this as its viewBox and stretches non-uniformly
// (preserveAspectRatio="none") to fill whatever screen it's running
// full-screen on, so all path/collision math below stays in this fixed
// coordinate space — only the bone's on-screen render position and
// pan-gesture deltas get converted to/from actual screen pixels via
// scaleX/scaleY, computed fresh every event from the measured play area.
const TS_BASE_TRACK_WIDTH = 280;
const TS_BASE_TRACK_HEIGHT = 400;

// A simple "dog head" outline: rounded head, two ears, a snout bump at the
// bottom — drawn as one continuous hollow (stroke-only, no fill) path.
// Placeholder art; swap for a real dog silhouette asset later without
// touching any game logic below, which only ever references
// TS_TUNNEL_ANCHOR_TOP / TS_TUNNEL_ANCHOR_BOTTOM, not this path string.
const TS_DOG_OUTLINE_PATH =
  "M 60 35 " +
  "C 20 55, 15 100, 35 140 " +
  "C 30 190, 35 230, 60 255 " +
  "C 70 275, 95 290, 140 292 " +
  "C 185 290, 210 275, 220 255 " +
  "C 245 230, 250 190, 245 140 " +
  "C 265 100, 260 55, 220 35 " +
  "C 200 15, 160 55, 140 50 " +
  "C 120 55, 80 15, 60 35 Z";

// The tunnel always starts at the valley between the ears and ends at the
// snout tip — both fixed points on the outline above — so every level's
// generated path (see buildTightSqueezeLevelPath) begins/ends in the same
// visually sensible place no matter how winding the middle gets.
const TS_TUNNEL_ANCHOR_TOP: TSPoint = { x: 140, y: 55 };
const TS_TUNNEL_ANCHOR_BOTTOM: TSPoint = { x: 140, y: 290 };

// Tunnel half-width shrinks each level; segment count (how many turns) and
// zigzag amplitude both grow each level — all three ramps are capped at
// TS_MAX_DIFFICULTY_LEVEL so the game stays winnable indefinitely past that
// point (level numbers keep climbing for scoring purposes) rather than
// becoming literally impossible.
const TS_BASE_HALF_WIDTH = 34;
const TS_MIN_HALF_WIDTH = 12;
const TS_HALF_WIDTH_STEP_PER_LEVEL = 2;
const TS_BASE_SEGMENTS = 6;
const TS_MAX_SEGMENTS = 16;
const TS_BASE_AMPLITUDE = 34;
const TS_AMPLITUDE_STEP_PER_LEVEL = 3;
const TS_MAX_AMPLITUDE = 70;
const TS_MAX_DIFFICULTY_LEVEL = 12;

// Bone "size" for collision purposes (eats into the tunnel's half-width, same
// fairness-inset idea the old placeholder-emoji dog collision box used) and
// how close the bone needs to get to the bottom anchor to count as clearing
// the level — both in the same base coordinate space as everything above.
const TS_BONE_RADIUS = 7;
const TS_MIN_ALLOWED_HALF_WIDTH = 4;
const TS_FINISH_RADIUS = 20;

// How close (in real on-screen pixels, not base/design-space units — this is
// compared directly against a touch event's locationX/Y) a touch has to
// start to the dot's current on-screen center to grab it at all. Per
// explicit user request ("it looks like no matter where i touch the screen
// it moves the black dot ... only if you are holding around the black dot
// it moves"): the drag used to be a free touch-anywhere-on-the-track
// gesture, which read as broken once the piece shrank down to a small dot.
// 36px is deliberately larger than the dot itself (visually ~11-20px) for a
// forgiving-but-not-anywhere touch target, similar in spirit to Apple's
// ~44pt minimum tappable-target guidance.
const TS_BONE_GRAB_RADIUS = 36;

// D-pad nudge speed, per explicit user request for an "up/down/left/right
// pad off to the side for navigation" as an alternative to dragging. In
// on-screen pixels/second (not base/design-space units) so it feels the same
// regardless of which level's coordinate space is active, same reasoning as
// TS_BONE_GRAB_RADIUS above; converted to base units fresh every animation
// frame via the current scaleX/scaleY (see the dpad tick loop further down).
// 140 per explicit user follow-up ("make it a little slower") — was 200.
const TS_DPAD_SPEED = 140;

// Coins are paid out once, at game over, based on how many levels were
// cleared this run — same single-payout-at-the-end pattern every other
// minigame in this file uses (rather than per-level), to keep this game's
// economy consistent with the rest rather than introducing a new payout timing.
const TS_COINS_PER_LEVEL_CLEARED = 2;

type TSPoint = { x: number; y: number };
// One falling rock lane: drops from rockFallTop to rockFallBottom (design
// space) every `period` ms, offset by `phase` (0..1 of a period) so the lanes
// don't fall in unison. `radius` is its collision + drawn size.
type TSFallingRock = { x: number; radius: number; period: number; phase: number };
type TSLevelPath = { points: TSPoint[]; halfWidth: number };

// A full level "design": the tunnel path itself (points + halfWidth, as
// TSLevelPath above) plus everything needed to render and describe it —
// its own design-space canvas size (a traced critter maze isn't necessarily
// the same shape/orientation, or even the same coordinate magnitude, as the
// original vertical placeholder — a design authored straight from an image
// naturally uses that image's own pixel space), a name, and level-specific
// instructions copy. Exactly one of outlinePath (a decorative stroke-only
// silhouette drawn over the procedural placeholder track) or backgroundImage
// (a real image asset, e.g. Rex's traced photo, drawn full-bleed instead) is
// expected to be set — see the render logic below. boneRadius/
// minAllowedHalfWidth/finishRadius default to the TS_BONE_RADIUS-family
// constants when omitted; a design authored in a very different coordinate
// magnitude than those constants (again, an image-traced design, whose
// space is that image's native pixel dimensions rather than the small
// hand-tuned placeholder range) should set its own so the fairness
// inset/finish tolerance stay proportionate.
//
// `points` is the single canonical route used for the start/finish dot
// markers (points[0]/points[last]) and as the fallback collision/render
// path. `paths`, when set, OVERRIDES points for collision + the dashed
// steering line with one-or-more independently-checked sub-routes — for a
// traced maze whose art shows more than one physically open way through
// (e.g. the bone maze below, a full loop where both the top and bottom arcs
// are genuinely walkable white channel, not one "real" path plus
// decoration) every sub-route needs to be checked as its own polyline
// rather than concatenated into one, or the joint between two unrelated
// routes would falsely read as a legal straight-line shortcut through solid
// ground. Both hand-authored (TS_CUSTOM_LEVELS) and procedurally-generated
// levels resolve to this same shape via getLevelDesign() below, so the rest
// of the component never needs to know which kind of level it's looking at.
type TSLevelDesign = TSLevelPath & {
  baseWidth: number;
  baseHeight: number;
  paths?: TSPoint[][];
  outlinePath?: string;
  backgroundImage?: number; // require()'d image asset module id
  boneRadius?: number;
  minAllowedHalfWidth?: number;
  finishRadius?: number;
  // Optional hazard: rocks that repeatedly fall straight down through the
  // tunnel at fixed x positions (design-space units). Touching one ends the
  // run, same as touching a wall. See TS_FALLING_ROCKS below.
  fallingRocks?: TSFallingRock[];
  label: string;
  instructions: string;
};

// Builds one level's winding tunnel path: an evenly-spaced set of points from
// the top anchor to the bottom anchor, zigzagging left/right of center with
// growing amplitude/segment-count and shrinking half-width as the level
// number climbs — regenerated fresh (with fresh randomness) every time a
// level loads, same "random walk" spirit the original passage generator used.
function buildTightSqueezeLevelPath(level: number): TSLevelPath {
  const difficulty = Math.min(level, TS_MAX_DIFFICULTY_LEVEL);
  const numSegments = Math.min(TS_MAX_SEGMENTS, TS_BASE_SEGMENTS + (difficulty - 1));
  const amplitude = Math.min(
    TS_MAX_AMPLITUDE,
    TS_BASE_AMPLITUDE + (difficulty - 1) * TS_AMPLITUDE_STEP_PER_LEVEL
  );
  const halfWidth = Math.max(
    TS_MIN_HALF_WIDTH,
    TS_BASE_HALF_WIDTH - (difficulty - 1) * TS_HALF_WIDTH_STEP_PER_LEVEL
  );

  const points: TSPoint[] = [];
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const y =
      TS_TUNNEL_ANCHOR_TOP.y + (TS_TUNNEL_ANCHOR_BOTTOM.y - TS_TUNNEL_ANCHOR_TOP.y) * t;
    let x = TS_TUNNEL_ANCHOR_TOP.x;
    if (i > 0 && i < numSegments) {
      const side = i % 2 === 0 ? -1 : 1;
      const jitter = 0.65 + Math.random() * 0.35;
      x = TS_TUNNEL_ANCHOR_TOP.x + side * amplitude * jitter;
    }
    points.push({ x, y });
  }
  return { points, halfWidth };
}

function buildTunnelPathString(points: TSPoint[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

// Shortest distance from point p to the segment a-b (clamped projection).
function distanceToSegment(p: TSPoint, a: TSPoint, b: TSPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq > 0
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
      : 0;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

// The bone is "inside the tunnel" if it's within the allowed half-width of ANY
// segment of the path (not just the nearest one overall) — the cheapest way
// to handle the joints between segments correctly without needing arc-length
// tracking along the whole path. Known simplification: a player can cut
// across a tight zigzag rather than following it exactly, as long as they
// stay within some segment's corridor the whole time — acceptable for a
// casual placeholder version of this game.
function isBoneInsideTunnel(bone: TSPoint, points: TSPoint[], allowedHalfWidth: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (distanceToSegment(bone, points[i], points[i + 1]) <= allowedHalfWidth) return true;
  }
  return false;
}

// baseWidth/baseHeight default to the original placeholder canvas so every
// existing call site (written before per-level canvases existed) keeps
// working unchanged; callers that know which level's design is active pass
// its own baseWidth/baseHeight explicitly.
function computeTightSqueezeLayout(
  trackWidth: number,
  trackHeight: number,
  baseWidth: number = TS_BASE_TRACK_WIDTH,
  baseHeight: number = TS_BASE_TRACK_HEIGHT
) {
  const width = Math.max(220, trackWidth);
  const height = Math.max(280, trackHeight);
  return {
    width,
    height,
    scaleX: width / baseWidth,
    scaleY: height / baseHeight,
  };
}

// (The Big Bone loop maze that used to be a level here was removed per
// explicit user request; its art, assets/images/tight-squeeze-bone-cross.png,
// is no longer referenced. Git history has its traced two-route `paths`
// data if a loop-style maze with more than one open route is ever needed
// again.)

// Level 1 (per explicit user request): "The Cave Crawl" -- a painted cave wall with one straight,
// glowing horizontal tunnel from START (left) to FINISH (right). A gentle
// warm-up before the bone loop. Same image-as-canvas approach as the bone
// level: baseWidth/baseHeight are the image's own pixel size, so the route
// below is in that image's pixel coordinates.
//
// Traced by thresholding the lit tunnel (luminance > 200) column by column:
// its center sits at y ~846 across the whole width and its half-height is
// ~37 px (same as the bone level's corridor), so the route is a straight
// line along that center, from just inside the left edge to just inside the
// right edge (under the START / FINISH labels).
const TS_CAVE_IMAGE = require("../../assets/images/tight-squeeze-cave-straight.png");
const TS_CAVE_BASE_WIDTH = 941;
const TS_CAVE_BASE_HEIGHT = 1672;
const TS_CAVE_CENTER_Y = 846;
const TS_CAVE_PATH: TSPoint[] = Array.from({ length: 44 }, (_, i) => ({
  x: 40 + (i * (900 - 40)) / 43,
  y: TS_CAVE_CENTER_Y,
}));

const TS_CAVE_DESIGN: TSLevelDesign = {
  points: TS_CAVE_PATH,
  halfWidth: 37,
  baseWidth: TS_CAVE_BASE_WIDTH,
  baseHeight: TS_CAVE_BASE_HEIGHT,
  backgroundImage: TS_CAVE_IMAGE,
  boneRadius: 11,
  minAllowedHalfWidth: 9,
  finishRadius: 60,
  label: "The Cave Crawl",
  instructions: "Drag the paw through the glowing tunnel from START to FINISH. Don't scrape the cave walls!",
};

// Level 2 (per explicit user request): "The Winding Tunnel" -- the same
// cave wall, but the glowing tunnel now dips down in an S-curve around a
// boulder before rising back up to FINISH. Traced like the Cave Crawl: the
// lit tunnel (luminance > 200, largest connected region, so the START/FINISH
// lettering is excluded) gives a per-column centerline, smoothed and
// resampled to 70 evenly spaced points along its length. Measured against
// the full lit area (luminance > 170), every route point sits at least ~29px
// from a wall (median ~36), so halfWidth 34 with boneRadius 11 leaves a fair
// but noticeably tighter squeeze than level 1.
const TS_WAVE_IMAGE = require("../../assets/images/tight-squeeze-cave-wave.png");
const TS_WAVE_PATH: TSPoint[] = [
  { x: 30.0, y: 801.1 },
  { x: 44.0, y: 801.2 },
  { x: 58.1, y: 800.8 },
  { x: 72.1, y: 801.3 },
  { x: 86.2, y: 800.6 },
  { x: 100.2, y: 800.2 },
  { x: 114.2, y: 799.4 },
  { x: 128.2, y: 798.0 },
  { x: 141.8, y: 794.6 },
  { x: 155.1, y: 790.0 },
  { x: 168.2, y: 784.8 },
  { x: 181.2, y: 779.5 },
  { x: 194.6, y: 775.3 },
  { x: 208.2, y: 771.9 },
  { x: 222.3, y: 771.1 },
  { x: 236.2, y: 773.0 },
  { x: 249.9, y: 775.9 },
  { x: 262.7, y: 781.7 },
  { x: 274.6, y: 789.1 },
  { x: 285.8, y: 797.7 },
  { x: 296.4, y: 806.9 },
  { x: 306.5, y: 816.6 },
  { x: 316.4, y: 826.6 },
  { x: 326.2, y: 836.8 },
  { x: 335.9, y: 846.9 },
  { x: 345.4, y: 857.3 },
  { x: 355.2, y: 867.3 },
  { x: 365.0, y: 877.4 },
  { x: 375.3, y: 887.1 },
  { x: 386.6, y: 895.4 },
  { x: 398.5, y: 902.9 },
  { x: 411.3, y: 908.6 },
  { x: 424.9, y: 912.0 },
  { x: 438.9, y: 913.7 },
  { x: 452.9, y: 913.0 },
  { x: 466.9, y: 912.0 },
  { x: 480.7, y: 909.5 },
  { x: 494.1, y: 905.4 },
  { x: 507.0, y: 899.8 },
  { x: 519.4, y: 893.1 },
  { x: 531.1, y: 885.4 },
  { x: 542.6, y: 877.2 },
  { x: 554.0, y: 869.1 },
  { x: 565.1, y: 860.4 },
  { x: 576.3, y: 851.9 },
  { x: 587.8, y: 843.9 },
  { x: 599.5, y: 836.1 },
  { x: 611.7, y: 829.1 },
  { x: 624.5, y: 823.2 },
  { x: 637.7, y: 818.6 },
  { x: 651.5, y: 815.9 },
  { x: 665.5, y: 814.7 },
  { x: 679.5, y: 814.7 },
  { x: 693.5, y: 816.1 },
  { x: 707.1, y: 819.7 },
  { x: 720.4, y: 824.1 },
  { x: 733.2, y: 830.0 },
  { x: 745.7, y: 836.3 },
  { x: 758.3, y: 842.7 },
  { x: 771.4, y: 847.7 },
  { x: 784.9, y: 851.6 },
  { x: 798.7, y: 854.4 },
  { x: 812.7, y: 855.4 },
  { x: 826.7, y: 855.7 },
  { x: 840.8, y: 855.6 },
  { x: 854.8, y: 856.1 },
  { x: 868.9, y: 856.3 },
  { x: 882.9, y: 855.5 },
  { x: 896.9, y: 855.2 },
  { x: 911.0, y: 855.5 }
];

const TS_WAVE_DESIGN: TSLevelDesign = {
  points: TS_WAVE_PATH,
  halfWidth: 34,
  baseWidth: TS_CAVE_BASE_WIDTH,
  baseHeight: TS_CAVE_BASE_HEIGHT,
  backgroundImage: TS_WAVE_IMAGE,
  boneRadius: 11,
  minAllowedHalfWidth: 9,
  finishRadius: 60,
  label: "The Winding Tunnel",
  instructions: "Follow the tunnel down around the boulder and back up to FINISH. Careful on the curves!",
};

// Level 3 (per explicit user request): the same straight tunnel as level 1,
// but with rocks dropping through the middle of it. Three lanes spread along
// the tunnel, each dropping a rock every ~2s on its own offset, so the player
// has to time their dash under each one. Rocks start above the tunnel (over
// the painted wall, so they appear to come from the ceiling) and fall past
// it; each lane's rock spends roughly 0.7s crossing the tunnel and ~1.3s
// clear, which leaves a comfortable window to slip past at normal drag or
// D-pad speed.
const TS_ROCK_FALL_TOP = 650;
const TS_ROCK_FALL_BOTTOM = 1050;
const TS_FALLING_ROCKS: TSFallingRock[] = [
  { x: 250, radius: 26, period: 1900, phase: 0.0 },
  { x: 470, radius: 26, period: 2200, phase: 0.45 },
  { x: 690, radius: 26, period: 2000, phase: 0.8 },
];
const TS_ROCKFALL_DESIGN: TSLevelDesign = {
  ...TS_CAVE_DESIGN,
  fallingRocks: TS_FALLING_ROCKS,
  label: "Rockfall",
  instructions: "Same tunnel — but rocks are falling! Time your dash under each one. Touch a rock or a wall and it's game over.",
};

// Level 4 (per explicit user request): "The Switchback" -- a brighter cave
// with blue crystals, and a tunnel that zigzags up, down and up again through
// two tight hairpin turns on its way to FINISH. Unlike the earlier cave
// levels the tunnel runs vertically in places, so it was traced from the
// image's skeleton rather than column by column: threshold the lit tunnel
// (luminance > 200, largest connected region), skeletonize it to a
// one-pixel centerline, walk that from its leftmost point (START) to its
// rightmost (FINISH), smooth, and resample every ~18px (137 points, ends
// trimmed just inside the image edges). Against the full lit area
// (luminance > 170), every route point sits at least ~29px from a wall, so
// halfWidth 32 with boneRadius 11 is fair but tighter than levels 1-3.
const TS_SWITCHBACK_IMAGE = require("../../assets/images/tight-squeeze-cave-switchback.png");
const TS_SWITCHBACK_PATH: TSPoint[] = [
  { x: 49.5, y: 877.0 },
  { x: 67.5, y: 876.5 },
  { x: 85.6, y: 876.0 },
  { x: 103.7, y: 876.0 },
  { x: 121.7, y: 875.0 },
  { x: 139.7, y: 876.0 },
  { x: 157.8, y: 875.0 },
  { x: 175.9, y: 875.0 },
  { x: 194.0, y: 875.0 },
  { x: 212.0, y: 875.0 },
  { x: 230.1, y: 875.0 },
  { x: 248.2, y: 874.4 },
  { x: 265.1, y: 868.2 },
  { x: 279.1, y: 857.0 },
  { x: 287.0, y: 841.0 },
  { x: 290.0, y: 823.3 },
  { x: 291.0, y: 805.2 },
  { x: 290.8, y: 787.2 },
  { x: 291.0, y: 769.1 },
  { x: 291.0, y: 751.0 },
  { x: 290.0, y: 732.9 },
  { x: 290.7, y: 714.9 },
  { x: 290.5, y: 696.9 },
  { x: 290.0, y: 678.8 },
  { x: 290.0, y: 660.7 },
  { x: 290.0, y: 642.6 },
  { x: 290.0, y: 624.5 },
  { x: 290.3, y: 606.4 },
  { x: 290.4, y: 588.4 },
  { x: 290.0, y: 570.4 },
  { x: 290.0, y: 552.3 },
  { x: 290.0, y: 534.2 },
  { x: 290.0, y: 516.1 },
  { x: 290.0, y: 498.0 },
  { x: 291.0, y: 480.0 },
  { x: 291.0, y: 461.9 },
  { x: 291.0, y: 443.8 },
  { x: 291.0, y: 425.7 },
  { x: 292.0, y: 407.7 },
  { x: 292.2, y: 389.6 },
  { x: 295.4, y: 371.8 },
  { x: 303.7, y: 356.0 },
  { x: 317.6, y: 344.9 },
  { x: 335.1, y: 341.0 },
  { x: 353.1, y: 339.0 },
  { x: 371.1, y: 340.0 },
  { x: 389.2, y: 340.0 },
  { x: 407.3, y: 340.0 },
  { x: 425.4, y: 340.0 },
  { x: 443.5, y: 340.0 },
  { x: 461.4, y: 340.9 },
  { x: 478.4, y: 346.7 },
  { x: 492.0, y: 358.2 },
  { x: 499.3, y: 374.6 },
  { x: 501.0, y: 392.4 },
  { x: 501.0, y: 410.5 },
  { x: 501.0, y: 428.6 },
  { x: 501.0, y: 446.7 },
  { x: 501.0, y: 464.8 },
  { x: 501.1, y: 482.9 },
  { x: 502.0, y: 500.9 },
  { x: 501.0, y: 519.0 },
  { x: 501.0, y: 537.0 },
  { x: 501.0, y: 555.1 },
  { x: 502.0, y: 573.2 },
  { x: 501.9, y: 591.3 },
  { x: 501.0, y: 609.3 },
  { x: 501.7, y: 627.3 },
  { x: 502.0, y: 645.4 },
  { x: 502.0, y: 663.5 },
  { x: 502.0, y: 681.6 },
  { x: 502.0, y: 699.7 },
  { x: 502.0, y: 717.8 },
  { x: 502.0, y: 735.9 },
  { x: 502.0, y: 753.9 },
  { x: 502.0, y: 772.0 },
  { x: 502.0, y: 790.1 },
  { x: 502.0, y: 808.2 },
  { x: 502.0, y: 826.3 },
  { x: 502.0, y: 844.4 },
  { x: 502.0, y: 862.5 },
  { x: 502.0, y: 880.6 },
  { x: 502.0, y: 898.6 },
  { x: 502.0, y: 916.7 },
  { x: 502.0, y: 934.8 },
  { x: 502.0, y: 952.9 },
  { x: 502.0, y: 971.0 },
  { x: 502.0, y: 989.1 },
  { x: 502.0, y: 1007.2 },
  { x: 504.3, y: 1024.9 },
  { x: 509.6, y: 1042.1 },
  { x: 522.5, y: 1054.6 },
  { x: 538.8, y: 1061.7 },
  { x: 556.6, y: 1064.0 },
  { x: 574.7, y: 1064.2 },
  { x: 592.7, y: 1065.0 },
  { x: 610.8, y: 1065.0 },
  { x: 628.9, y: 1064.0 },
  { x: 646.9, y: 1065.0 },
  { x: 665.0, y: 1065.0 },
  { x: 683.1, y: 1065.0 },
  { x: 701.2, y: 1064.6 },
  { x: 719.0, y: 1061.6 },
  { x: 735.2, y: 1053.8 },
  { x: 746.6, y: 1040.0 },
  { x: 752.7, y: 1023.1 },
  { x: 754.0, y: 1005.1 },
  { x: 755.0, y: 987.1 },
  { x: 755.0, y: 969.0 },
  { x: 755.0, y: 950.9 },
  { x: 755.0, y: 932.8 },
  { x: 755.0, y: 914.7 },
  { x: 755.0, y: 896.6 },
  { x: 754.0, y: 878.6 },
  { x: 754.0, y: 860.5 },
  { x: 755.0, y: 842.5 },
  { x: 754.0, y: 824.4 },
  { x: 754.0, y: 806.3 },
  { x: 755.0, y: 788.3 },
  { x: 755.0, y: 770.2 },
  { x: 754.0, y: 752.2 },
  { x: 754.0, y: 734.1 },
  { x: 754.0, y: 716.0 },
  { x: 754.0, y: 697.9 },
  { x: 754.0, y: 679.8 },
  { x: 754.7, y: 661.8 },
  { x: 755.0, y: 643.7 },
  { x: 755.0, y: 625.6 },
  { x: 757.7, y: 607.8 },
  { x: 765.8, y: 592.0 },
  { x: 780.3, y: 581.4 },
  { x: 797.8, y: 577.1 },
  { x: 815.8, y: 576.0 },
  { x: 833.9, y: 576.0 },
  { x: 852.0, y: 576.0 },
  { x: 870.1, y: 576.0 },
  { x: 888.2, y: 576.0 }
];

const TS_SWITCHBACK_DESIGN: TSLevelDesign = {
  points: TS_SWITCHBACK_PATH,
  halfWidth: 32,
  baseWidth: TS_CAVE_BASE_WIDTH,
  baseHeight: TS_CAVE_BASE_HEIGHT,
  backgroundImage: TS_SWITCHBACK_IMAGE,
  boneRadius: 11,
  minAllowedHalfWidth: 9,
  finishRadius: 60,
  label: "The Switchback",
  instructions: "Up, down and up again — steer the paw around both hairpin turns to FINISH without brushing the walls.",
};

// Hand-traced levels, in order (index 0 = level 1). Append future critters
// here as they're drawn (trace a new reference image the same way
// TS_LEVEL1_LEFT_PATH/TS_LEVEL1_RIGHT_PATH were built, drop the image in as
// an asset, and set backgroundImage/boneRadius/minAllowedHalfWidth/
// finishRadius the same way TS_LEVEL1_DESIGN does — using `paths` only if
// the new maze is a loop with more than one genuinely open route; a single
// `points` route, like Rex's, covers the more common case). Anything past
// the end of this array falls back to buildProceduralLevelDesign.
const TS_CUSTOM_LEVELS: TSLevelDesign[] = [TS_CAVE_DESIGN, TS_WAVE_DESIGN, TS_ROCKFALL_DESIGN, TS_SWITCHBACK_DESIGN];

function buildProceduralLevelDesign(level: number): TSLevelDesign {
  const { points, halfWidth } = buildTightSqueezeLevelPath(level);
  return {
    points,
    halfWidth,
    baseWidth: TS_BASE_TRACK_WIDTH,
    baseHeight: TS_BASE_TRACK_HEIGHT,
    outlinePath: TS_DOG_OUTLINE_PATH,
    label: "",
    instructions:
      "Drag the bone through the hollow dog, from the collar down to the nose — the tunnel gets narrower and windier every level. Touch a wall and it's game over!",
  };
}

// Resolves any level number to its design: a hand-authored critter maze if
// one has been drawn for that level, otherwise the original procedural
// zigzag generator.
function getLevelDesign(level: number): TSLevelDesign {
  return TS_CUSTOM_LEVELS[level - 1] ?? buildProceduralLevelDesign(level);
}

export function TightSqueezeGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">("idle");
  const [level, setLevel] = useState(1);
  const [levelsCleared, setLevelsCleared] = useState(0);
  const [bestLevel, setBestLevel] = useState(0);
  const [lastCoins, setLastCoins] = useState(0);
  const [design, setDesign] = useState<TSLevelDesign>({
    points: [],
    halfWidth: TS_BASE_HALF_WIDTH,
    baseWidth: TS_BASE_TRACK_WIDTH,
    baseHeight: TS_BASE_TRACK_HEIGHT,
    outlinePath: TS_DOG_OUTLINE_PATH,
    label: "",
    instructions: "",
  });
  const [justCleared, setJustCleared] = useState(false);
  // Measured size of the play area below the title/score row — same pattern
  // every other full-screen minigame here uses (see fullscreen-minigames.md).
  const [playAreaSize, setPlayAreaSize] = useState({ width: 0, height: 0 });

  const gameStateRef = useRef(gameState);
  const levelRef = useRef(1);
  const levelsClearedRef = useRef(0);
  const designRef = useRef<TSLevelDesign>(design);
  const trackSizeRef = useRef({ width: TS_BASE_TRACK_WIDTH, height: TS_BASE_TRACK_HEIGHT });
  const clearedFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bone position in the base (design-space) coordinate system — a plain ref
  // (not React state) since it changes on every pan-move event; bonePosX/Y
  // (Animated.Values, in real screen pixels) drive the actual on-screen
  // position via a native-driven transform, so dragging never triggers a
  // re-render. boneDragStartRef anchors each individual touch-drag gesture,
  // same pattern the old dogDragStartXRef used, extended to 2D.
  const boneBaseRef = useRef<TSPoint>({ ...TS_TUNNEL_ANCHOR_TOP });
  const boneDragStartRef = useRef<TSPoint>({ ...TS_TUNNEL_ANCHOR_TOP });
  const bonePosX = useRef(new Animated.Value(0)).current;
  const bonePosY = useRef(new Animated.Value(0)).current;
  // Falling-rock hazard (levels with design.fallingRocks): one screen-space
  // Y position + spin per lane, driven by the rAF loop below. Pool of 6 is
  // more than any level uses; unused lanes just aren't rendered.
  const rockPosY = useRef(Array.from({ length: 6 }, () => new Animated.Value(-9999))).current;
  const rockSpin = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Re-applies the bone's on-screen position whenever the level or the
  // measured play-area size changes -- fixes an explicit user-reported bug
  // ("the black dot is not showing up when the minigame first loads").
  // placeBoneAt already calls bonePosX/Y.setValue(...) synchronously inside
  // startGame/loadLevel, but that runs mid-event-handler, before this render
  // has actually committed -- and an Animated.Value driving a transform
  // directly (no timing/spring call in between) isn't guaranteed to reflect
  // an already-set value the very first time the component using it mounts,
  // especially on web. Running the same re-placement in a useEffect (which
  // fires only after the commit, once the new "playing" JSX has actually
  // mounted) gives it the extra nudge to guarantee the dot is correctly
  // positioned and visible right when a level appears, not just after the
  // first drag/D-pad move happens to recompute it anyway.
  useEffect(() => {
    if (gameState === "idle") return;
    const layout = computeTightSqueezeLayout(
      trackSizeRef.current.width,
      trackSizeRef.current.height,
      design.baseWidth,
      design.baseHeight
    );
    bonePosX.setValue(boneBaseRef.current.x * layout.scaleX);
    bonePosY.setValue(boneBaseRef.current.y * layout.scaleY);
  }, [gameState, design, playAreaSize.width, playAreaSize.height]);

  useEffect(() => {
    return () => {
      if (clearedFlashTimeoutRef.current) clearTimeout(clearedFlashTimeoutRef.current);
    };
  }, []);

  // Falling rocks: while a level with rocks is being played, move every rock
  // each animation frame and end the run if one touches the paw. Collision is
  // done in design space (the same space as the tunnel walls), treating rock
  // and paw as circles: hit when their centres are closer than
  // rock.radius + the level's boneRadius. Restarts cleanly whenever the level
  // changes (the loop's time base resets, so every attempt at the level sees
  // the same rock pattern).
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
      const layout = computeTightSqueezeLayout(
        trackSizeRef.current.width,
        trackSizeRef.current.height,
        d.baseWidth,
        d.baseHeight
      );
      const boneR = d.boneRadius ?? TS_BONE_RADIUS;
      const bone = boneBaseRef.current;
      const t = now - start;
      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        const p = (t / r.period + r.phase) % 1;
        const y = TS_ROCK_FALL_TOP + p * (TS_ROCK_FALL_BOTTOM - TS_ROCK_FALL_TOP);
        rockPosY[i].setValue(y * layout.scaleY);
        rockSpin[i].setValue(p * 220);
        const dx = bone.x - r.x;
        const dy = bone.y - y;
        const hit = r.radius + boneR;
        if (dx * dx + dy * dy < hit * hit) {
          endGame();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, design]);

  // Moves the bone (ref + Animated visual position) to `point`. When called
  // mid-drag (level cleared while the same touch is still held down), pass
  // the gesture's current cumulative dx/dy as `gestureOffset` so
  // boneDragStartRef is backed out accordingly — PanResponder's gesture.dx/dy
  // keep accumulating from the ORIGINAL touch-down, not from this reset, so
  // without this adjustment the next move event would double-count all the
  // motion already dragged this gesture and the bone would jump incorrectly.
  const placeBoneAt = (point: TSPoint, gestureOffset?: { dx: number; dy: number }) => {
    boneBaseRef.current = { ...point };
    const layout = computeTightSqueezeLayout(
      trackSizeRef.current.width,
      trackSizeRef.current.height,
      designRef.current.baseWidth,
      designRef.current.baseHeight
    );
    boneDragStartRef.current = gestureOffset
      ? {
          x: point.x - gestureOffset.dx / layout.scaleX,
          y: point.y - gestureOffset.dy / layout.scaleY,
        }
      : { ...point };
    bonePosX.setValue(point.x * layout.scaleX);
    bonePosY.setValue(point.y * layout.scaleY);
  };

  const endGame = () => {
    if (gameStateRef.current !== "playing") return;
    gameStateRef.current = "gameover";
    setGameState("gameover");

    setBestLevel((prev) => Math.max(prev, levelRef.current));
    const coinsEarned = levelsClearedRef.current * TS_COINS_PER_LEVEL_CLEARED;
    if (coinsEarned > 0) earnCoins(coinsEarned);
    setLastCoins(coinsEarned);
  };

  const loadLevel = (levelNumber: number, gestureOffset?: { dx: number; dy: number }) => {
    const newDesign = getLevelDesign(levelNumber);
    designRef.current = newDesign;
    setDesign(newDesign);
    placeBoneAt(newDesign.points[0], gestureOffset);
  };

  // `gesture` is only needed when called mid-drag (see loadLevel/placeBoneAt
  // comments on why); the D-pad has no PanResponder gesture in flight, so it
  // calls this with no argument and boneDragStartRef just resets cleanly to
  // the new level's start point instead.
  const handleLevelComplete = (gesture?: { dx: number; dy: number }) => {
    levelsClearedRef.current += 1;
    setLevelsCleared(levelsClearedRef.current);
    const nextLevel = levelRef.current + 1;
    levelRef.current = nextLevel;
    setLevel(nextLevel);
    loadLevel(nextLevel, gesture);

    setJustCleared(true);
    if (clearedFlashTimeoutRef.current) clearTimeout(clearedFlashTimeoutRef.current);
    clearedFlashTimeoutRef.current = setTimeout(() => setJustCleared(false), 900);
  };

  const startGame = () => {
    levelRef.current = 1;
    setLevel(1);
    levelsClearedRef.current = 0;
    setLevelsCleared(0);
    setJustCleared(false);
    loadLevel(1);
    setGameState("playing");
    gameStateRef.current = "playing";
  };

  // Touch-relative drag (grab wherever you touch the dot, move by the
  // finger's delta), but — unlike the free touch-anywhere-on-the-track
  // scheme this used to share with every other minigame here — gated to
  // touches that actually start near the dot (see TS_BONE_GRAB_RADIUS):
  // per explicit user request, touching anywhere else on the track should
  // do nothing rather than snapping the dot over to that touch. Reads
  // trackSizeRef/designRef/boneBaseRef fresh each event (rather than closing
  // over the outer `layout`/`design`) so the scale factors and the dot's
  // current position always reflect the latest state even though the
  // PanResponder itself is only ever created once.
  const isTouchNearBone = (evt: { nativeEvent: { locationX: number; locationY: number } }) => {
    const currentDesign = designRef.current;
    const layout = computeTightSqueezeLayout(
      trackSizeRef.current.width,
      trackSizeRef.current.height,
      currentDesign.baseWidth,
      currentDesign.baseHeight
    );
    const boneScreenX = boneBaseRef.current.x * layout.scaleX;
    const boneScreenY = boneBaseRef.current.y * layout.scaleY;
    const { locationX, locationY } = evt.nativeEvent;
    return Math.hypot(locationX - boneScreenX, locationY - boneScreenY) <= TS_BONE_GRAB_RADIUS;
  };

  // Shared by both input methods (touch-drag below, and the D-pad's hold-to-
  // move loop further down): clamps to the level's canvas, moves the bone
  // ref + Animated visual position, then runs the same finish/wall checks
  // either one would otherwise have had to duplicate. `gesture` is only ever
  // passed through from the PanResponder (see handleLevelComplete comment);
  // the D-pad calls this with no gesture.
  const attemptMoveBoneTo = (
    nextXRaw: number,
    nextYRaw: number,
    gesture?: { dx: number; dy: number }
  ) => {
    if (gameStateRef.current !== "playing") return;
    const currentDesign = designRef.current;
    const layout = computeTightSqueezeLayout(
      trackSizeRef.current.width,
      trackSizeRef.current.height,
      currentDesign.baseWidth,
      currentDesign.baseHeight
    );
    const nextX = Math.max(0, Math.min(currentDesign.baseWidth, nextXRaw));
    const nextY = Math.max(0, Math.min(currentDesign.baseHeight, nextYRaw));
    boneBaseRef.current = { x: nextX, y: nextY };
    bonePosX.setValue(nextX * layout.scaleX);
    bonePosY.setValue(nextY * layout.scaleY);

    if (currentDesign.points.length < 2) return;

    const last = currentDesign.points[currentDesign.points.length - 1];
    const finishRadius = currentDesign.finishRadius ?? TS_FINISH_RADIUS;
    if (Math.hypot(nextX - last.x, nextY - last.y) <= finishRadius) {
      handleLevelComplete(gesture);
      return;
    }

    const allowedHalfWidth = Math.max(
      currentDesign.minAllowedHalfWidth ?? TS_MIN_ALLOWED_HALF_WIDTH,
      currentDesign.halfWidth - (currentDesign.boneRadius ?? TS_BONE_RADIUS)
    );
    // A design with multiple independently-checked sub-routes (e.g. the
    // bone maze's separate top/bottom arcs — see the TSLevelDesign `paths`
    // comment) is "inside" as long as the bone is inside ANY one of them; a
    // single-route design just checks its one points array.
    const subPaths = currentDesign.paths ?? [currentDesign.points];
    const insideAnyPath = subPaths.some((sp) =>
      isBoneInsideTunnel({ x: nextX, y: nextY }, sp, allowedHalfWidth)
    );
    if (!insideAnyPath) {
      endGame();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) =>
        gameStateRef.current === "playing" && isTouchNearBone(evt),
      onMoveShouldSetPanResponder: (evt, gesture) =>
        gameStateRef.current === "playing" &&
        (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2) &&
        isTouchNearBone(evt),
      onPanResponderGrant: () => {
        boneDragStartRef.current = { ...boneBaseRef.current };
      },
      onPanResponderMove: (_evt, gesture) => {
        const layout = computeTightSqueezeLayout(
          trackSizeRef.current.width,
          trackSizeRef.current.height,
          designRef.current.baseWidth,
          designRef.current.baseHeight
        );
        attemptMoveBoneTo(
          boneDragStartRef.current.x + gesture.dx / layout.scaleX,
          boneDragStartRef.current.y + gesture.dy / layout.scaleY,
          gesture
        );
      },
    })
  ).current;

  // D-pad hold-to-move, per explicit user request: "add a pad where there is
  // an up arrow, down arrow, right and left off to the side for navigation"
  // — an alternative to dragging, not a replacement for it. Holding a button
  // moves the dot continuously at TS_DPAD_SPEED (screen px/sec) via a
  // requestAnimationFrame loop (same crisp, drift-free per-frame-elapsed
  // pattern WalkingSprite's bob/sway animation uses) until released;
  // releasing (or the button losing the gesture, e.g. the finger sliding
  // off) stops it. Reuses attemptMoveBoneTo so the finish/wall checks stay
  // in exactly one place.
  const dpadDirectionRef = useRef<{ dx: number; dy: number } | null>(null);
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
    if (dpadDirectionRef.current === null || gameStateRef.current !== "playing") {
      stopDpadLoop();
      return;
    }
    if (dpadLastTimeRef.current === null) dpadLastTimeRef.current = time;
    const elapsedSec = (time - dpadLastTimeRef.current) / 1000;
    dpadLastTimeRef.current = time;

    const layout = computeTightSqueezeLayout(
      trackSizeRef.current.width,
      trackSizeRef.current.height,
      designRef.current.baseWidth,
      designRef.current.baseHeight
    );
    const { dx, dy } = dpadDirectionRef.current;
    attemptMoveBoneTo(
      boneBaseRef.current.x + (dx * TS_DPAD_SPEED * elapsedSec) / layout.scaleX,
      boneBaseRef.current.y + (dy * TS_DPAD_SPEED * elapsedSec) / layout.scaleY
    );

    dpadRafRef.current = requestAnimationFrame(dpadTick);
  };

  const startDpadMove = (dx: number, dy: number) => {
    if (gameStateRef.current !== "playing") return;
    dpadDirectionRef.current = { dx, dy };
    dpadLastTimeRef.current = null;
    if (dpadRafRef.current === null) {
      dpadRafRef.current = requestAnimationFrame(dpadTick);
    }
  };

  const stopDpadMove = () => {
    dpadDirectionRef.current = null;
    stopDpadLoop();
  };

  useEffect(() => stopDpadLoop, []);

  // One button-renderer for all 8 directions (see the D-pad JSX further
  // down) rather than 8 near-identical PressableScale blocks -- added
  // per explicit follow-up request: "add diagonal arrow keys too". dx/dy
  // are already unit-length (diagonals pre-normalized by Math.SQRT1_2 at
  // each call site below) so every direction, cardinal or diagonal, moves
  // at the same TS_DPAD_SPEED rather than diagonals feeling faster.
  const renderDpadButton = (dx: number, dy: number, label: string) => (
    <PressableScale
      style={[
        styles.tsDpadButton,
        { backgroundColor: theme.card.background, borderColor: theme.card.border },
      ]}
      onPressIn={() => startDpadMove(dx, dy)}
      onPressOut={stopDpadMove}
    >
      <Text style={[styles.tsDpadArrow, { color: theme.text.primary }]}>{label}</Text>
    </PressableScale>
  );

  const layout = computeTightSqueezeLayout(
    playAreaSize.width || trackSizeRef.current.width,
    playAreaSize.height || trackSizeRef.current.height,
    design.baseWidth,
    design.baseHeight
  );
  const boneSize = Math.round(20 * layout.scaleX);
  // The draggable piece itself, per explicit user request ("instead of a
  // bone, have the user drag a mini black dot for now"): a small solid
  // circle instead of the placeholder bone emoji. boneSize above still sizes
  // the invisible drag wrapper/touch target (unchanged, so the hit area
  // stays just as forgiving); this is only the visible dot drawn inside it.
  // Floor raised from 8 to 14 (plus the white ring below) per explicit
  // follow-up ("when you start the game i want the black dot to be
  // visible") — at small screen sizes/scale factors the old floor could
  // render it small enough to get lost against the wide white corridor,
  // especially right at the start point before you know where to look.
  const boneDotSize = Math.max(14, Math.round(boneSize * 0.55));
  // Per explicit user request the dot is now a paw print (see TSPawMarker).
  // Drawn a bit larger than the old dot so the toes read, but it's purely
  // visual: the drag target (boneSize) and collision radius are unchanged.
  const pawSize = Math.max(20, Math.round(boneDotSize * 1.45));
  // One SVG path string per independently-checked sub-route (see the
  // TSLevelDesign `paths` comment) — a single-route design just gets a
  // one-element array here, same as before.
  const tunnelPathStrings = (design.paths ?? [design.points]).map(buildTunnelPathString);

  // No title prop below -- per explicit user request, Tight Squeeze runs
  // without the top banner while the game is open (every other MinigameShell
  // consumer still passes one; this is a Tight-Squeeze-only opt-out).
  return (
    <MinigameShell onExit={onExit}>

      {gameState !== "idle" && (
        <View style={[sharedGameStyles.scoreRow, { width: layout.width }]}>
          <Text style={[sharedGameStyles.scoreText, { color: theme.text.primary }]}>
            🦴 Level {level}
            {design.label ? `: ${design.label}` : ""}
          </Text>
          <Text style={[sharedGameStyles.bestScoreText, { color: theme.text.secondary }]}>
            Best {Math.max(bestLevel, gameState === "playing" ? level : 0)}
          </Text>
        </View>
      )}

      <View
        style={sharedGameStyles.gameFullScreenPlayWrap}
        onLayout={(e) => {
          const width = Math.round(e.nativeEvent.layout.width);
          const height = Math.round(e.nativeEvent.layout.height);
          trackSizeRef.current = { width, height };
          setPlayAreaSize((prev) =>
            prev.width === width && prev.height === height ? prev : { width, height }
          );
        }}
      >
        {gameState === "idle" ? (
          <View style={sharedGameStyles.gameFullScreenIdleContent}>
            <Text style={[sharedGameStyles.gameSubtitle, { color: theme.text.secondary }]}>
              Drag the bone through each hollow critter, start to finish —
              the squeeze gets tighter every level. Touch a wall and it's
              game over!
            </Text>
            <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
              <Text style={sharedGameStyles.primaryButtonText}>Start Game</Text>
            </PressableScale>
          </View>
        ) : (
          playAreaSize.width > 0 && (
            <View
              style={[styles.tsTrack, { width: layout.width, height: layout.height }]}
              {...panResponder.panHandlers}
            >
              {design.backgroundImage && (
                // The real reference art, stretched non-uniformly to exactly
                // fill the same layout.width x layout.height box the Svg
                // below fills — same resizeMode="stretch" idea as the Svg's
                // preserveAspectRatio="none", so the traced route points
                // (that image's own pixel coordinates) always land on the
                // correct spot no matter what aspect ratio this device's
                // play area measures out to.
                <Image
                  source={design.backgroundImage}
                  resizeMode="stretch"
                  style={{ width: layout.width, height: layout.height }}
                />
              )}
              <Svg
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${design.baseWidth} ${design.baseHeight}`}
                // Stretches independently on each axis to fill whatever screen
                // this is running full-screen on — same scaleX/scaleY idea
                // every other scaled minigame here uses, just applied via the
                // SVG viewBox instead of by rescaling each path coordinate.
                preserveAspectRatio="none"
                style={StyleSheet.absoluteFill}
              >
                {design.backgroundImage ? (
                  // The real image already shows the tunnel, so there's no
                  // placeholder ribbon/outline to draw here — just a very
                  // faint dashed centerline per sub-route (matches the
                  // collision paths exactly) as a light steering aid on top
                  // of the art. A multi-route design (e.g. the bone maze's
                  // top/bottom arcs) draws one dashed line per route rather
                  // than joining them, so there's no stray stitch cutting
                  // across the solid middle.
                  tunnelPathStrings.map((d, i) => (
                    <Path
                      key={`tunnel-${i}`}
                      d={d}
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth={1.5}
                      strokeDasharray="5 6"
                      fill="none"
                    />
                  ))
                ) : (
                  <>
                    {/* Translucent tunnel "ribbon" along the level's path, drawn under the hollow dog outline so it reads as the carved-out passage inside it. Placeholder styling; revisit once real tunnel/dog art is available. */}
                    {tunnelPathStrings.map((d, i) => (
                      <Path
                        key={`ribbon-${i}`}
                        d={d}
                        stroke="rgba(255,196,120,0.35)"
                        strokeWidth={design.halfWidth * 2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    ))}
                    {tunnelPathStrings.map((d, i) => (
                      <Path
                        key={`dash-${i}`}
                        d={d}
                        stroke="rgba(255,255,255,0.55)"
                        strokeWidth={1.5}
                        strokeDasharray="5 6"
                        fill="none"
                      />
                    ))}
                    {/* Hollow (stroke-only, no fill) critter silhouette — decorative only, not part of the tunnel/collision path. Placeholder head shape for procedural levels; image-based levels (like Rex) skip this entirely since the real art already shows it. */}
                    {design.outlinePath && (
                      <Path d={design.outlinePath} fill="none" stroke="#4A3220" strokeWidth={5} strokeLinejoin="round" />
                    )}
                  </>
                )}
                {design.points.length > 0 && (
                  <Circle cx={design.points[0].x} cy={design.points[0].y} r={6} fill="#3DBE64" />
                )}
                {design.points.length > 0 && (
                  <Circle
                    cx={design.points[design.points.length - 1].x}
                    cy={design.points[design.points.length - 1].y}
                    r={6}
                    fill="#E0483E"
                  />
                )}
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
                          {
                            rotate: rockSpin[i].interpolate({
                              inputRange: [0, 360],
                              outputRange: ["0deg", "360deg"],
                            }),
                          },
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

              {justCleared && (
                <View style={[styles.tsClearedBanner, { pointerEvents: "none" }]}>
                  <Text style={styles.tsClearedBannerText}>Level {level - 1} clear!</Text>
                </View>
              )}

              {/* D-pad, per explicit user request: an up/down/left/right pad off to
                  the side, as an alternative to dragging (not a replacement for it —
                  the touch-drag from before still works exactly as it did), later
                  extended to all 8 directions per follow-up request ("add diagonal
                  arrow keys too") -- a plain 3x3 grid with an empty center cell.
                  Bottom-right, inset from the track's own edge so it clears the
                  safe area on notched/home-indicator phones same as the exit
                  button/title badge do up top. Only while actively playing --
                  there's nothing useful for it to do once a run has ended. */}
              {gameState === "playing" && (
              <View
                style={[
                  styles.tsDpad,
                  { bottom: insets.bottom + 16, right: insets.right + 16 },
                ]}
              >
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
        <Text style={[sharedGameStyles.instructionsText, { color: theme.text.secondary }]}>
          {design.instructions || "Drag the bone from the green dot to the red dot · Touching a wall ends the run"}
        </Text>
      )}

      {gameState === "gameover" && (
        <>
          <Text style={[sharedGameStyles.gameOverText, { color: theme.text.primary }]}>
            Hit a wall on level {level}! Cleared {levelsCleared}{" "}
            level{levelsCleared === 1 ? "" : "s"} this run 🎉{" "}
            {lastCoins > 0 ? `+${lastCoins} coins` : "Steady those hands next time!"}
          </Text>
          <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
            <Text style={sharedGameStyles.primaryButtonText}>Play Again</Text>
          </PressableScale>
        </>
      )}
    </MinigameShell>
  );
}

const styles = StyleSheet.create({
  tsTrack: {
    width: TS_BASE_TRACK_WIDTH,
    height: TS_BASE_TRACK_HEIGHT,
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

  tsClearedBanner: {
    position: "absolute",
    top: 16,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },

  tsClearedBannerText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  // D-pad (see the file-level comment above the JSX) — a full 3x3 grid (8
  // directional buttons + an empty center) now that diagonals were added.
  // Buttons sized down from the original 48x48 (sized back when this was a
  // 4-button "+" shape) to 40x40 so the 3x3 grid doesn't balloon to ~162px
  // square -- still comfortably tappable, just not oversized now that there
  // are twice as many buttons.
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
    width: 40,
    height: 40,
    margin: 2,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Same footprint as tsDpadButton so the grid's empty center stays evenly
  // spaced rather than the surrounding buttons collapsing in around it.
  tsDpadSpacer: {
    width: 40,
    height: 40,
    margin: 2,
  },

  tsDpadArrow: {
    fontSize: 17,
    fontWeight: "800",
  },
});


// The draggable piece: a paw print (per explicit user request, replacing the
// small black dot). Black pads with a white outline, same as the old dot's
// white ring, so it stays readable on both the white corridor and the darker
// art around it. The outline is drawn as a slightly fatter white copy of each
// pad underneath the black one.
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
        // Rotate via a plain SVG transform string (rotation/origin props emit a
        // transform-origin DOM attribute on react-native-web, which React warns about).
        <G key={i} transform={`rotate(${t.rot} ${t.cx} ${t.cy})`}>
          <Ellipse
            cx={t.cx}
            cy={t.cy}
            rx={t.rx}
            ry={t.ry}
            fill={fill}
            stroke={stroke}
            strokeWidth={stroke ? 2.6 : 0}
          />
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


// A falling rock: a chunky faceted boulder in the same warm browns as the
// cave art (dark base, lighter top-left facet, a thin highlight edge), drawn
// to fill whatever box it's given so it scales with the level.
function TSRock() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 48 48">
      <Path
        d="M14 6 L32 4 L43 14 L45 30 L36 43 L18 45 L6 36 L3 20 Z"
        fill="#4A2E1E"
        stroke="#2B1A10"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M14 6 L32 4 L38 16 L22 22 L8 18 Z" fill="#7A5236" />
      <Path d="M22 22 L38 16 L43 28 L30 34 Z" fill="#5E3C27" />
      <Path d="M14 6 L32 4" stroke="#B07A4E" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
