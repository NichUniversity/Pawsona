import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { PressableScale } from "../ui/PressableScale";
import { usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";
import { crossPlatformShadow, crossPlatformTextShadow } from "../../utils/crossPlatformShadow";

import { sharedGameStyles } from "./sharedGameStyles";

// --- Mark Your Territory (full-screen static porch scene; old hold-to-mark mechanic pulled out — renders house art with the neighbor on the porch; gameplay to be rebuilt later) ---

// Hand-illustrated house scene; natural pixel size of the source file, needed to replicate resizeMode="cover"'s scale/crop math in JS.
const TERR_HOUSE_IMAGE = require("../../assets/images/territory-house.png");
// House art's natural pixel size (1086x2262, extended upward from 1086x1316) — anchors below are measured against this image's own pixel space and aren't portable to other art; the taller canvas keeps a near-phone aspect ratio so a height-locked fit shows nearly full width with no letterboxing on common phones.
const TERR_HOUSE_IMG_WIDTH = 1086;
const TERR_HOUSE_IMG_HEIGHT = 2262;
// TERR_HOUSE_ZOOM tradeoff: 1 fills the container height with zero top gap but crops more off the sides on narrow phones; <1 leaves a small top gap but crops less. Currently 1 per the latest request.
const TERR_HOUSE_ZOOM = 1;

// Neighbor-in-rocking-chair stages, each cropped tight to its own silhouette with its own `aspect`; three SRC_* anchors (shared by every stage) keep every stage at the same porch position/size, from newspaper fully up (oblivious) to fully down (attentive). To add a stage: crop tight, add to assets, add one {source, aspect, chairCenterFrac} entry — see chairCenterFrac's own comment below for how to measure that last one.
//
// chairCenterFrac fix (2026-09-11): the 2026-09-07 horizontal-jitter fix re-cropped every stage to a uniform 3px margin on the *character's* full bounding box (newspaper + hands + chair), which assumes that box's own center lines up with the chair's true center — true whenever the margin genuinely lands even on both sides, but stage 3's content happened to already reach x=0 pre-crop, so it only got a 3px margin on the right, none on the left. That shifted stage 3's chair a few px left of where CENTER_X-based centering (which centers the *box*, not the chair) put the others, reported live as "the chair position slightly changes" starting right at the stage-2-to-3 transition. Measured directly: isolated each stage's chair via a wood-color classifier (b<45, r<220, r>40, (r-g)>=15, g>=b on opaque pixels — tuned by sampling this art's own palette, not reused from an older threshold that turned out to also catch skin) and took its bounding box's horizontal center as a fraction of that stage's own canvas width. Stages 1/2/4/5 land within half a percent of each other (~0.505-0.506); stage 3 was a real outlier at 0.490. `chairCenterFrac` records that measured value per stage so the render math (below) can center each stage on its *chair*, not its box — a permanent, generalizable fix rather than a one-off nudge to stage 3 alone, so any future stage art that isn't perfectly margin-symmetric won't reintroduce this.
//
// Vertical size-match fix (2026-09-11, same round): same wood-classifier measurement also showed the chair's own rendered HEIGHT wasn't quite constant either — stage 1 has the most headroom above the chair in its own crop (wood occupies 82.5% of that file's height), stages 2/3/4 progressively less (83.9%/84.4%/84.8%), so at the shared fixed guyHeight the chair reads as growing larger stage-to-stage (confirmed live: "the chair gets slightly bigger every stage until stage 5"). Fixed the same way the very first size-jump fix in this file's history handled it (see the "Stage-1/2 size-jump fixed" section in the project doc): padded stages 2-5's own canvases with transparent rows at the TOP ONLY (content itself untouched, nothing cropped or moved) until each stage's own wood-occupied fraction matches stage 1's (the smallest, so every other stage only ever needs padding added, never real content cropped away) — 9px/12px/14px/6px respectively. `aspect` values below were updated to match each stage's new (padded) pixel dimensions; `chairCenterFrac` is unaffected by top-only padding (verified numerically unchanged) so those values didn't need updating.
const TERR_PORCH_GUY_STAGES = [
  {
    // All 6 poses (5 attentiveness stages + caught) come from one 3x2 reference sheet, split per-cell, seam artifact cleaned up, each trimmed tight with a 3px soft-alpha margin; verified clean via alpha connected-component check. Top-left cell = newspaper fully covering his face. Reference stage for the vertical size-match fix above — smallest wood-height fraction of the 5, so left untouched (no padding needed).
    source: require("../../assets/images/territory-porch-guy.png"),
    aspect: 425 / 497,
    chairCenterFrac: 0.50588,
  },
  {
    // Top-middle cell — newspaper lowered slightly, eyes/eyebrows visible in an annoyed glare; re-trimmed tight and even on both sides. 9px transparent padding added at the top (499 tall now, was 490) to match stage 1's chair scale.
    source: require("../../assets/images/territory-porch-guy-stage-2.png"),
    aspect: 423 / 499,
    chairCenterFrac: 0.50591,
  },
  {
    // Top-right cell — newspaper lowered further, full face visible in an annoyed glare; re-trimmed to fix an uneven right-side margin, but that recrop only had room for a 0px left margin (vs. 3px on the right) since content already reached x=0 — this is the stage whose chair sits measurably off-center; chairCenterFrac corrects it. 12px transparent padding added at the top (499 tall now, was 487) to match stage 1's chair scale.
    source: require("../../assets/images/territory-porch-guy-stage-3.png"),
    aspect: 414 / 499,
    chairCenterFrac: 0.49034,
  },
  {
    // Bottom-left cell — newspaper lowered further still, more shirt/suspenders visible below the face. 14px transparent padding added at the top (501 tall now, was 487) to match stage 1's chair scale — this stage had the largest chair-scale drift of the four, per the live "bigger every stage" report.
    source: require("../../assets/images/territory-porch-guy-stage-4.png"),
    aspect: 425 / 501,
    chairCenterFrac: 0.50471,
  },
  {
    // Bottom-middle cell — most-attentive non-caught pose, full glare, newspaper held lowest. 6px transparent padding added at the top (501 tall now, was 495) to match stage 1's chair scale.
    source: require("../../assets/images/territory-porch-guy-stage-5.png"),
    aspect: 426 / 501,
    chairCenterFrac: 0.50469,
  },
];

// "Caught you peeing" busted pose (bottom-right cell of the sheet) — red-faced, furious, shown when the stage loop reaches the last entry while still holding. Horizontal-jitter fix: re-cropped every stage's bounding box with a uniform 3px margin on all sides, since uneven left/right dead space (not the CENTER_X anchor math) was what caused the visible shift between stages.
// Size-jump fix (2026-09-11): the caught pose's own cropped aspect is 382/501 (0.7625) — genuinely narrower than the 5 attentiveness stages' (~0.830-0.855, after the vertical size-match padding above), since this pose's arms are pulled in tighter around the newspaper rather than spread on the armrests. Rendered at guyWidth = guyHeight * aspect (a fixed guyHeight, per-stage aspect), that made him visibly narrower right at the "caught" moment — confirmed by measuring the actual rendered footprint at a common simulated guyHeight, not just eyeballed. Using the attentiveness stages' own average aspect here instead (so the box width matches them) and letting the existing resizeMode="stretch" mildly widen this one image to fill it — the same accepted-stretch tradeoff already used for the ambient birds' wing-flap frames.
const TERR_PORCH_GUY_CAUGHT = {
  source: require("../../assets/images/territory-porch-guy-caught.png"),
  aspect: TERR_PORCH_GUY_STAGES.reduce((sum, s) => sum + s.aspect, 0) / TERR_PORCH_GUY_STAGES.length,
  // Measured the same way as the attentiveness stages' chairCenterFrac above — this pose came out very close to true-center (0.499) on its own, but wired through the same field for consistency.
  chairCenterFrac: 0.49869,
};
// Neighbor's horizontal position on the porch, nudged repeatedly per user feedback — currently centered on the porch per the explicit "more to the left/center" request, deliberately square in front of the window.
const TERR_PORCH_GUY_SRC_CENTER_X = 670;
// Shifted +946 to match the canvas-extension's added top margin — horizontal anchors are untouched since only rows were added, not columns.
const TERR_PORCH_GUY_SRC_FLOOR_Y = 1746;
// Scaled from the previous house art's value by the same height ratio, so the character keeps the same relative size on the new art.
const TERR_PORCH_GUY_SRC_HEIGHT = 137;
// Manual nudge on top of the measured floor-line anchor, reduced across several rounds of feedback to sit him lower on the porch; source-pixel units so it scales consistently at every screen size.
const TERR_PORCH_GUY_LIFT = -2;

// Mailbox hold-target, measured the same fixed-pixel way as the porch-guy anchors, re-measured and shifted +946 for the new/extended house art.
const TERR_MAILBOX_SRC_CENTER_X = 552;
const TERR_MAILBOX_SRC_TOP_Y = 1753;
const TERR_MAILBOX_SRC_BOTTOM_Y = 1859;

// Where the dog stands (paved road at the bottom of the art, directly under the mailbox), measured the same fixed-pixel way and shifted +946 for the canvas extension.
const TERR_DOG_SRC_Y = 2201;
// Where the dog stands while marking — beside the mailbox post rather than his resting spot on the road; Y offset is an approximation since no exact post-meets-ground pixel was measured. Nudge by eye if he doesn't land right.
const TERR_DOG_AT_MAILBOX_Y = TERR_MAILBOX_SRC_BOTTOM_Y + 130;
const TERR_DOG_AT_MAILBOX_X_OFFSET = 70;
// How long the slide to/from the mailbox takes when isHolding toggles.
const TERR_DOG_APPROACH_MS = 220;
// Emoji fallback's on-screen size, tuned proportionate to the mailbox rather than measured from art.
const TERR_DOG_SRC_HEIGHT = 127;
// Purpose-drawn dog art (standing/walking + leg-lifted marking pose), replacing the earlier player-avatar stand-in; background keyed transparent and trimmed. Source faces left, so TerritoryDog flips it to face right.
const TERR_DOG_IDLE_IMAGE = require("../../assets/images/territory-dog-idle.png");
const TERR_DOG_PEEING_IMAGE = require("../../assets/images/territory-dog-peeing.png");
// Known intrinsic aspect ratios for the two dog poses — web fallback since react-native-web's Image can't read this from the asset itself.
const TERR_DOG_IDLE_ASPECT = 1029 / 821;
const TERR_DOG_PEEING_ASPECT = 1056 / 781;
// Hand-drawn pee-stream/splash sprite sheet (6 frames, cropped to a shared bounding box so they line up); drawn top-to-bottom, so TerritoryPeeStream anchors top to the dog and bottom to the mailbox, then rotates to point between them.
const TERR_PEE_STREAM_FRAMES = [
  require("../../assets/images/territory-pee-stream-1.png"),
  require("../../assets/images/territory-pee-stream-2.png"),
  require("../../assets/images/territory-pee-stream-3.png"),
  require("../../assets/images/territory-pee-stream-4.png"),
  require("../../assets/images/territory-pee-stream-5.png"),
  require("../../assets/images/territory-pee-stream-6.png"),
];
// Measured intrinsic size of the cropped pee-stream frames — same web-fallback reasoning as the dog's aspect constants.
const TERR_PEE_STREAM_FRAME_ASPECT = 249 / 295;
const TERR_PEE_STREAM_FPS = 10;
// Fallback only, for the (currently unreachable) case TerritoryDog is used without the art above.
const TERR_DOG_EMOJI = "🐕";
const TERR_DOG_ENTRANCE_MS = 1200;
const TERR_DOG_HOP_MS = 150;

// Ambient decorative background birds — hand-drawn 6-frame wing-flap cycle, background-removed via flood-fill and verified clean. Each frame keeps its own trim so the wing motion (not a resize glitch) reads through the changing silhouette width.
const TERR_BIRD_FRAMES = [
  require("../../assets/images/territory-bird-1.png"),
  require("../../assets/images/territory-bird-2.png"),
  require("../../assets/images/territory-bird-3.png"),
  require("../../assets/images/territory-bird-4.png"),
  require("../../assets/images/territory-bird-5.png"),
  require("../../assets/images/territory-bird-6.png"),
];
// Web fallback aspects for the bird frames — same reasoning as the dog's TERR_DOG_IDLE_ASPECT. All 6 re-cropped (2026-09-11 head-bob fix) onto one shared beak-anchored 322x301 canvas, so these are now identical rather than 6 different trims.
const TERR_BIRD_FRAME_ASPECTS = [322 / 301, 322 / 301, 322 / 301, 322 / 301, 322 / 301, 322 / 301];
// Fixed on-screen box size for the bird (averaged across all 6 frames' aspects) so the box itself doesn't visibly grow/shrink through the wing-flap; each frame still renders undistorted via resizeMode="contain" inside that fixed box.
const TERR_BIRD_FIXED_ASPECT =
  TERR_BIRD_FRAME_ASPECTS.reduce((sum, a) => sum + a, 0) / TERR_BIRD_FRAME_ASPECTS.length;

// Module-level cache for Image.resolveAssetSource lookups — avoids a native-bridge round trip on every wing-flap/render tick (up to 16x/sec) for as long as this screen stays mounted (switching tabs doesn't unmount it).
const territoryAssetAspectCache = new Map<number, number>();
function resolveTerritoryAssetAspect(source: ImageSourcePropType, fallbackAspect: number): number {
  if (Platform.OS === "web" || typeof Image.resolveAssetSource !== "function") return fallbackAspect;
  if (typeof source !== "number") {
    // Not a local require() (shouldn't happen here) — fall back rather than risk caching something that could change.
    const resolved = Image.resolveAssetSource(source);
    return resolved.width / resolved.height;
  }
  const cached = territoryAssetAspectCache.get(source);
  if (cached !== undefined) return cached;
  const resolved = Image.resolveAssetSource(source);
  const aspect = resolved.width / resolved.height;
  territoryAssetAspectCache.set(source, aspect);
  return aspect;
}

const TERR_BIRD_FPS = 8;
// Bird's fixed on-screen height budget (width follows each frame's own aspect) — chosen as a fraction of container height, not tied to a house-art source-pixel anchor like the porch guy/mailbox/dog.
const TERR_BIRD_SIZE_FRACTION = 0.05;
// Each bird flies one crossing then idles off-screen for a re-rolled random wait before flying again — "fly by at random" rather than a fixed metronome, centered around ~10s average.
const TERR_BIRD_CYCLE_MIN_MS = 6000;
const TERR_BIRD_CYCLE_MAX_MS = 16000;
const TERR_BIRD_FLIGHT_MS = 4200;

// Neighbor's attentiveness stage clock: a guaranteed fixed-interval switch every TERR_STAGE_INTERVAL_MS, but every TERR_STAGE_TICK_MS a separate roll has a TERR_STAGE_EARLY_SWITCH_CHANCE probability of switching early — replaces the old min/max random-delay timer with "every 4s, but 25% chance each second to jump early" per feedback. This governs every stage EXCEPT the last one, which uses its own randomized dwell below.
const TERR_STAGE_INTERVAL_MS = 4000;
const TERR_STAGE_TICK_MS = 1000;
const TERR_STAGE_EARLY_SWITCH_CHANCE = 0.25;
// How long the neighbor lingers on his last (most-attentive) stage before looking away again — a uniformly random duration per dwell, rolled fresh each time he reaches it, rather than the fixed-interval-plus-dice-roll timing every earlier stage uses.
const TERR_STAGE_LAST_STAGE_MIN_MS = 4000;
const TERR_STAGE_LAST_STAGE_MAX_MS = 8000;

// Total holding time needed to fill the marking meter; progress persists across releases (never reset by releasing). Slowed down twice per feedback (was 7500ms, then 12000ms).
const TERR_MARK_FILL_MS = 15000;
const TERR_MARK_TICK_MS = 100;

// One-time bonus for fully completing the round — the only coin reward this game gives now (releasing safely before that used to award TERR_MARK_REWARD each time, removed per feedback so coins only come from actually completing the round), same idea as Minesweeper's WIN_REWARD.
const TERR_COMPLETE_REWARD = 20;

// Dedicated "hold to mark" button, independent of the mailbox's own position so a thumb doesn't block the view while holding; swapped from a code-drawn circle to a small pixel-art wood-sign asset, with hitSlop padding the tap target past Apple's 44pt minimum.
const TERR_MARK_BUTTON_IMAGE = require("../../assets/images/territory-mark-button.png");
const TERR_MARK_BUTTON_WIDTH = 78;
const TERR_MARK_BUTTON_ASPECT = 450 / 138;
const TERR_MARK_BUTTON_HEIGHT = TERR_MARK_BUTTON_WIDTH / TERR_MARK_BUTTON_ASPECT;

// The old pulsing-glow halo components (TerritoryPulseHalo/TerritoryMailboxHint) were removed per the user's "take the flashing away" ask — the art reads clearly enough without an animated hint.

// Pee-stream effect: cycles the 6-frame sprite stretched/rotated into a strip running from the dog's position to the mailbox, so it reads as coming out of him regardless of their relative positions; frame-cycling reuses WalkingSprite's rAF approach, reimplemented inline since its bob/sway doesn't belong on a liquid effect.
function TerritoryPeeStream({
  originX,
  originY,
  targetX,
  targetY,
}: {
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
}) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const frameDuration = 1000 / TERR_PEE_STREAM_FPS;
    let rafId: number;
    let lastTime: number | null = null;
    let stopped = false;

    const tick = (time: number) => {
      if (stopped) return;
      if (lastTime === null) lastTime = time;
      const elapsed = time - lastTime;
      if (elapsed >= frameDuration) {
        const steps = Math.floor(elapsed / frameDuration);
        lastTime += steps * frameDuration;
        setFrameIndex((prev) => (prev + steps) % TERR_PEE_STREAM_FRAMES.length);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  // Rotation that points the strip's built-in "down" axis at (dx, dy) instead of straight down: theta = atan2(-dx, dy).
  const angleDeg = (Math.atan2(-dx, dy) * 180) / Math.PI;
  const height = distance;
  const width = distance * TERR_PEE_STREAM_FRAME_ASPECT;
  const centerX = (originX + targetX) / 2;
  const centerY = (originY + targetY) / 2;

  return (
    <View
      style={{
        position: "absolute",
        left: centerX - width / 2,
        top: centerY - height / 2,
        width,
        height,
        pointerEvents: "none",
        transform: [{ rotate: `${angleDeg}deg` }],
      }}
    >
      <Image
        source={TERR_PEE_STREAM_FRAMES[frameIndex]}
        // Mirrored left-right in its own local space, independent of the outer rotate, so the flip doesn't change where the stream points.
        style={{ width: "100%", height: "100%", transform: [{ scaleX: -1 }] }}
        resizeMode="stretch"
      />
    </View>
  );
}

// One ambient background bird: cycles its wing-flap sprite on an rAF loop while crossing the sky at constant speed, then idles off-screen for a random wait before flying again; purely decorative, mounted unconditionally.
function TerritoryBird({
  containerWidth,
  y,
  size,
  direction,
  flightMs,
  minCycleMs,
  maxCycleMs,
  startDelayMs = 0,
}: {
  containerWidth: number;
  y: number;
  size: number;
  direction: "left-to-right" | "right-to-left";
  flightMs: number;
  minCycleMs: number;
  maxCycleMs: number;
  startDelayMs?: number;
}) {
  const [frameIndex, setFrameIndex] = useState(0);
  // 0->1: one single crossing, reset and re-animated per cycle via the scheduling effect below rather than Animated.loop (which can't insert an idle pause between iterations).
  const progress = useRef(new Animated.Value(0)).current;

  // size/containerWidth are frozen for the duration of one flight (re-captured only when the next flight starts, in flyOnce below) rather than read live off props every render. The parent recomputes these from `layout` on every one of its own re-renders, and even a same-flight parent re-render (e.g. the marking meter's 100ms tick) would otherwise change this bird's box size mid-air the instant it happened, on top of the layout-jitter case fixed in the parent's onLayout guard. latestPropsRef always tracks the current props (so a real resize is still picked up) — flightGeomRef only copies from it at the start of each flight.
  const latestPropsRef = useRef({ size, containerWidth });
  latestPropsRef.current = { size, containerWidth };
  const flightGeomRef = useRef({ size, containerWidth });

  // Wing-flap frame cycling is started/stopped bracketing each flight rather than running for the component's whole mounted lifetime, since the idle pause (60-75% of the cycle) was ticking invisible frames the whole time this screen stayed mounted.
  const wingRafRef = useRef<number | null>(null);
  const startWingFlap = () => {
    if (wingRafRef.current !== null) return;
    const frameDuration = 1000 / TERR_BIRD_FPS;
    let lastTime: number | null = null;
    const tick = (time: number) => {
      if (lastTime === null) lastTime = time;
      const elapsed = time - lastTime;
      if (elapsed >= frameDuration) {
        const steps = Math.floor(elapsed / frameDuration);
        lastTime += steps * frameDuration;
        setFrameIndex((prev) => (prev + steps) % TERR_BIRD_FRAMES.length);
      }
      wingRafRef.current = requestAnimationFrame(tick);
    };
    wingRafRef.current = requestAnimationFrame(tick);
  };
  const stopWingFlap = () => {
    if (wingRafRef.current !== null) {
      cancelAnimationFrame(wingRafRef.current);
      wingRafRef.current = null;
    }
  };
  // Safety net only — the flight effect below normally starts/stops this; this just guarantees no rAF survives past unmount.
  useEffect(() => stopWingFlap, []);

  // Flies once, then once actually landed off-screen rolls a fresh random wait and schedules the next flight via a recursive setTimeout chain (same pattern the neighbor's stage loop uses), since Animated.loop can't pause between iterations.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const randomPauseMs = () =>
      Math.max(0, minCycleMs + Math.random() * (maxCycleMs - minCycleMs) - flightMs);

    const flyOnce = () => {
      if (cancelled) return;
      flightGeomRef.current = latestPropsRef.current;
      progress.setValue(0);
      startWingFlap();
      Animated.timing(progress, {
        toValue: 1,
        duration: flightMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        stopWingFlap();
        if (cancelled || !finished) return;
        timeoutId = setTimeout(flyOnce, randomPauseMs());
      });
    };

    timeoutId = setTimeout(flyOnce, startDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      progress.stopAnimation();
      stopWingFlap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightMs, minCycleMs, maxCycleMs, startDelayMs]);

  const frameSource = TERR_BIRD_FRAMES[frameIndex];
  // Uses resizeMode="stretch" (not "contain") so the fixed-aspect box fills completely every frame with no letterboxing/pulsing — a prior attempt with "contain" still let both axes drift since a mismatched aspect still gets letterboxed down; frames stretch slightly off their own true aspect, an accepted tradeoff at this render size. No per-frame resolveAssetSource call needed anymore either.
  const aspect = TERR_BIRD_FIXED_ASPECT;
  // frozenSize/frozenContainerWidth (not the live size/containerWidth props) drive every dimension below, so a bird's box genuinely cannot change mid-flight for any reason — see flightGeomRef's comment above.
  const { size: frozenSize, containerWidth: frozenContainerWidth } = flightGeomRef.current;
  const width = frozenSize * aspect;

  // Off-screen at both ends regardless of container width — same -(x + size) derivation TerritoryDog's entranceStartX uses.
  const startX = direction === "left-to-right" ? -width : frozenContainerWidth + width;
  const endX = direction === "left-to-right" ? frozenContainerWidth + width : -width;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: y,
        left: 0,
        width,
        height: frozenSize,
        pointerEvents: "none",
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] }) },
          // Drawn facing right in its source form — flip only when flying right-to-left so he always faces the direction he's headed.
          { scaleX: direction === "right-to-left" ? -1 : 1 },
        ],
      }}
    >
      <Image source={frameSource} style={{ width, height: frozenSize }} resizeMode="stretch" />
    </Animated.View>
  );
}

// The dog: hops in from off-screen on mount, settles at his resting spot under the mailbox, steps up beside it (swapping to the leg-lifted marking pose) while held, and steps back on release.
function TerritoryDog({
  restX,
  restY,
  atMailboxX,
  atMailboxY,
  size,
  isHolding,
  idleImage,
  peeingImage,
  idleAspect = 1,
  peeingAspect = 1,
}: {
  restX: number;
  restY: number;
  atMailboxX: number;
  atMailboxY: number;
  size: number;
  isHolding: boolean;
  idleImage?: ImageSourcePropType;
  peeingImage?: ImageSourcePropType;
  idleAspect?: number;
  peeingAspect?: number;
}) {
  // 0->1 once on mount: the entrance slide from off-screen to the resting spot, never replayed after that.
  const entrance = useRef(new Animated.Value(0)).current;
  // Small up/down bob, looped only during the entrance slide, so the approach reads as a hop/trot rather than a flat slide.
  const hop = useRef(new Animated.Value(0)).current;
  // 0->1 while isHolding (and back on release): slides him from resting spot to beside the mailbox, additively on top of the entrance/hop; can fire many times per round.
  const atMailbox = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const hopLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: TERR_DOG_HOP_MS, useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: TERR_DOG_HOP_MS, useNativeDriver: true }),
      ])
    );
    hopLoop.start();
    Animated.timing(entrance, {
      toValue: 1,
      duration: TERR_DOG_ENTRANCE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      hopLoop.stop();
      hop.setValue(0);
    });
    return () => {
      hopLoop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(atMailbox, {
      toValue: isHolding ? 1 : 0,
      duration: TERR_DOG_APPROACH_MS,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHolding]);

  // Entrance start-x derived from his own rest position and size (not container width) so he's guaranteed fully off-screen regardless of how wide the container is.
  const entranceStartX = -(restX + size);

  // Current pose, recomputed every render to track isHolding live; aspect read via the cached resolveTerritoryAssetAspect on native (avoiding a bridge call on every 100ms markProgress tick), or a known fallback aspect on web where resolveAssetSource doesn't exist.
  const poseImage = isHolding && peeingImage ? peeingImage : idleImage;
  const fallbackAspect = isHolding && peeingImage ? peeingAspect : idleAspect;
  const aspect = poseImage ? resolveTerritoryAssetAspect(poseImage, fallbackAspect) : 1;
  const width = size * aspect;

  const content = poseImage ? (
    <Image source={poseImage} style={{ width, height: size }} resizeMode="contain" />
  ) : (
    // Fallback — only reachable if TerritoryDog is ever used without the dedicated pose art above.
    <Text style={{ fontSize: size, lineHeight: size }}>{TERR_DOG_EMOJI}</Text>
  );

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: restX - width / 2,
        top: restY - size,
        width,
        height: size,
        pointerEvents: "none",
        alignItems: "center",
        justifyContent: "center",
        transform: [
          // World-space moves listed before the local flip below so neither is affected by it — he always enters from the left and slides the same screen-space amount regardless of which way he's facing.
          { translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [entranceStartX, 0] }) },
          { translateX: atMailbox.interpolate({ inputRange: [0, 1], outputRange: [0, atMailboxX - restX] }) },
          { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          { translateY: atMailbox.interpolate({ inputRange: [0, 1], outputRange: [0, atMailboxY - restY] }) },
          // Both the pose art and the emoji fallback face left in source form, so always flip to face right toward the mailbox.
          { scaleX: -1 },
        ],
      }}
    >
      {content}
    </Animated.View>
  );
}

// Fixed size of the marking meter's track — kept as constants (not props) since the hand-drawn wobble path and scribble strokes below are hand-tuned to this exact viewBox rather than computed generically for an arbitrary size.
const TERR_METER_TRACK_WIDTH = 110;
const TERR_METER_TRACK_HEIGHT = 11;
// Hand-jittered rounded-rect outline (replaces the old clean borderRadius+borderWidth track) so the meter's frame itself reads as drawn-by-hand, matching the rest of this scene's cartoon linework rather than a crisp UI element. Thinner than the original pass (1.0 vs 1.4) to match the cleaner pencil-sketch reference this bar's style is based on.
const TERR_METER_WOBBLE_OUTLINE_D =
  "M5.2,1.4 L29,0.7 L59,1.4 L85,0.7 L104.8,1.6 Q108.6,1.7 108.6,4.6 L108.2,6.8 Q108.7,9.5 105,9.7 L75,10.3 L45,9.6 L20,10.2 L5.4,9.5 Q1.3,9.7 1.3,6.4 L1.7,4 Q1.4,1.2 5.2,1.4 Z";
// Second, very slightly offset outline traced faintly underneath the main one — mimics the subtle hand-retrace "sketchy double line" visible along the top edge of the reference loading-bar art, without redrawing the whole shape as a second independent hand-wobble (that read as two competing outlines rather than one retraced one).
const TERR_METER_WOBBLE_OUTLINE_D_2 =
  "M5.5,1.1 L30,1.0 L60,1.1 L86,1.0 L105.1,1.3 Q108.3,1.4 108.3,4.3 L108.0,7.0 Q108.4,9.2 104.7,9.4 L74.7,10.0 L44.7,9.3 L19.7,9.9 L5.7,9.2 Q1.6,9.4 1.6,6.7 L2.0,3.8 Q1.7,1.5 5.5,1.1 Z";
// Dense zigzag "marker scribble" fill — matches the second reference image exactly: one continuous zigzag stroke whose teeth touch the top and bottom of the track, in a single solid vivid yellow (not the alternating two-tone discrete hatch lines this replaces), with thin wood-colored slivers showing through between teeth. Revealed left-to-right by progress via a clip rect, same as every earlier fill version (a fixed pattern uncovered, not a live-drawing animation). Generated with a seeded RNG (see mark-your-territory-minigame.md) for jitter that's reproducible but not visibly repetitive; spans slightly past the 0-110 track range so the pattern still fills edge to edge after clipping.
const TERR_METER_ZIGZAG_D =
  "M-8.02,9.44 L-6.3,1.6 L-4.85,9.41 L-2.95,1.36 L-1.83,9.59 L-0.22,1.89 L1.82,9.47 L2.91,1.62 L4.37,9.25 L5.87,1.56 L7.59,9.48 L9.21,1.57 L10.84,9.7 L12.38,1.49 L13.61,9.14 L15.32,1.81 L17.11,9.61 L18.08,1.85 L20.01,9.34 L21.21,1.77 L22.4,9.3 L24.47,1.37 L25.59,9.14 L27.29,1.64 L28.83,9.54 L30.46,1.37 L31.76,9.26 L33.8,1.48 L35.2,9.34 L37.11,1.36 L38.64,9.25 L40.36,1.48 L41.62,9.45 L43.32,1.52 L45.03,9.39 L46.57,1.41 L48.0,9.59 L49.09,1.74 L50.82,9.67 L52.72,1.55 L53.83,9.68 L55.61,1.45 L57.24,9.28 L58.72,1.34 L60.08,9.61 L61.54,1.85 L62.84,9.26 L64.39,1.41 L66.14,9.18 L67.79,1.89 L69.31,9.45 L70.38,1.31 L72.43,9.68 L73.76,1.59 L75.24,9.7 L76.74,1.74 L78.54,9.52 L80.3,1.51 L81.91,9.62 L83.38,1.82 L84.87,9.33 L86.45,1.35 L88.24,9.63 L89.58,1.74 L91.19,9.6 L92.73,1.32 L94.19,9.24 L95.82,1.67 L97.42,9.11 L99.1,1.42 L100.63,9.5 L102.15,1.5 L103.42,9.36 L105.45,1.83 L106.79,9.29 L108.15,1.8 L109.95,9.67 L111.14,1.57 L112.62,9.35 L114.36,1.49 L116.29,9.37 L117.2,1.82";
// Single vivid yellow sampled directly from the reference art's fill. Used to swap to a hot-orange "urgent" color once the meter was nearly full — that swap was removed per feedback, so this is now the fill's only color at every progress level.
const TERR_METER_ZIGZAG_COLOR = "#FFD200";

// Replaces the earlier discrete diagonal hatch-line fill with a single continuous zigzag stroke, styled after the reference's hand-scribbled marker fill, revealed left-to-right by progress via an SVG clip rather than an Animated width — same "no smooth animation" behavior every earlier fill version had. No percentage text anywhere here by design; the filled-in zigzag itself is the only progress readout.
function TerritoryMeterScribbleTrack({ progress }: { progress: number }) {
  const clipId = useId();
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return (
    <Svg width={TERR_METER_TRACK_WIDTH} height={TERR_METER_TRACK_HEIGHT} viewBox={`0 0 ${TERR_METER_TRACK_WIDTH} ${TERR_METER_TRACK_HEIGHT}`}>
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={0} y={0} width={TERR_METER_TRACK_WIDTH * clampedProgress} height={TERR_METER_TRACK_HEIGHT} />
        </ClipPath>
      </Defs>
      {/* No recessed-groove background fill (dropped, was rgba(43,31,25,...) in earlier versions) — the reference's unfilled track is exactly the card's own wood color with no tint, so the unfilled portion here is just the card showing through. */}
      <G clipPath={`url(#${clipId})`}>
        <Path
          d={TERR_METER_ZIGZAG_D}
          fill="none"
          stroke={TERR_METER_ZIGZAG_COLOR}
          strokeWidth={2.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
      </G>
      {/* Faint retraced outline first, then the main wobbly ink outline on top — both drawn after the fill so the hand-drawn border always reads crisply over the zigzag rather than being partly covered by it. */}
      <Path d={TERR_METER_WOBBLE_OUTLINE_D_2} fill="none" stroke="#2B1F19" strokeWidth={0.7} strokeLinejoin="round" opacity={0.4} />
      <Path d={TERR_METER_WOBBLE_OUTLINE_D} fill="none" stroke="#2B1F19" strokeWidth={1.1} strokeLinejoin="round" opacity={0.9} />
    </Svg>
  );
}

export function MarkYourTerritoryGame({ onExit }: { onExit: () => void }) {
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { earnCoins } = usePets();

  // Neighbor's attentiveness stage (0 = most oblivious, rising toward most attentive); advances on its own random-interval timer independent of holding — holding only matters for what happens when he reaches the last stage.
  const [neighborStage, setNeighborStage] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isCaught, setIsCaught] = useState(false);
  // 0..1 fill level of the marking meter — accrues while held, persists across releases, resets only on Try Again / Play Again.
  const [markProgress, setMarkProgress] = useState(0);
  // Round-complete (won by filling the meter) — distinct from isCaught (lost). Both stop the neighbor's stage clock.
  const [isComplete, setIsComplete] = useState(false);
  // Whether the dog has actually finished sliding to the mailbox — separate from isHolding (which flips instantly) so the pee-stream splash doesn't appear before he's actually arrived; delayed on the way up, instant on the way down.
  const [isDogAtMailbox, setIsDogAtMailbox] = useState(false);

  // Refs mirror the state above for the setTimeout-driven loop, which reschedules itself outside React's render cycle and can't rely on a stale render closure.
  const isHoldingRef = useRef(isHolding);
  isHoldingRef.current = isHolding;
  const isCaughtRef = useRef(isCaught);
  isCaughtRef.current = isCaught;
  const neighborStageRef = useRef(neighborStage);
  neighborStageRef.current = neighborStage;
  const markProgressRef = useRef(markProgress);
  markProgressRef.current = markProgress;
  const isCompleteRef = useRef(isComplete);
  isCompleteRef.current = isComplete;

  // setInterval handle for the 1-second stage-clock tick (replaces the old setTimeout chain, since the fixed-plus-dice-roll design needs a steady per-second beat rather than a single reschedulable delay).
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ms accumulated since the neighbor's last stage switch — reset to 0 on every switch (early or on-the-dot), compared against TERR_STAGE_INTERVAL_MS (or, while on the last stage, lastStageDurationRef below) each tick to force the guaranteed switch.
  const stageElapsedRef = useRef(0);
  // This dwell's randomly rolled duration for the last stage, in ms — re-rolled every time the neighbor transitions into that stage; unused while on any other stage.
  const lastStageDurationRef = useRef(0);
  // Ticks up markProgress while the mailbox is held — started on press-in, cleared on press-out/bust/completion.
  const markIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Holds the "one second of the stage clock has passed" function in a ref since it's called both by the mount effect and externally (restartStageLoop).
  const stageLoopRef = useRef<() => void>(() => {});

  const restartStageLoop = useCallback(() => {
    if (stageIntervalRef.current) clearInterval(stageIntervalRef.current);
    neighborStageRef.current = 0;
    setNeighborStage(0);
    stageElapsedRef.current = 0;
    stageIntervalRef.current = setInterval(() => stageLoopRef.current(), TERR_STAGE_TICK_MS);
  }, []);

  useEffect(() => {
    stageLoopRef.current = () => {
      if (isCaughtRef.current || isCompleteRef.current) {
        if (stageIntervalRef.current) {
          clearInterval(stageIntervalRef.current);
          stageIntervalRef.current = null;
        }
        return;
      }
      stageElapsedRef.current += TERR_STAGE_TICK_MS;
      const onLastStage = neighborStageRef.current === TERR_PORCH_GUY_STAGES.length - 1;
      if (onLastStage) {
        // Last stage: just wait out this dwell's randomly rolled duration — no early-switch dice roll here, so how long he stays maxed-out is the only randomness in play.
        if (stageElapsedRef.current < lastStageDurationRef.current) return;
      } else {
        // Every other stage: every tick (once a second) rolls a chance to switch early; otherwise the elapsed clock keeps building toward the guaranteed TERR_STAGE_INTERVAL_MS switch.
        const rolledEarly = Math.random() < TERR_STAGE_EARLY_SWITCH_CHANCE;
        if (!rolledEarly && stageElapsedRef.current < TERR_STAGE_INTERVAL_MS) return;
      }
      stageElapsedRef.current = 0;
      const next = (neighborStageRef.current + 1) % TERR_PORCH_GUY_STAGES.length;
      neighborStageRef.current = next;
      setNeighborStage(next);
      if (next === TERR_PORCH_GUY_STAGES.length - 1) {
        // Just entered the last stage — roll how long this particular dwell lasts.
        lastStageDurationRef.current =
          TERR_STAGE_LAST_STAGE_MIN_MS + Math.random() * (TERR_STAGE_LAST_STAGE_MAX_MS - TERR_STAGE_LAST_STAGE_MIN_MS);
      }
      if (next === TERR_PORCH_GUY_STAGES.length - 1 && isHoldingRef.current) {
        // Busted: hit the most-attentive stage while still holding — stop the loop and the meter both, since bust overrides an in-progress mark.
        isCaughtRef.current = true;
        setIsCaught(true);
        isHoldingRef.current = false;
        setIsHolding(false);
        if (markIntervalRef.current) {
          clearInterval(markIntervalRef.current);
          markIntervalRef.current = null;
        }
        if (stageIntervalRef.current) {
          clearInterval(stageIntervalRef.current);
          stageIntervalRef.current = null;
        }
      }
    };
    stageIntervalRef.current = setInterval(() => stageLoopRef.current(), TERR_STAGE_TICK_MS);
    return () => {
      if (stageIntervalRef.current) clearInterval(stageIntervalRef.current);
      if (markIntervalRef.current) clearInterval(markIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drives isDogAtMailbox off isHolding: delayed on the rising edge (to match the slide animation), immediate on the falling edge; covers every path that ends a hold (release, bust, completion) in one effect.
  useEffect(() => {
    if (!isHolding) {
      setIsDogAtMailbox(false);
      return;
    }
    const t = setTimeout(() => setIsDogAtMailbox(true), TERR_DOG_APPROACH_MS);
    return () => clearTimeout(t);
  }, [isHolding]);

  const handleMailboxPressIn = () => {
    if (isCaughtRef.current || isCompleteRef.current) return;
    // Instant bust if the neighbor is already on his last stage the moment the player grabs the mailbox — the stage-loop timer alone only busts on the transition into that stage, so a hold starting while already there needed this separate check.
    if (neighborStageRef.current === TERR_PORCH_GUY_STAGES.length - 1) {
      if (stageIntervalRef.current) {
        clearInterval(stageIntervalRef.current);
        stageIntervalRef.current = null;
      }
      isCaughtRef.current = true;
      setIsCaught(true);
      return;
    }
    isHoldingRef.current = true;
    setIsHolding(true);
    // Start ticking the marking meter — progress carries over from earlier holds this round, so this just resumes.
    if (markIntervalRef.current) clearInterval(markIntervalRef.current);
    markIntervalRef.current = setInterval(() => {
      const next = Math.min(1, markProgressRef.current + TERR_MARK_TICK_MS / TERR_MARK_FILL_MS);
      markProgressRef.current = next;
      setMarkProgress(next);
      if (next >= 1) {
        // Meter filled while still safely holding — round won; stops everything the same way a bust does, via the success path.
        if (markIntervalRef.current) {
          clearInterval(markIntervalRef.current);
          markIntervalRef.current = null;
        }
        if (stageIntervalRef.current) {
          clearInterval(stageIntervalRef.current);
          stageIntervalRef.current = null;
        }
        isHoldingRef.current = false;
        setIsHolding(false);
        isCompleteRef.current = true;
        setIsComplete(true);
        earnCoins(TERR_COMPLETE_REWARD);
      }
    }, TERR_MARK_TICK_MS);
  };

  const handleMailboxPressOut = () => {
    const wasHolding = isHoldingRef.current;
    isHoldingRef.current = false;
    setIsHolding(false);
    if (markIntervalRef.current) {
      clearInterval(markIntervalRef.current);
      markIntervalRef.current = null;
    }
    if (isCaughtRef.current || isCompleteRef.current || !wasHolding) return;
    // Released safely before getting caught — no coins for this anymore (coins are only earned via TERR_COMPLETE_REWARD, on fully filling the meter). The neighbor's stage and the meter's accumulated progress are both left untouched, only their ticking stops.
  };

  const handleTryAgain = () => {
    isCaughtRef.current = false;
    setIsCaught(false);
    markProgressRef.current = 0;
    setMarkProgress(0);
    restartStageLoop();
  };

  const handlePlayAgain = () => {
    isCompleteRef.current = false;
    setIsComplete(false);
    markProgressRef.current = 0;
    setMarkProgress(0);
    restartStageLoop();
  };

  const currentNeighborStage = isCaught
    ? TERR_PORCH_GUY_CAUGHT
    : TERR_PORCH_GUY_STAGES[Math.min(neighborStage, TERR_PORCH_GUY_STAGES.length - 1)];

  // Measures the container's own rendered box via onLayout rather than trusting useWindowDimensions(), which reports the full browser viewport on Expo web even when the app is laid out in a narrower centered column.
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

  // Scale is locked to container height (never width) — now that the source art's own aspect ratio is close to a phone's, a plain height-locked fit already lands near full-width on real devices; TERR_HOUSE_ZOOM stays as a small 2% safety margin.
  const scale = layout ? (layout.height / TERR_HOUSE_IMG_HEIGHT) * TERR_HOUSE_ZOOM : 0;
  const scaledHouseWidth = TERR_HOUSE_IMG_WIDTH * scale;
  const scaledHouseHeight = TERR_HOUSE_IMG_HEIGHT * scale;
  // Positive = letterboxed (image narrower than box); negative = cropped (image wider, clipped by overflow:"hidden") — the normal case on a narrow phone.
  const houseOffsetX = layout ? (layout.width - scaledHouseWidth) / 2 : 0;
  // Pinned to the bottom, not centered — all leftover height goes above the roofline as top-only letterboxing, so there's never a gap below the road.
  const houseOffsetY = layout ? layout.height - scaledHouseHeight : 0;

  // A fixed few-pixel overscan on the rendered Image's own top/height absorbs sub-pixel layout rounding that otherwise left a faint sliver at the top; resizeMode="cover" crops the extra invisibly. Doesn't touch houseOffsetY itself, which every other anchor still keys off.
  const houseTopOverscan = 3;

  const guyHeight = TERR_PORCH_GUY_SRC_HEIGHT * scale;
  const guyWidth = guyHeight * currentNeighborStage.aspect;
  // Centers each stage on its own chairCenterFrac (the chair's measured horizontal center within that stage's own art) rather than assuming the box's own midpoint always lines up with the chair — see chairCenterFrac's comment on TERR_PORCH_GUY_STAGES for why that assumption broke for stage 3.
  const guyLeft = TERR_PORCH_GUY_SRC_CENTER_X * scale + houseOffsetX - currentNeighborStage.chairCenterFrac * guyWidth;
  const guyBottom = (TERR_PORCH_GUY_SRC_FLOOR_Y - TERR_PORCH_GUY_LIFT) * scale + houseOffsetY;
  const guyTop = guyBottom - guyHeight;

  // Mailbox on-screen position, from the fixed source-pixel anchors — same scale/offset math as the porch guy.
  const mailboxCenterX = TERR_MAILBOX_SRC_CENTER_X * scale + houseOffsetX;
  const mailboxTopY = TERR_MAILBOX_SRC_TOP_Y * scale + houseOffsetY;
  const mailboxBottomY = TERR_MAILBOX_SRC_BOTTOM_Y * scale + houseOffsetY;

  // Dog's resting position — same x column as the mailbox, standing on the road below it; size clamped so he doesn't shrink to nothing on a short/letterboxed layout.
  const dogRestY = TERR_DOG_SRC_Y * scale + houseOffsetY;
  const dogSize = Math.max(46, TERR_DOG_SRC_HEIGHT * scale);
  // Where he slides to while marking — beside the mailbox post.
  const dogAtMailboxX = mailboxCenterX + TERR_DOG_AT_MAILBOX_X_OFFSET * scale;
  const dogAtMailboxY = TERR_DOG_AT_MAILBOX_Y * scale + houseOffsetY;
  // Width of the peeing-pose art, used to offset the pee stream's origin toward the dog's rear (his left side, since he's flipped to face right) rather than his center.
  const dogPeeingWidth = dogSize * TERR_DOG_PEEING_ASPECT;

  return (
    <View
      style={styles.territoryFullScreen}
      onLayout={(e) => {
        // Round + bail on a no-op measurement: onLayout can re-fire with sub-pixel-different values (mobile browser chrome show/hide, sibling reflow from the marking meter's own live width, etc.) with no real resize behind it. Since every anchor (house, mailbox, dog, birds) derives straight from `layout` with no interpolation, an unguarded setLayout here made those pop to a new size instantly on every such re-fire — most visible on the birds since they're already moving. Skipping same-value updates keeps `layout` (and everything sized off it) stable except on an actual resize.
        const width = Math.round(e.nativeEvent.layout.width);
        const height = Math.round(e.nativeEvent.layout.height);
        setLayout((prev) =>
          prev && prev.width === width && prev.height === height ? prev : { width, height }
        );
      }}
    >
      {layout && (
        <>
          {/* Sized to the exact scaled dimensions computed above rather than filling the container, since React Native Web's Image falls back to the source asset's natural size without explicit width/height. */}
          <Image
            source={TERR_HOUSE_IMAGE}
            style={{
              position: "absolute",
              // top/height overshoot the container's real top edge by houseTopOverscan to absorb sub-pixel rounding; houseOffsetY/scaledHouseHeight themselves are untouched.
              top: houseOffsetY - houseTopOverscan,
              left: houseOffsetX,
              width: scaledHouseWidth,
              height: scaledHouseHeight + houseTopOverscan,
            }}
            resizeMode="cover"
          />

          {/* Ambient decorative sky birds, placed as a fraction of the container (not a house-art anchor) safely above the roofline; one flies each direction, each on its own randomized interval/length so they don't read as a synced pair. */}
          <TerritoryBird
            containerWidth={layout.width}
            y={layout.height * 0.2}
            size={layout.height * TERR_BIRD_SIZE_FRACTION}
            direction="left-to-right"
            flightMs={TERR_BIRD_FLIGHT_MS}
            minCycleMs={TERR_BIRD_CYCLE_MIN_MS}
            maxCycleMs={TERR_BIRD_CYCLE_MAX_MS}
            startDelayMs={0}
          />
          <TerritoryBird
            containerWidth={layout.width}
            y={layout.height * 0.28}
            size={layout.height * TERR_BIRD_SIZE_FRACTION * 0.85}
            direction="right-to-left"
            flightMs={TERR_BIRD_FLIGHT_MS * 1.15}
            minCycleMs={TERR_BIRD_CYCLE_MIN_MS * 1.1}
            maxCycleMs={TERR_BIRD_CYCLE_MAX_MS * 1.1}
            startDelayMs={3200}
          />

          <Image
            source={currentNeighborStage.source}
            style={{ position: "absolute", left: guyLeft, top: guyTop, width: guyWidth, height: guyHeight }}
            resizeMode="stretch"
          />

          <TerritoryDog
            restX={mailboxCenterX}
            restY={dogRestY}
            atMailboxX={dogAtMailboxX}
            atMailboxY={dogAtMailboxY}
            size={dogSize}
            isHolding={isHolding && !isCaught}
            idleImage={TERR_DOG_IDLE_IMAGE}
            peeingImage={TERR_DOG_PEEING_IMAGE}
            idleAspect={TERR_DOG_IDLE_ASPECT}
            peeingAspect={TERR_DOG_PEEING_ASPECT}
          />

          {isDogAtMailbox && !isCaught && !isComplete && (
            // Gated on isDogAtMailbox (not isHolding directly) so the stream doesn't mount until the dog has actually arrived. Origin is shifted toward his rear and raised to back/hip height for real fall length; target is the dog's own ground anchor (not the mailbox box) so the stream reads top-to-bottom instead of running uphill.
            <TerritoryPeeStream
              originX={dogAtMailboxX - dogPeeingWidth * 0.4}
              originY={dogAtMailboxY - dogSize * 0.4}
              targetX={mailboxCenterX + dogSize * 0.12}
              targetY={dogAtMailboxY + dogSize * 0.15}
            />
          )}
        </>
      )}

      <PressableScale
        style={[
          styles.territoryExitButton,
          {
            top: insets.top + 12,
            left: insets.left + 16,
            backgroundColor: theme.card.background,
            borderColor: theme.card.border,
          },
        ]}
        onPress={onExit}
      >
        <Text style={[sharedGameStyles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      {/* Marking progress meter — fills while held, never drains on release (only on Try Again), hidden once the round has ended. No numeric readout by design: the hand-scribbled fill (TerritoryMeterScribbleTrack) is the only progress indicator, styled to match this scene's hand-drawn linework rather than reading as a clean UI element. No "almost there" cue anymore either — the pulsing glow ring was removed earlier, and the fill's color-to-orange swap near completion was removed per feedback too; the fill is now one color at every progress level. */}
      {!isCaught && !isComplete && (
        <View
          style={[
            styles.territoryMeterWrap,
            { pointerEvents: "none" },
            // Uses houseOffsetX (not just insets.left) so this lands on the house/road art rather than the letterbox background beside it on a wide/landscape viewport; max() keeps it from landing off the left edge on a real phone.
            { left: Math.max(houseOffsetX + 16, insets.left + 16), bottom: insets.bottom + 28 },
          ]}
        >
          <View style={styles.territoryMeterCard}>
            <Text style={styles.territoryMeterLabel}>Marking</Text>
            <View style={styles.territoryMeterTrackOuter}>
              <TerritoryMeterScribbleTrack progress={markProgress} />
            </View>
          </View>
        </View>
      )}

      {/* Dedicated "hold to mark" button, mirroring the meter's anchoring on the opposite side so a thumb no longer blocks the mailbox while holding; swapped from a code-drawn circle to a small pixel-art wood-sign image, wired to the same handleMailboxPressIn/Out handlers, with hitSlop padding the touch target and an opacity dip standing in for an active-state recolor. */}
      {!isCaught && !isComplete && (
        <View
          style={[
            styles.territoryMarkButtonWrap,
            { pointerEvents: "box-none" },
            {
              width: TERR_MARK_BUTTON_WIDTH,
              right: Math.max(houseOffsetX + 16, insets.right + 16),
              bottom: insets.bottom + 28,
            },
          ]}
        >
          <PressableScale
            onPressIn={handleMailboxPressIn}
            onPressOut={handleMailboxPressOut}
            hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}
            style={[styles.territoryMarkButton, isHolding && styles.territoryMarkButtonActive]}
          >
            <Image
              source={TERR_MARK_BUTTON_IMAGE}
              style={{ width: TERR_MARK_BUTTON_WIDTH, height: TERR_MARK_BUTTON_HEIGHT }}
              resizeMode="contain"
            />
          </PressableScale>
        </View>
      )}

      {isCaught && (
        <View style={[styles.territoryCaughtOverlay, { pointerEvents: "box-none" }]}>
          <View style={styles.territoryCaughtCard}>
            <Text style={styles.territoryCaughtTitle}>Busted! 🚨</Text>
            <Text style={sharedGameStyles.gameOverText}>He caught you marking his mailbox.</Text>
            <PressableScale
              style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]}
              onPress={handleTryAgain}
            >
              <Text style={sharedGameStyles.primaryButtonText}>Try Again</Text>
            </PressableScale>
          </View>
        </View>
      )}

      {isComplete && (
        <View style={[styles.territoryCaughtOverlay, { pointerEvents: "box-none" }]}>
          <View style={styles.territoryCaughtCard}>
            <Text style={styles.territoryCaughtTitle}>Marked! 🐾</Text>
            <Text style={sharedGameStyles.gameOverText}>You fully marked his mailbox without getting caught.</Text>
            <PressableScale
              style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]}
              onPress={handlePlayAgain}
            >
              <Text style={sharedGameStyles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  territoryFullScreen: {
    flex: 1,
    width: "100%",
    backgroundColor: "#BFE6FF",
    // Clips the house image's sides when the scaled image is wider than the box (tall/portrait viewports) — height is always locked to fill the box, so only the sides ever need clipping.
    overflow: "hidden",
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : null),
  },

  territoryExitButton: {
    position: "absolute",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  territoryMeterWrap: {
    position: "absolute",
  },

  territoryMeterCard: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#E4BB83",
    borderWidth: 3,
    borderColor: "#2B1F19",
    borderTopColor: "#F1D5A9",
    borderLeftColor: "#F1D5A9",
    borderRightColor: "#2B1F19",
    borderBottomColor: "#2B1F19",
    ...crossPlatformShadow({ offsetY: 2, opacity: 0.3, radius: 4, elevation: 4 }),
  },

  territoryMeterLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#2B1F19",
    marginBottom: 4,
    ...crossPlatformTextShadow({ color: "rgba(255,255,255,0.35)", offsetY: 1, radius: 0 }),
  },

  territoryMeterTrackOuter: {
    width: TERR_METER_TRACK_WIDTH,
    height: TERR_METER_TRACK_HEIGHT,
  },

  territoryMarkButtonWrap: {
    position: "absolute",
    alignItems: "center",
  },

  territoryMarkButton: {
    alignItems: "center",
    justifyContent: "center",
    ...crossPlatformShadow({ offsetY: 3, opacity: 0.35, radius: 5, elevation: 6 }),
  },

  territoryMarkButtonActive: {
    opacity: 0.8,
  },

  territoryCaughtOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  territoryCaughtCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 28,
    alignItems: "center",
    maxWidth: 300,
  },

  territoryCaughtTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
});
