import { useEffect, useRef, useState } from "react";
import { Animated, Image, PanResponder, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

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

// --- Level 1: "The Big Bone" ---
// The actual reference image, dropped in as a project asset and rendered
// full-bleed behind the play area (see the render logic further down) —
// this is the real art, not a redraw. Same cross-shaped bone maze as
// before, re-supplied with a thicker corridor and a corrected FINISH arrow
// (now pointing up, matching the direction you actually travel) — re-traced
// from scratch rather than reusing the old points, since the wider line
// moves the true centerline slightly.
const TS_LEVEL1_IMAGE = require("../../assets/images/tight-squeeze-bone-cross.png");

// The image's own native pixel size. Used as this level's design-space
// canvas (baseWidth/baseHeight) so the traced points below — which are
// literally that image's own pixel coordinates — and the <Image> both scale
// by the exact same scaleX/scaleY every frame and never drift apart.
const TS_LEVEL1_BASE_WIDTH = 941;
const TS_LEVEL1_BASE_HEIGHT = 1672;

// Corridor half-width, bone(-token) fairness-inset, and finish tolerance,
// all tuned to this image's own pixel scale. 37 matches the measured median
// half-width of the maze line itself (distance-transform sampled along its
// skeleton, min ~32 — noticeably thicker than the previous version of this
// image); a boneRadius of 11 (allowed corridor = halfWidth - boneRadius =
// 26) keeps every point of the route navigable with a little room to spare
// rather than a literal pixel-perfect squeeze.
const TS_LEVEL1_HALF_WIDTH = 37;
const TS_LEVEL1_BONE_RADIUS = 11;
const TS_LEVEL1_MIN_ALLOWED_HALF_WIDTH = 9;
const TS_LEVEL1_FINISH_RADIUS = 60;

// This image is a straight vertical stem (start at the bottom, finish at
// the top) running through a closed bone-shaped loop in the middle: the
// stem meets the loop at two junction points, and the loop's left knob and
// right knob are both genuinely open white channel connecting those two
// junctions — there's no single "real" path through the loop, the art
// itself offers two. So, same as before, this level uses `paths` (two
// independently-checked polylines, sharing the same start/finish points)
// instead of a single `points` route — see the TSLevelDesign comment above
// for why concatenating them into one array would be wrong (the seam
// between the two would read as a false shortcut straight through the
// solid middle of the bone).
//
// Extracted the same way as before: threshold the image to isolate the
// white line from the brown fill, connected-component-filter out the
// START/FINISH lettering and arrows, skeletonize to a centerline, find the
// two degree-3+ junction nodes where the shared start/finish stems meet the
// loop, shortest-path each stem once, then shortest-path junction-to-
// junction twice (once normally for the left-knob arc, once more after
// deleting that arc's edges from the graph to force the right-knob arc),
// and resample each full stem+arc+stem route to 140 evenly-spaced points.
const TS_LEVEL1_LEFT_PATH: TSPoint[] = [
    { x: 464.0, y: 1632.0 }, { x: 465.0, y: 1613.2 }, { x: 465.0, y: 1594.0 }, { x: 465.0, y: 1574.8 },
    { x: 465.0, y: 1555.6 }, { x: 465.0, y: 1536.4 }, { x: 465.0, y: 1517.2 }, { x: 465.0, y: 1498.0 },
    { x: 465.0, y: 1478.9 }, { x: 465.0, y: 1459.7 }, { x: 465.0, y: 1440.5 }, { x: 465.0, y: 1421.3 },
    { x: 465.0, y: 1402.1 }, { x: 465.0, y: 1382.9 }, { x: 465.0, y: 1363.7 }, { x: 465.0, y: 1344.5 },
    { x: 465.0, y: 1325.3 }, { x: 465.0, y: 1306.1 }, { x: 465.0, y: 1286.9 }, { x: 465.0, y: 1267.7 },
    { x: 465.0, y: 1248.5 }, { x: 465.0, y: 1229.3 }, { x: 465.0, y: 1210.1 }, { x: 465.0, y: 1190.9 },
    { x: 465.0, y: 1171.7 }, { x: 465.0, y: 1152.5 }, { x: 465.0, y: 1133.3 }, { x: 465.0, y: 1114.1 },
    { x: 465.0, y: 1094.9 }, { x: 465.0, y: 1075.8 }, { x: 465.0, y: 1056.6 }, { x: 465.0, y: 1037.4 },
    { x: 465.0, y: 1018.2 }, { x: 465.0, y: 999.0 }, { x: 465.0, y: 979.8 }, { x: 465.0, y: 960.6 },
    { x: 466.0, y: 941.8 }, { x: 462.4, y: 925.0 }, { x: 445.3, y: 920.0 }, { x: 426.5, y: 919.0 },
    { x: 407.3, y: 919.0 }, { x: 388.1, y: 919.0 }, { x: 368.9, y: 919.0 }, { x: 349.7, y: 919.0 },
    { x: 331.0, y: 920.0 }, { x: 312.2, y: 921.0 }, { x: 294.2, y: 923.8 }, { x: 276.3, y: 927.0 },
    { x: 260.3, y: 934.7 }, { x: 247.4, y: 948.6 }, { x: 237.4, y: 963.6 }, { x: 227.0, y: 978.5 },
    { x: 213.5, y: 991.5 }, { x: 197.9, y: 1000.1 }, { x: 180.7, y: 1005.0 }, { x: 162.7, y: 1008.0 },
    { x: 144.3, y: 1008.0 }, { x: 126.4, y: 1005.0 }, { x: 108.9, y: 1000.9 }, { x: 93.3, y: 992.3 },
    { x: 79.1, y: 980.1 }, { x: 67.7, y: 965.7 }, { x: 60.5, y: 949.5 }, { x: 57.0, y: 931.7 },
    { x: 54.0, y: 913.7 }, { x: 57.0, y: 895.8 }, { x: 60.1, y: 877.9 }, { x: 67.3, y: 861.7 },
    { x: 78.1, y: 846.9 }, { x: 91.5, y: 834.5 }, { x: 102.0, y: 820.8 }, { x: 106.5, y: 803.5 },
    { x: 102.4, y: 786.4 }, { x: 92.8, y: 771.8 }, { x: 78.6, y: 759.6 }, { x: 67.9, y: 744.9 },
    { x: 60.7, y: 728.7 }, { x: 57.0, y: 711.0 }, { x: 54.0, y: 693.0 }, { x: 56.2, y: 674.8 },
    { x: 60.0, y: 657.1 }, { x: 66.0, y: 640.4 }, { x: 76.5, y: 625.5 }, { x: 89.6, y: 612.4 },
    { x: 104.9, y: 603.0 }, { x: 121.6, y: 597.0 }, { x: 139.6, y: 594.0 }, { x: 157.1, y: 592.0 },
    { x: 175.5, y: 594.0 }, { x: 193.0, y: 598.0 }, { x: 209.2, y: 605.2 }, { x: 223.7, y: 616.7 },
    { x: 235.8, y: 630.8 }, { x: 245.0, y: 646.2 }, { x: 255.2, y: 661.2 }, { x: 269.4, y: 673.4 },
    { x: 286.5, y: 678.5 }, { x: 304.2, y: 682.0 }, { x: 322.6, y: 684.0 }, { x: 341.3, y: 685.0 },
    { x: 360.1, y: 684.0 }, { x: 379.3, y: 684.0 }, { x: 398.5, y: 684.0 }, { x: 417.7, y: 684.0 },
    { x: 436.9, y: 684.0 }, { x: 454.8, y: 681.0 }, { x: 465.0, y: 671.0 }, { x: 465.0, y: 651.8 },
    { x: 465.0, y: 632.6 }, { x: 465.0, y: 613.4 }, { x: 465.0, y: 594.2 }, { x: 465.0, y: 575.1 },
    { x: 465.0, y: 555.9 }, { x: 465.0, y: 536.7 }, { x: 465.0, y: 517.5 }, { x: 465.0, y: 498.3 },
    { x: 465.0, y: 479.1 }, { x: 465.0, y: 459.9 }, { x: 465.0, y: 440.7 }, { x: 465.0, y: 421.5 },
    { x: 465.0, y: 402.3 }, { x: 465.0, y: 383.1 }, { x: 465.0, y: 363.9 }, { x: 465.0, y: 344.7 },
    { x: 465.0, y: 325.5 }, { x: 465.0, y: 306.3 }, { x: 465.0, y: 287.1 }, { x: 465.0, y: 267.9 },
    { x: 465.0, y: 248.7 }, { x: 465.0, y: 229.5 }, { x: 465.0, y: 210.3 }, { x: 465.0, y: 191.1 },
    { x: 465.0, y: 172.0 }, { x: 465.0, y: 152.8 }, { x: 465.0, y: 133.6 }, { x: 465.0, y: 114.4 },
    { x: 465.0, y: 95.2 }, { x: 465.0, y: 76.0 }, { x: 465.0, y: 56.8 }, { x: 466.0, y: 38.0 },
];

const TS_LEVEL1_RIGHT_PATH: TSPoint[] = [
    { x: 464.0, y: 1632.0 }, { x: 465.0, y: 1613.1 }, { x: 465.0, y: 1593.8 }, { x: 465.0, y: 1574.5 },
    { x: 465.0, y: 1555.2 }, { x: 465.0, y: 1535.9 }, { x: 465.0, y: 1516.6 }, { x: 465.0, y: 1497.3 },
    { x: 465.0, y: 1478.0 }, { x: 465.0, y: 1458.7 }, { x: 465.0, y: 1439.4 }, { x: 465.0, y: 1420.1 },
    { x: 465.0, y: 1400.8 }, { x: 465.0, y: 1381.5 }, { x: 465.0, y: 1362.2 }, { x: 465.0, y: 1342.9 },
    { x: 465.0, y: 1323.6 }, { x: 465.0, y: 1304.3 }, { x: 465.0, y: 1284.9 }, { x: 465.0, y: 1265.6 },
    { x: 465.0, y: 1246.3 }, { x: 465.0, y: 1227.0 }, { x: 465.0, y: 1207.7 }, { x: 465.0, y: 1188.4 },
    { x: 465.0, y: 1169.1 }, { x: 465.0, y: 1149.8 }, { x: 465.0, y: 1130.5 }, { x: 465.0, y: 1111.2 },
    { x: 465.0, y: 1091.9 }, { x: 465.0, y: 1072.6 }, { x: 465.0, y: 1053.3 }, { x: 465.0, y: 1034.0 },
    { x: 465.0, y: 1014.7 }, { x: 465.0, y: 995.4 }, { x: 465.0, y: 976.1 }, { x: 465.0, y: 956.8 },
    { x: 466.0, y: 937.9 }, { x: 473.2, y: 924.0 }, { x: 490.8, y: 920.0 }, { x: 509.7, y: 919.0 },
    { x: 529.0, y: 919.0 }, { x: 548.3, y: 919.0 }, { x: 567.6, y: 919.0 }, { x: 586.9, y: 919.0 },
    { x: 606.2, y: 919.0 }, { x: 624.7, y: 921.0 }, { x: 643.2, y: 923.0 }, { x: 660.8, y: 927.0 },
    { x: 677.2, y: 934.0 }, { x: 689.7, y: 947.7 }, { x: 699.1, y: 963.1 }, { x: 709.9, y: 977.9 },
    { x: 723.9, y: 990.9 }, { x: 739.4, y: 1000.0 }, { x: 756.6, y: 1005.0 }, { x: 774.7, y: 1008.0 },
    { x: 792.7, y: 1009.0 }, { x: 810.8, y: 1006.0 }, { x: 828.4, y: 1002.0 }, { x: 844.3, y: 993.7 },
    { x: 858.8, y: 982.2 }, { x: 870.4, y: 967.6 }, { x: 878.3, y: 951.7 }, { x: 882.8, y: 934.2 },
    { x: 885.1, y: 915.9 }, { x: 883.8, y: 897.8 }, { x: 879.4, y: 880.4 }, { x: 873.0, y: 863.7 },
    { x: 862.7, y: 848.7 }, { x: 848.7, y: 835.7 }, { x: 838.0, y: 821.4 }, { x: 833.0, y: 804.2 },
    { x: 837.0, y: 786.6 }, { x: 847.0, y: 772.0 }, { x: 860.9, y: 759.1 }, { x: 872.0, y: 744.3 },
    { x: 879.0, y: 727.9 }, { x: 883.0, y: 710.3 }, { x: 886.0, y: 692.2 }, { x: 883.8, y: 673.8 },
    { x: 880.0, y: 656.1 }, { x: 873.0, y: 639.7 }, { x: 862.7, y: 624.7 }, { x: 849.0, y: 611.0 },
    { x: 833.4, y: 602.0 }, { x: 816.6, y: 596.0 }, { x: 798.6, y: 593.0 }, { x: 780.5, y: 592.0 },
    { x: 762.4, y: 595.0 }, { x: 744.8, y: 599.0 }, { x: 728.6, y: 606.4 }, { x: 714.0, y: 618.0 },
    { x: 702.5, y: 632.5 }, { x: 692.4, y: 647.6 }, { x: 682.3, y: 662.7 }, { x: 667.8, y: 674.2 },
    { x: 650.4, y: 679.0 }, { x: 632.4, y: 682.0 }, { x: 613.9, y: 684.0 }, { x: 595.0, y: 685.0 },
    { x: 575.7, y: 685.0 }, { x: 556.4, y: 685.0 }, { x: 537.1, y: 685.0 }, { x: 517.8, y: 685.0 },
    { x: 498.5, y: 685.0 }, { x: 480.4, y: 682.0 }, { x: 465.0, y: 674.6 }, { x: 465.0, y: 655.3 },
    { x: 465.0, y: 636.0 }, { x: 465.0, y: 616.7 }, { x: 465.0, y: 597.4 }, { x: 465.0, y: 578.1 },
    { x: 465.0, y: 558.8 }, { x: 465.0, y: 539.5 }, { x: 465.0, y: 520.2 }, { x: 465.0, y: 500.9 },
    { x: 465.0, y: 481.6 }, { x: 465.0, y: 462.3 }, { x: 465.0, y: 443.0 }, { x: 465.0, y: 423.7 },
    { x: 465.0, y: 404.4 }, { x: 465.0, y: 385.1 }, { x: 465.0, y: 365.7 }, { x: 465.0, y: 346.4 },
    { x: 465.0, y: 327.1 }, { x: 465.0, y: 307.8 }, { x: 465.0, y: 288.5 }, { x: 465.0, y: 269.2 },
    { x: 465.0, y: 249.9 }, { x: 465.0, y: 230.6 }, { x: 465.0, y: 211.3 }, { x: 465.0, y: 192.0 },
    { x: 465.0, y: 172.7 }, { x: 465.0, y: 153.4 }, { x: 465.0, y: 134.1 }, { x: 465.0, y: 114.8 },
    { x: 465.0, y: 95.5 }, { x: 465.0, y: 76.2 }, { x: 465.0, y: 56.9 }, { x: 466.0, y: 38.0 },
];

const TS_LEVEL1_DESIGN: TSLevelDesign = {
  points: TS_LEVEL1_LEFT_PATH,
  paths: [TS_LEVEL1_LEFT_PATH, TS_LEVEL1_RIGHT_PATH],
  halfWidth: TS_LEVEL1_HALF_WIDTH,
  baseWidth: TS_LEVEL1_BASE_WIDTH,
  baseHeight: TS_LEVEL1_BASE_HEIGHT,
  backgroundImage: TS_LEVEL1_IMAGE,
  boneRadius: TS_LEVEL1_BONE_RADIUS,
  minAllowedHalfWidth: TS_LEVEL1_MIN_ALLOWED_HALF_WIDTH,
  finishRadius: TS_LEVEL1_FINISH_RADIUS,
  label: "The Big Bone",
  instructions:
    "Drag the bone up through the loop — swing left or right around it, your call — then on up to the finish.",
};

// Hand-traced levels, in order (index 0 = level 1). Append future critters
// here as they're drawn (trace a new reference image the same way
// TS_LEVEL1_LEFT_PATH/TS_LEVEL1_RIGHT_PATH were built, drop the image in as
// an asset, and set backgroundImage/boneRadius/minAllowedHalfWidth/
// finishRadius the same way TS_LEVEL1_DESIGN does — using `paths` only if
// the new maze is a loop with more than one genuinely open route; a single
// `points` route, like Rex's, covers the more common case). Anything past
// the end of this array falls back to buildProceduralLevelDesign.
const TS_CUSTOM_LEVELS: TSLevelDesign[] = [TS_LEVEL1_DESIGN];

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
                <View
                  style={{
                    width: boneDotSize,
                    height: boneDotSize,
                    borderRadius: boneDotSize / 2,
                    backgroundColor: "#000",
                    // White ring so the dot reads clearly whether it's sitting on
                    // the white corridor or the darker art around it -- see the
                    // boneDotSize comment above for why this was added.
                    borderWidth: 2,
                    borderColor: "#fff",
                  }}
                />
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
