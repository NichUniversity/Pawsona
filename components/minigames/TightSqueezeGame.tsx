import { useEffect, useRef, useState } from "react";
import { Animated, Image, PanResponder, StyleSheet, Text, View } from "react-native";
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
// How long the "Level N clear!" banner stays up.
const TS_CLEARED_BANNER_MS = 900;
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

// Level 1 - straight horizontal tunnel centered at y ~846, ~37px half-height.
const TS_STRAIGHT_PATH: TSPoint[] = Array.from({ length: 44 }, (_, i) => ({
  x: 40 + (i * (900 - 40)) / 43,
  y: 846,
}));

const TS_CAVE_DESIGN: TSLevelDesign = {
  ...TS_CAVE_COMMON,
  label: "The Cave Crawl",
  instructions: "Drag the paw through the glowing tunnel from START to FINISH. Don't scrape the cave walls!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-straight.png"),
  points: TS_STRAIGHT_PATH,
  halfWidth: 37,
};

// Level 2 - S-curve around a boulder. Every route point is >= ~29px from a
// wall (median ~36), so halfWidth 34 is a fair but tighter squeeze.
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
  ...TS_CAVE_COMMON,
  label: "The Winding Tunnel",
  instructions: "Follow the tunnel down around the boulder and back up to the far side. Careful on the curves!",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-wave-nolabels.png"),
  points: TS_WAVE_PATH,
  halfWidth: 34,
};

// Level 3 - level 1's tunnel with three rock lanes. Each rock takes ~0.7s
// to cross the tunnel and is clear for ~1.3s, leaving a window to dash under.
const TS_ROCK_FALL_TOP = 650;
const TS_ROCK_FALL_BOTTOM = 1050;

const TS_ROCKFALL_DESIGN: TSLevelDesign = {
  ...TS_CAVE_DESIGN,
  label: "Rockfall",
  instructions: "Same tunnel — but rocks are falling! Time your dash under each one. Touch a rock or a wall and it's game over.",
  backgroundImage: require("../../assets/images/tight-squeeze-cave-straight-nolabels.png"),
  fallingRocks: [
    { x: 250, radius: 26, period: 1900, phase: 0.0 },
    { x: 470, radius: 26, period: 2200, phase: 0.45 },
    { x: 690, radius: 26, period: 2000, phase: 0.8 },
  ],
};

// In play order. Clearing the last one wins the run.
const TS_LEVELS: TSLevelDesign[] = [TS_CAVE_DESIGN, TS_WAVE_DESIGN, TS_ROCKFALL_DESIGN];
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
  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">("idle");
  const [level, setLevel] = useState(1);
  const [levelsCleared, setLevelsCleared] = useState(0);
  const [bestLevel, setBestLevel] = useState(0);
  const [won, setWon] = useState(false);
  const [lastCoins, setLastCoins] = useState(0);
  const [design, setDesign] = useState<TSLevelDesign>(() => getLevelDesign(1));
  const [justCleared, setJustCleared] = useState(false);
  const [playAreaSize, setPlayAreaSize] = useState({ width: 0, height: 0 });

  // --- Refs read by gesture/animation callbacks (which are created once) ---
  const gameStateRef = useRef(gameState);
  const levelRef = useRef(1);
  const levelsClearedRef = useRef(0);
  const designRef = useRef<TSLevelDesign>(design);
  const trackSizeRef = useRef({ width: 0, height: 0 });
  const clearedBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      if (clearedBannerTimeoutRef.current) clearTimeout(clearedBannerTimeoutRef.current);
    };
  }, []);

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

  // Move the paw to `point`. If a drag is still in progress (level cleared
  // mid-gesture), back the gesture's accumulated dx/dy out of the drag start,
  // since PanResponder keeps measuring from the original touch-down.
  const placeBoneAt = (point: TSPoint, gestureOffset?: TSGesture) => {
    boneBaseRef.current = { ...point };
    const layout = currentLayout();
    boneDragStartRef.current = gestureOffset
      ? { x: point.x - gestureOffset.dx / layout.scaleX, y: point.y - gestureOffset.dy / layout.scaleY }
      : { ...point };
    bonePosX.setValue(point.x * layout.scaleX);
    bonePosY.setValue(point.y * layout.scaleY);
  };

  const loadLevel = (levelNumber: number, gestureOffset?: TSGesture) => {
    const next = getLevelDesign(levelNumber);
    designRef.current = next;
    setDesign(next);
    placeBoneAt(next.points[0], gestureOffset);
  };

  const startGame = () => {
    setWon(false);
    levelRef.current = 1;
    setLevel(1);
    levelsClearedRef.current = 0;
    setLevelsCleared(0);
    setJustCleared(false);
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

  const handleLevelComplete = (gesture?: TSGesture) => {
    levelsClearedRef.current += 1;
    setLevelsCleared(levelsClearedRef.current);
    if (levelRef.current >= TS_TOTAL_LEVELS) {
      finishRun(true);
      return;
    }
    const nextLevel = levelRef.current + 1;
    levelRef.current = nextLevel;
    setLevel(nextLevel);
    loadLevel(nextLevel, gesture);

    setJustCleared(true);
    if (clearedBannerTimeoutRef.current) clearTimeout(clearedBannerTimeoutRef.current);
    clearedBannerTimeoutRef.current = setTimeout(() => setJustCleared(false), TS_CLEARED_BANNER_MS);
  };

  // Shared by drag and D-pad: clamp to the canvas, move the paw, then check
  // finish first and walls second.
  const attemptMoveBoneTo = (rawX: number, rawY: number, gesture?: TSGesture) => {
    if (gameStateRef.current !== "playing") return;
    const d = designRef.current;
    const layout = currentLayout();
    const x = Math.max(0, Math.min(d.baseWidth, rawX));
    const y = Math.max(0, Math.min(d.baseHeight, rawY));
    boneBaseRef.current = { x, y };
    bonePosX.setValue(x * layout.scaleX);
    bonePosY.setValue(y * layout.scaleY);

    const finish = d.points[d.points.length - 1];
    if (Math.hypot(x - finish.x, y - finish.y) <= d.finishRadius) {
      handleLevelComplete(gesture);
      return;
    }

    const allowedHalfWidth = Math.max(d.minAllowedHalfWidth, d.halfWidth - d.boneRadius);
    if (!isInsideTunnel({ x, y }, d.points, allowedHalfWidth)) {
      finishRun(false);
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
          boneDragStartRef.current.y + gesture.dy / layout.scaleY,
          gesture
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

              {justCleared && (
                <View style={[styles.tsClearedBanner, { pointerEvents: "none" }]}>
                  <Text style={styles.tsClearedBannerText}>Level {level - 1} clear!</Text>
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

// A faceted falling boulder in the cave's browns; fills whatever box it's given.
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
