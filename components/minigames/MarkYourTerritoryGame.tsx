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

// --- Mark Your Territory ---
// Hold the "mark" button to fill the meter while the neighbor reads his
// paper. He gets more attentive in stages; if he reaches his last stage while
// you're holding, you're busted. Fill the meter to win.
//
// Positioning: the house art is scaled to fill the container height and
// pinned to the bottom. Every character/prop anchor below is measured in the
// house image's own pixel space (TERR_HOUSE_IMG_*), then mapped to screen
// space with the same `scale` + offset, so they stay glued to the art at any
// screen size. Anchors are specific to this art and must be re-measured if
// it changes.

// ---------------------------------------------------------------------------
// House art
// ---------------------------------------------------------------------------

const TERR_HOUSE_IMAGE = require("../../assets/images/territory-house.png");
const TERR_HOUSE_IMG_WIDTH = 1086;
const TERR_HOUSE_IMG_HEIGHT = 2262;
// 1 = fill height exactly (no top gap, more side crop on narrow phones).
const TERR_HOUSE_ZOOM = 1;
// Extra px drawn above the top edge to hide sub-pixel rounding slivers.
const TERR_HOUSE_TOP_OVERSCAN = 3;

// ---------------------------------------------------------------------------
// Neighbor (porch guy)
// ---------------------------------------------------------------------------
// One image per attentiveness stage, from newspaper fully up (oblivious) to
// fully down (watching). Each image is cropped tight to its own silhouette;
// `aspect` is its width/height, and `chairCenterFrac` is the chair's measured
// horizontal center as a fraction of that image's width. Positioning centers
// each stage on its chair (not its box) so the chair never shifts between
// stages, and stages 2-5 have transparent rows padded on top so the chair is
// the same rendered size in every stage.
// To add a stage: crop tight, pad to match, measure chairCenterFrac, append.

type TerrNeighborPose = { source: ImageSourcePropType; aspect: number; chairCenterFrac: number };

const TERR_PORCH_GUY_STAGES: TerrNeighborPose[] = [
  { source: require("../../assets/images/territory-porch-guy.png"), aspect: 425 / 497, chairCenterFrac: 0.50588 },
  { source: require("../../assets/images/territory-porch-guy-stage-2.png"), aspect: 423 / 499, chairCenterFrac: 0.50591 },
  { source: require("../../assets/images/territory-porch-guy-stage-3.png"), aspect: 414 / 499, chairCenterFrac: 0.49034 },
  { source: require("../../assets/images/territory-porch-guy-stage-4.png"), aspect: 425 / 501, chairCenterFrac: 0.50471 },
  { source: require("../../assets/images/territory-porch-guy-stage-5.png"), aspect: 426 / 501, chairCenterFrac: 0.50469 },
];
const TERR_LAST_STAGE = TERR_PORCH_GUY_STAGES.length - 1;

// "Busted" pose. Its own crop is narrower (arms pulled in), so it uses the
// stages' average aspect and is stretched slightly to avoid visibly
// shrinking at the moment he catches you.
const TERR_PORCH_GUY_CAUGHT: TerrNeighborPose = {
  source: require("../../assets/images/territory-porch-guy-caught.png"),
  aspect: TERR_PORCH_GUY_STAGES.reduce((sum, s) => sum + s.aspect, 0) / TERR_PORCH_GUY_STAGES.length,
  chairCenterFrac: 0.49869,
};

// Anchors in house-image pixels.
const TERR_PORCH_GUY_SRC_CENTER_X = 670;
const TERR_PORCH_GUY_SRC_FLOOR_Y = 1746;
const TERR_PORCH_GUY_SRC_HEIGHT = 137;
const TERR_PORCH_GUY_LIFT = -2; // hand-tuned nudge (negative = lower)

// Stage clock: switches every TERR_STAGE_INTERVAL_MS, with a
// TERR_STAGE_EARLY_SWITCH_CHANCE roll each tick to switch early. The last
// stage instead lasts a random TERR_STAGE_LAST_STAGE_MIN..MAX_MS.
const TERR_STAGE_INTERVAL_MS = 4000;
const TERR_STAGE_TICK_MS = 1000;
const TERR_STAGE_EARLY_SWITCH_CHANCE = 0.25;
const TERR_STAGE_LAST_STAGE_MIN_MS = 4000;
const TERR_STAGE_LAST_STAGE_MAX_MS = 8000;

// ---------------------------------------------------------------------------
// Mailbox, dog and pee stream
// ---------------------------------------------------------------------------

const TERR_MAILBOX_SRC_CENTER_X = 552;
const TERR_MAILBOX_SRC_BOTTOM_Y = 1859;

// Dog rests on the road under the mailbox and slides beside the post to mark.
const TERR_DOG_SRC_Y = 2201;
const TERR_DOG_SRC_HEIGHT = 127;
const TERR_DOG_MIN_SIZE = 46;
const TERR_DOG_AT_MAILBOX_Y = TERR_MAILBOX_SRC_BOTTOM_Y + 130; // approximate, tune by eye
const TERR_DOG_AT_MAILBOX_X_OFFSET = 70;
const TERR_DOG_APPROACH_MS = 220;
const TERR_DOG_ENTRANCE_MS = 1200;
const TERR_DOG_HOP_MS = 150;

// Dog art faces left in source; TerritoryDog flips it to face right.
const TERR_DOG_IDLE_IMAGE = require("../../assets/images/territory-dog-idle.png");
const TERR_DOG_PEEING_IMAGE = require("../../assets/images/territory-dog-peeing.png");
// Known aspects, used on web where Image.resolveAssetSource isn't available.
const TERR_DOG_IDLE_ASPECT = 1029 / 821;
const TERR_DOG_PEEING_ASPECT = 1056 / 781;

// 6-frame stream sprite, drawn top-to-bottom; stretched/rotated to run from
// the dog to the ground.
const TERR_PEE_STREAM_FRAMES = [
  require("../../assets/images/territory-pee-stream-1.png"),
  require("../../assets/images/territory-pee-stream-2.png"),
  require("../../assets/images/territory-pee-stream-3.png"),
  require("../../assets/images/territory-pee-stream-4.png"),
  require("../../assets/images/territory-pee-stream-5.png"),
  require("../../assets/images/territory-pee-stream-6.png"),
];
const TERR_PEE_STREAM_FRAME_ASPECT = 249 / 295;
const TERR_PEE_STREAM_FPS = 10;

// ---------------------------------------------------------------------------
// Ambient birds
// ---------------------------------------------------------------------------

// 6-frame wing-flap, all on one shared beak-anchored 322x301 canvas.
const TERR_BIRD_FRAMES = [
  require("../../assets/images/territory-bird-1.png"),
  require("../../assets/images/territory-bird-2.png"),
  require("../../assets/images/territory-bird-3.png"),
  require("../../assets/images/territory-bird-4.png"),
  require("../../assets/images/territory-bird-5.png"),
  require("../../assets/images/territory-bird-6.png"),
];
const TERR_BIRD_ASPECT = 322 / 301;
const TERR_BIRD_FPS = 8;
const TERR_BIRD_SIZE_FRACTION = 0.05; // of container height
// Each bird flies once, then waits a random time; total cycle MIN..MAX ms.
const TERR_BIRD_CYCLE_MIN_MS = 6000;
const TERR_BIRD_CYCLE_MAX_MS = 16000;
const TERR_BIRD_FLIGHT_MS = 4200;

// ---------------------------------------------------------------------------
// Marking meter and button
// ---------------------------------------------------------------------------

// Total hold time to fill the meter. Progress is kept across releases.
const TERR_MARK_FILL_MS = 15000;
const TERR_MARK_TICK_MS = 100;
// Coins for filling the meter (the only reward in this game).
const TERR_COMPLETE_REWARD = 20;

const TERR_MARK_BUTTON_IMAGE = require("../../assets/images/territory-mark-button.png");
const TERR_MARK_BUTTON_WIDTH = 78;
const TERR_MARK_BUTTON_HEIGHT = TERR_MARK_BUTTON_WIDTH / (450 / 138);

// Hand-drawn meter, tuned to this exact viewBox.
const TERR_METER_TRACK_WIDTH = 110;
const TERR_METER_TRACK_HEIGHT = 11;
// Wobbly outline plus a faint, slightly offset retrace for a sketchy look.
const TERR_METER_WOBBLE_OUTLINE_D =
  "M5.2,1.4 L29,0.7 L59,1.4 L85,0.7 L104.8,1.6 Q108.6,1.7 108.6,4.6 L108.2,6.8 Q108.7,9.5 105,9.7 L75,10.3 L45,9.6 L20,10.2 L5.4,9.5 Q1.3,9.7 1.3,6.4 L1.7,4 Q1.4,1.2 5.2,1.4 Z";
const TERR_METER_WOBBLE_OUTLINE_D_2 =
  "M5.5,1.1 L30,1.0 L60,1.1 L86,1.0 L105.1,1.3 Q108.3,1.4 108.3,4.3 L108.0,7.0 Q108.4,9.2 104.7,9.4 L74.7,10.0 L44.7,9.3 L19.7,9.9 L5.7,9.2 Q1.6,9.4 1.6,6.7 L2.0,3.8 Q1.7,1.5 5.5,1.1 Z";
// Seeded-jitter zigzag "marker scribble" fill, revealed left-to-right by a
// clip rect. Extends past 0..110 so it fills edge to edge after clipping.
const TERR_METER_ZIGZAG_D =
  "M-8.02,9.44 L-6.3,1.6 L-4.85,9.41 L-2.95,1.36 L-1.83,9.59 L-0.22,1.89 L1.82,9.47 L2.91,1.62 L4.37,9.25 L5.87,1.56 L7.59,9.48 L9.21,1.57 L10.84,9.7 L12.38,1.49 L13.61,9.14 L15.32,1.81 L17.11,9.61 L18.08,1.85 L20.01,9.34 L21.21,1.77 L22.4,9.3 L24.47,1.37 L25.59,9.14 L27.29,1.64 L28.83,9.54 L30.46,1.37 L31.76,9.26 L33.8,1.48 L35.2,9.34 L37.11,1.36 L38.64,9.25 L40.36,1.48 L41.62,9.45 L43.32,1.52 L45.03,9.39 L46.57,1.41 L48.0,9.59 L49.09,1.74 L50.82,9.67 L52.72,1.55 L53.83,9.68 L55.61,1.45 L57.24,9.28 L58.72,1.34 L60.08,9.61 L61.54,1.85 L62.84,9.26 L64.39,1.41 L66.14,9.18 L67.79,1.89 L69.31,9.45 L70.38,1.31 L72.43,9.68 L73.76,1.59 L75.24,9.7 L76.74,1.74 L78.54,9.52 L80.3,1.51 L81.91,9.62 L83.38,1.82 L84.87,9.33 L86.45,1.35 L88.24,9.63 L89.58,1.74 L91.19,9.6 L92.73,1.32 L94.19,9.24 L95.82,1.67 L97.42,9.11 L99.1,1.42 L100.63,9.5 L102.15,1.5 L103.42,9.36 L105.45,1.83 L106.79,9.29 L108.15,1.8 L109.95,9.67 L111.14,1.57 L112.62,9.35 L114.36,1.49 L116.29,9.37 L117.2,1.82";
const TERR_METER_ZIGZAG_COLOR = "#FFD200";
const TERR_INK = "#2B1F19";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Cached per asset so we don't hit the native bridge on every render.
const assetAspectCache = new Map<number, number>();
function resolveAssetAspect(source: ImageSourcePropType, fallbackAspect: number): number {
  if (Platform.OS === "web" || typeof Image.resolveAssetSource !== "function") return fallbackAspect;
  if (typeof source !== "number") {
    const resolved = Image.resolveAssetSource(source);
    return resolved.width / resolved.height;
  }
  const cached = assetAspectCache.get(source);
  if (cached !== undefined) return cached;
  const resolved = Image.resolveAssetSource(source);
  const aspect = resolved.width / resolved.height;
  assetAspectCache.set(source, aspect);
  return aspect;
}

// Cycles a sprite frame index at `fps` on requestAnimationFrame while
// `active` is true (frame-rate independent: skips frames if it falls behind).
function useSpriteFrame(frameCount: number, fps: number, active = true): number {
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const frameDuration = 1000 / fps;
    let rafId: number;
    let lastTime: number | null = null;
    const tick = (time: number) => {
      if (lastTime === null) lastTime = time;
      const elapsed = time - lastTime;
      if (elapsed >= frameDuration) {
        const steps = Math.floor(elapsed / frameDuration);
        lastTime += steps * frameDuration;
        setFrameIndex((prev) => (prev + steps) % frameCount);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, frameCount, fps]);
  return frameIndex;
}

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------

// Stream sprite stretched and rotated to run from origin to target.
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
  const frameIndex = useSpriteFrame(TERR_PEE_STREAM_FRAMES.length, TERR_PEE_STREAM_FPS);

  const dx = targetX - originX;
  const dy = targetY - originY;
  const height = Math.max(Math.hypot(dx, dy), 1);
  const width = height * TERR_PEE_STREAM_FRAME_ASPECT;
  // Rotate the sprite's "down" axis to point along (dx, dy).
  const angleDeg = (Math.atan2(-dx, dy) * 180) / Math.PI;
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
        // Mirrored in local space so the flip doesn't change the direction.
        style={{ width: "100%", height: "100%", transform: [{ scaleX: -1 }] }}
        resizeMode="stretch"
      />
    </View>
  );
}

// Decorative bird: crosses the sky once, waits a random time, repeats.
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
  const progress = useRef(new Animated.Value(0)).current;
  const [isFlying, setIsFlying] = useState(false);
  // Wings only flap while in the air.
  const frameIndex = useSpriteFrame(TERR_BIRD_FRAMES.length, TERR_BIRD_FPS, isFlying);

  // Size/width are captured at the start of each flight so parent re-renders
  // can't resize the bird mid-air; real resizes apply on the next flight.
  const latestPropsRef = useRef({ size, containerWidth });
  latestPropsRef.current = { size, containerWidth };
  const flightGeomRef = useRef({ size, containerWidth });

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const randomPauseMs = () => Math.max(0, minCycleMs + Math.random() * (maxCycleMs - minCycleMs) - flightMs);

    const flyOnce = () => {
      if (cancelled) return;
      flightGeomRef.current = latestPropsRef.current;
      progress.setValue(0);
      setIsFlying(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: flightMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        setIsFlying(false);
        if (cancelled || !finished) return;
        timeoutId = setTimeout(flyOnce, randomPauseMs());
      });
    };

    timeoutId = setTimeout(flyOnce, startDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      progress.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightMs, minCycleMs, maxCycleMs, startDelayMs]);

  const { size: flightSize, containerWidth: flightContainerWidth } = flightGeomRef.current;
  const width = flightSize * TERR_BIRD_ASPECT;
  const startX = direction === "left-to-right" ? -width : flightContainerWidth + width;
  const endX = direction === "left-to-right" ? flightContainerWidth + width : -width;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: y,
        left: 0,
        width,
        height: flightSize,
        pointerEvents: "none",
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] }) },
          // Art faces right; flip when flying left.
          { scaleX: direction === "right-to-left" ? -1 : 1 },
        ],
      }}
    >
      <Image source={TERR_BIRD_FRAMES[frameIndex]} style={{ width, height: flightSize }} resizeMode="stretch" />
    </Animated.View>
  );
}

// The dog: hops in from off-screen on mount, then slides beside the mailbox
// (marking pose) while `isHolding` and back when released.
function TerritoryDog({
  restX,
  restY,
  atMailboxX,
  atMailboxY,
  size,
  isHolding,
}: {
  restX: number;
  restY: number;
  atMailboxX: number;
  atMailboxY: number;
  size: number;
  isHolding: boolean;
}) {
  const entrance = useRef(new Animated.Value(0)).current; // 0 -> 1 once
  const hop = useRef(new Animated.Value(0)).current; // bob during entrance only
  const atMailbox = useRef(new Animated.Value(0)).current; // 0 rest, 1 marking

  useEffect(() => {
    const hopLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: TERR_DOG_HOP_MS, useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: TERR_DOG_HOP_MS, useNativeDriver: true }),
      ])
    );
    hopLoop.start();
    Animated.timing(entrance, { toValue: 1, duration: TERR_DOG_ENTRANCE_MS, useNativeDriver: true }).start(
      ({ finished }) => {
        if (!finished) return;
        hopLoop.stop();
        hop.setValue(0);
      }
    );
    return () => hopLoop.stop();
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

  const poseImage = isHolding ? TERR_DOG_PEEING_IMAGE : TERR_DOG_IDLE_IMAGE;
  const aspect = resolveAssetAspect(poseImage, isHolding ? TERR_DOG_PEEING_ASPECT : TERR_DOG_IDLE_ASPECT);
  const width = size * aspect;
  // Start fully off-screen to the left, whatever the container width.
  const entranceStartX = -(restX + size);

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
          // Screen-space moves first so the flip below doesn't affect them.
          { translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [entranceStartX, 0] }) },
          { translateX: atMailbox.interpolate({ inputRange: [0, 1], outputRange: [0, atMailboxX - restX] }) },
          { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          { translateY: atMailbox.interpolate({ inputRange: [0, 1], outputRange: [0, atMailboxY - restY] }) },
          { scaleX: -1 },
        ],
      }}
    >
      <Image source={poseImage} style={{ width, height: size }} resizeMode="contain" />
    </Animated.View>
  );
}

// Hand-drawn progress meter: zigzag fill clipped to `progress`, outline on top.
function TerritoryMeterScribbleTrack({ progress }: { progress: number }) {
  const clipId = useId();
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return (
    <Svg
      width={TERR_METER_TRACK_WIDTH}
      height={TERR_METER_TRACK_HEIGHT}
      viewBox={`0 0 ${TERR_METER_TRACK_WIDTH} ${TERR_METER_TRACK_HEIGHT}`}
    >
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={0} y={0} width={TERR_METER_TRACK_WIDTH * clampedProgress} height={TERR_METER_TRACK_HEIGHT} />
        </ClipPath>
      </Defs>
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
      <Path d={TERR_METER_WOBBLE_OUTLINE_D_2} fill="none" stroke={TERR_INK} strokeWidth={0.7} strokeLinejoin="round" opacity={0.4} />
      <Path d={TERR_METER_WOBBLE_OUTLINE_D} fill="none" stroke={TERR_INK} strokeWidth={1.1} strokeLinejoin="round" opacity={0.9} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export function MarkYourTerritoryGame({ onExit }: { onExit: () => void }) {
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { earnCoins } = usePets();

  // --- State (mirrored into refs for the interval callbacks) ---
  const [neighborStage, setNeighborStage] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isCaught, setIsCaught] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [markProgress, setMarkProgress] = useState(0); // 0..1
  // Lags isHolding by the slide time so the stream appears on arrival.
  const [isDogAtMailbox, setIsDogAtMailbox] = useState(false);
  // Measured container size (useWindowDimensions is wrong on Expo web).
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

  const isHoldingRef = useRef(false);
  const isCaughtRef = useRef(false);
  const isCompleteRef = useRef(false);
  const neighborStageRef = useRef(0);
  const markProgressRef = useRef(0);

  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const markIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageElapsedRef = useRef(0); // ms since the last stage switch
  const lastStageDurationRef = useRef(0); // this dwell's random last-stage length

  const updateHolding = (value: boolean) => {
    isHoldingRef.current = value;
    setIsHolding(value);
  };
  const updateMarkProgress = (value: number) => {
    markProgressRef.current = value;
    setMarkProgress(value);
  };
  const updateNeighborStage = (value: number) => {
    neighborStageRef.current = value;
    setNeighborStage(value);
  };

  const stopStageClock = () => {
    if (stageIntervalRef.current) clearInterval(stageIntervalRef.current);
    stageIntervalRef.current = null;
  };
  const stopMarking = () => {
    if (markIntervalRef.current) clearInterval(markIntervalRef.current);
    markIntervalRef.current = null;
  };

  const bust = () => {
    stopStageClock();
    stopMarking();
    updateHolding(false);
    isCaughtRef.current = true;
    setIsCaught(true);
  };

  const win = () => {
    stopStageClock();
    stopMarking();
    updateHolding(false);
    isCompleteRef.current = true;
    setIsComplete(true);
    earnCoins(TERR_COMPLETE_REWARD);
  };

  // One tick of the neighbor's stage clock (kept in a ref so the interval
  // always calls the latest version).
  const stageTickRef = useRef<() => void>(() => {});
  stageTickRef.current = () => {
    if (isCaughtRef.current || isCompleteRef.current) {
      stopStageClock();
      return;
    }
    stageElapsedRef.current += TERR_STAGE_TICK_MS;
    if (neighborStageRef.current === TERR_LAST_STAGE) {
      if (stageElapsedRef.current < lastStageDurationRef.current) return;
    } else {
      const rolledEarly = Math.random() < TERR_STAGE_EARLY_SWITCH_CHANCE;
      if (!rolledEarly && stageElapsedRef.current < TERR_STAGE_INTERVAL_MS) return;
    }
    stageElapsedRef.current = 0;
    const next = (neighborStageRef.current + 1) % TERR_PORCH_GUY_STAGES.length;
    updateNeighborStage(next);
    if (next === TERR_LAST_STAGE) {
      lastStageDurationRef.current =
        TERR_STAGE_LAST_STAGE_MIN_MS + Math.random() * (TERR_STAGE_LAST_STAGE_MAX_MS - TERR_STAGE_LAST_STAGE_MIN_MS);
      if (isHoldingRef.current) bust();
    }
  };

  const startStageClock = useCallback(() => {
    stopStageClock();
    updateNeighborStage(0);
    stageElapsedRef.current = 0;
    stageIntervalRef.current = setInterval(() => stageTickRef.current(), TERR_STAGE_TICK_MS);
  }, []);

  useEffect(() => {
    startStageClock();
    return () => {
      stopStageClock();
      stopMarking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isHolding) {
      setIsDogAtMailbox(false);
      return;
    }
    const t = setTimeout(() => setIsDogAtMailbox(true), TERR_DOG_APPROACH_MS);
    return () => clearTimeout(t);
  }, [isHolding]);

  // --- Input ---

  const handleMarkPressIn = () => {
    if (isCaughtRef.current || isCompleteRef.current) return;
    // Grabbing while he's already watching is an instant bust.
    if (neighborStageRef.current === TERR_LAST_STAGE) {
      bust();
      return;
    }
    updateHolding(true);
    stopMarking();
    markIntervalRef.current = setInterval(() => {
      const next = Math.min(1, markProgressRef.current + TERR_MARK_TICK_MS / TERR_MARK_FILL_MS);
      updateMarkProgress(next);
      if (next >= 1) win();
    }, TERR_MARK_TICK_MS);
  };

  // Releasing just pauses the meter; progress and the neighbor's stage stay.
  const handleMarkPressOut = () => {
    updateHolding(false);
    stopMarking();
  };

  const resetRound = () => {
    isCaughtRef.current = false;
    setIsCaught(false);
    isCompleteRef.current = false;
    setIsComplete(false);
    updateMarkProgress(0);
    startStageClock();
  };

  // --- Layout (house-image pixels -> screen) ---

  const scale = layout ? (layout.height / TERR_HOUSE_IMG_HEIGHT) * TERR_HOUSE_ZOOM : 0;
  const scaledHouseWidth = TERR_HOUSE_IMG_WIDTH * scale;
  const scaledHouseHeight = TERR_HOUSE_IMG_HEIGHT * scale;
  // Negative when the image is wider than the box (sides cropped).
  const houseOffsetX = layout ? (layout.width - scaledHouseWidth) / 2 : 0;
  // Pinned to the bottom so any spare height goes above the roof.
  const houseOffsetY = layout ? layout.height - scaledHouseHeight : 0;
  const toScreenX = (srcX: number) => srcX * scale + houseOffsetX;
  const toScreenY = (srcY: number) => srcY * scale + houseOffsetY;

  const neighborPose = isCaught
    ? TERR_PORCH_GUY_CAUGHT
    : TERR_PORCH_GUY_STAGES[Math.min(neighborStage, TERR_LAST_STAGE)];
  const guyHeight = TERR_PORCH_GUY_SRC_HEIGHT * scale;
  const guyWidth = guyHeight * neighborPose.aspect;
  const guyLeft = toScreenX(TERR_PORCH_GUY_SRC_CENTER_X) - neighborPose.chairCenterFrac * guyWidth;
  const guyTop = toScreenY(TERR_PORCH_GUY_SRC_FLOOR_Y - TERR_PORCH_GUY_LIFT) - guyHeight;

  const mailboxCenterX = toScreenX(TERR_MAILBOX_SRC_CENTER_X);
  const dogRestY = toScreenY(TERR_DOG_SRC_Y);
  const dogSize = Math.max(TERR_DOG_MIN_SIZE, TERR_DOG_SRC_HEIGHT * scale);
  const dogAtMailboxX = mailboxCenterX + TERR_DOG_AT_MAILBOX_X_OFFSET * scale;
  const dogAtMailboxY = toScreenY(TERR_DOG_AT_MAILBOX_Y);
  const dogPeeingWidth = dogSize * TERR_DOG_PEEING_ASPECT;

  const roundActive = !isCaught && !isComplete;
  // Keep bottom UI on the art, not the letterbox, on wide screens.
  const bottomUiLeft = Math.max(houseOffsetX + 16, insets.left + 16);
  const bottomUiRight = Math.max(houseOffsetX + 16, insets.right + 16);

  return (
    <View
      style={styles.territoryFullScreen}
      onLayout={(e) => {
        // Ignore sub-pixel re-fires so the scene doesn't pop on no-op layouts.
        const width = Math.round(e.nativeEvent.layout.width);
        const height = Math.round(e.nativeEvent.layout.height);
        setLayout((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
      }}
    >
      {layout && (
        <>
          {/* Explicit size: RN Web's Image otherwise uses the asset's natural size. */}
          <Image
            source={TERR_HOUSE_IMAGE}
            style={{
              position: "absolute",
              top: houseOffsetY - TERR_HOUSE_TOP_OVERSCAN,
              left: houseOffsetX,
              width: scaledHouseWidth,
              height: scaledHouseHeight + TERR_HOUSE_TOP_OVERSCAN,
            }}
            resizeMode="cover"
          />

          <TerritoryBird
            containerWidth={layout.width}
            y={layout.height * 0.2}
            size={layout.height * TERR_BIRD_SIZE_FRACTION}
            direction="left-to-right"
            flightMs={TERR_BIRD_FLIGHT_MS}
            minCycleMs={TERR_BIRD_CYCLE_MIN_MS}
            maxCycleMs={TERR_BIRD_CYCLE_MAX_MS}
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
            source={neighborPose.source}
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
          />

          {isDogAtMailbox && roundActive && (
            // From the dog's hip down to the ground beside the post.
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

      {roundActive && (
        <View style={[styles.territoryMeterWrap, { pointerEvents: "none", left: bottomUiLeft, bottom: insets.bottom + 28 }]}>
          <View style={styles.territoryMeterCard}>
            <Text style={styles.territoryMeterLabel}>Marking</Text>
            <View style={styles.territoryMeterTrackOuter}>
              <TerritoryMeterScribbleTrack progress={markProgress} />
            </View>
          </View>
        </View>
      )}

      {roundActive && (
        <View
          style={[
            styles.territoryMarkButtonWrap,
            {
              pointerEvents: "box-none",
              width: TERR_MARK_BUTTON_WIDTH,
              right: bottomUiRight,
              bottom: insets.bottom + 28,
            },
          ]}
        >
          <PressableScale
            onPressIn={handleMarkPressIn}
            onPressOut={handleMarkPressOut}
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
        <TerritoryResultCard
          title="Busted! 🚨"
          message="He caught you marking his mailbox."
          buttonLabel="Try Again"
          accentColor={accentColor}
          onPress={resetRound}
        />
      )}

      {isComplete && (
        <TerritoryResultCard
          title="Marked! 🐾"
          message="You fully marked his mailbox without getting caught."
          buttonLabel="Play Again"
          accentColor={accentColor}
          onPress={resetRound}
        />
      )}
    </View>
  );
}

function TerritoryResultCard({
  title,
  message,
  buttonLabel,
  accentColor,
  onPress,
}: {
  title: string;
  message: string;
  buttonLabel: string;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.territoryResultOverlay, { pointerEvents: "box-none" }]}>
      <View style={styles.territoryResultCard}>
        <Text style={styles.territoryResultTitle}>{title}</Text>
        <Text style={sharedGameStyles.gameOverText}>{message}</Text>
        <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={onPress}>
          <Text style={sharedGameStyles.primaryButtonText}>{buttonLabel}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  territoryFullScreen: {
    flex: 1,
    width: "100%",
    backgroundColor: "#BFE6FF",
    overflow: "hidden", // crops the house's sides on narrow screens
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
    borderColor: TERR_INK,
    borderTopColor: "#F1D5A9",
    borderLeftColor: "#F1D5A9",
    ...crossPlatformShadow({ offsetY: 2, opacity: 0.3, radius: 4, elevation: 4 }),
  },
  territoryMeterLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: TERR_INK,
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
  territoryResultOverlay: {
    // Literal absoluteFill (absoluteFillObject isn't in this project's RN types).
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  territoryResultCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 28,
    alignItems: "center",
    maxWidth: 300,
  },
  territoryResultTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
});
