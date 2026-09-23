import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

// Animated background for a new sailing/ocean Adventure area: the puppy-captain
// sunset scene, with a red pennant flapping at the top of the mast, a red
// collar/bandana whose loose tail streams in the wind, and a few distant birds
// flapping toward the sunset. Everything but the flag is built on RN's
// built-in Animated API (not Reanimated) to match AmbientEffects/
// WalkingSprite/ScrollingLayer, which all use the same API already; the flag
// and collar are hand-drawn sprite cycles (see SpriteLoop below)
// played the same way WalkingSprite plays a pet's walk cycle.
//
// None of these elements existed as separate art in the source painting — the
// flag and collar are new additions (drawn into bare sky/neck), and the three
// birds were painted directly into the sky, so they were removed from the base
// art (assets/backgrounds/adventure_sailing_sunset.png) and rebuilt here as
// animated sprites in the exact same spots.
//
// Per the standing preference for full-screen background art, the image is laid
// out with resizeMode="contain" behind a sky-colored backdrop (never "cover",
// to avoid cropping); every overlay is positioned as a fraction of the image's
// own pixel dimensions, then mapped into the actual on-screen "contain" rect
// (computed in onLayout) so everything lines up correctly on any device size.

const SOURCE = require("../../assets/backgrounds/adventure_sailing_sunset.png");
const IMAGE_WIDTH = 941;
const IMAGE_HEIGHT = 1672;
const IMAGE_ASPECT = IMAGE_WIDTH / IMAGE_HEIGHT;
const SKY_BACKDROP = "#5E7EC8";

// --- Flag: a 12-frame hand-drawn flap cycle (assets/animations/flag_wave_0..11
// .png) that loops seamlessly (frame 11 flows straight back into frame 0).
// The art already supplies the waving motion, so we only step through frames.
//
// All 12 frames were cut from one hand-drawn strip and pre-aligned when
// exported: each sits on an identical 186x372 transparent canvas with its
// pole edge registered to the same pixel (FLAG_POLE below) in every frame,
// so the box never moves — only the cloth changes. (The earlier 6-frame set
// drifted up to ~20px between frames and needed a per-frame offset table.)
// Alpha was also cleaned on export: the cloth body had been ~2% translucent,
// letting the sky tint through, and a faint haze surrounded each flag.
const FLAG_FRAMES = [
  require("../../assets/animations/flag_wave_0.png"),
  require("../../assets/animations/flag_wave_1.png"),
  require("../../assets/animations/flag_wave_2.png"),
  require("../../assets/animations/flag_wave_3.png"),
  require("../../assets/animations/flag_wave_4.png"),
  require("../../assets/animations/flag_wave_5.png"),
  require("../../assets/animations/flag_wave_6.png"),
  require("../../assets/animations/flag_wave_7.png"),
  require("../../assets/animations/flag_wave_8.png"),
  require("../../assets/animations/flag_wave_9.png"),
  require("../../assets/animations/flag_wave_10.png"),
  require("../../assets/animations/flag_wave_11.png"),
];
const FLAG_SLOT_ASPECT = 372 / 186;
// Pole point, as a fraction of the frame canvas — identical for every frame.
const FLAG_POLE = { x: 349 / 362, y: 388 / 724 };
const FLAG_ANCHOR_X_FRAC = 0.4017;
const FLAG_ANCHOR_Y_FRAC = 0.2414;
const FLAG_BOX_WIDTH_FRAC = 0.175;
// 12 frames at 5.5fps = a ~2.2s loop — an easy, relaxed wave. Raise to
// speed it up (7 = ~1.7s), lower to slow it further.
const FLAG_FPS = 5.5;
const FLAG_SEQUENCE = FLAG_FRAMES.map((_, i) => i);

// --- Collar: a 10-frame hand-drawn flap cycle (assets/animations/collar_wave_0..9
// .png) — a red bandana tied in a knot at the neck, its long tail whipping
// and curling in the wind. Prepared like the flag: cut from one hand-drawn
// sheet (two rows of five), alpha cleaned, scaled so the band is 132px wide
// (matching the previous collar art exactly), and pre-aligned so the
// band and knot sit on the same pixel of an identical 320x640 canvas in every
// frame (COLLAR_POLE = the band's top-left corner). Only the tails move.
// All 10 frames loop cleanly (frame 9 flows straight back into frame 0).
//
// Placement was tuned by compositing the frames onto
// adventure_sailing_sunset.png: the band spans the dog's neck at the same
// width and height the previous collar's ring did.
const COLLAR_FRAMES = [
  require("../../assets/animations/collar_wave_0.png"),
  require("../../assets/animations/collar_wave_1.png"),
  require("../../assets/animations/collar_wave_2.png"),
  require("../../assets/animations/collar_wave_3.png"),
  require("../../assets/animations/collar_wave_4.png"),
  require("../../assets/animations/collar_wave_5.png"),
  require("../../assets/animations/collar_wave_6.png"),
  require("../../assets/animations/collar_wave_7.png"),
  require("../../assets/animations/collar_wave_8.png"),
  require("../../assets/animations/collar_wave_9.png"),
];
const COLLAR_SLOT_ASPECT = 640 / 320;
// Band top-left corner, as a fraction of the frame canvas — identical for every frame.
const COLLAR_POLE = { x: 150 / 320, y: 300 / 640 };
const COLLAR_ANCHOR_X_FRAC = 0.3241;
const COLLAR_ANCHOR_Y_FRAC = 0.5712;
const COLLAR_BOX_WIDTH_FRAC = 0.2777;
// Same frame rate as the flag, so both move to one wind (10 frames = ~1.8s loop).
const COLLAR_FPS = FLAG_FPS;
const COLLAR_SEQUENCE = COLLAR_FRAMES.map((_, i) => i);

// --- Wind: soft curled streaks that drift right-to-left (the same way the
// flag and collar are blowing), fading in, crossing part of the scene, and
// fading out. Each gust has its own lane, speed and start offset so they
// never pulse in unison. Drawn as SVG strokes and moved with the native
// driver only (translateX + opacity), so they cost nothing on the JS thread.
type GustSpec = {
  xFrac: number; // where the gust starts (its right edge), as a fraction of image width
  yFrac: number; // vertical lane, as a fraction of image height
  widthFrac: number; // streak length, as a fraction of image width
  travelFrac: number; // how far left it drifts over its life, fraction of image width
  duration: number; // ms from fade-in to fade-out
  gap: number; // ms of rest between passes
  delay: number; // ms before the first pass
  maxOpacity: number;
};
const WIND_COLOR = "#FFF6E8";
const GUSTS: GustSpec[] = [
  { xFrac: 0.95, yFrac: 0.14, widthFrac: 0.3, travelFrac: 0.45, duration: 3600, gap: 1800, delay: 0, maxOpacity: 0.55 },
  { xFrac: 0.7, yFrac: 0.22, widthFrac: 0.22, travelFrac: 0.4, duration: 3000, gap: 2600, delay: 1400, maxOpacity: 0.45 },
  { xFrac: 1.0, yFrac: 0.3, widthFrac: 0.26, travelFrac: 0.5, duration: 4000, gap: 2000, delay: 2600, maxOpacity: 0.5 },
  { xFrac: 0.6, yFrac: 0.44, widthFrac: 0.2, travelFrac: 0.35, duration: 3200, gap: 3000, delay: 800, maxOpacity: 0.4 },
  { xFrac: 0.95, yFrac: 0.55, widthFrac: 0.28, travelFrac: 0.45, duration: 3800, gap: 2400, delay: 3400, maxOpacity: 0.45 },
  { xFrac: 0.5, yFrac: 0.68, widthFrac: 0.22, travelFrac: 0.4, duration: 3400, gap: 2800, delay: 2000, maxOpacity: 0.35 },
];
// Streak shape in a 120x24 box: a long tail on the right tapering into a
// small curl on the left — the leading edge, since the wind blows leftward.
const GUST_PATH = "M118,13 C96,13 80,8 60,10 C42,12 30,19 18,16 C9,14 8,6 15,6 C20,6 21,11 17,12";
const GUST_ASPECT = 24 / 120;

type BirdSpec = { xFrac: number; yFrac: number; widthFrac: number; phase: number };

// Positioned to match exactly where the three birds were painted in the
// original artwork, before they were removed for animation.
const BIRDS: BirdSpec[] = [
  { xFrac: 0.8528, yFrac: 0.3323, widthFrac: 0.0648, phase: 0 },
  { xFrac: 0.9267, yFrac: 0.3577, widthFrac: 0.0574, phase: 210 },
  { xFrac: 0.7875, yFrac: 0.3798, widthFrac: 0.051, phase: 420 },
];
const BIRD_ASPECT = 0.5;

type ContainRect = { left: number; top: number; width: number; height: number };

function computeContainRect(containerW: number, containerH: number): ContainRect {
  const containerAspect = containerW / containerH;

  if (containerAspect > IMAGE_ASPECT) {
    const height = containerH;
    const width = height * IMAGE_ASPECT;
    return { left: (containerW - width) / 2, top: 0, width, height };
  }

  const width = containerW;
  const height = width / IMAGE_ASPECT;
  return { left: 0, top: (containerH - height) / 2, width, height };
}

export function SailingAdventureBackground() {
  const [rect, setRect] = useState<ContainRect | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setRect(computeContainRect(width, height));
    }
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: SKY_BACKDROP, overflow: "hidden" }]}
      onLayout={onLayout}
      pointerEvents="none"
    >
      {rect && (
        <>
          {/* Explicit left/top/width/height (not style={StyleSheet.absoluteFill} +
              resizeMode) — same fix PetRoomBackground already uses, because on
              react-native-web an absolutely-positioned Image sized only by
              resizeMode/percentage-fill can render at its raw intrinsic pixel
              size (941x1672) instead of being scaled to the container, which
              also confuses the parent's own onLayout measurement without
              overflow:"hidden" above. Giving it real numbers sidesteps both. */}
          <Image
            source={SOURCE}
            resizeMode="contain"
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
          />
          {/* Clipped to the painting so streaks never drift over the
              letterbox bars around it; inside it, gusts are positioned
              relative to the painting's own top-left corner. */}
          <View
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              overflow: "hidden",
            }}
          >
            {GUSTS.map((gust, i) => (
              <WindGust key={i} rect={{ ...rect, left: 0, top: 0 }} gust={gust} />
            ))}
          </View>
          <FlagCloth rect={rect} />
          <Collar rect={rect} />
          {BIRDS.map((bird, i) => (
            <FlyingBird key={i} rect={rect} bird={bird} />
          ))}
        </>
      )}
    </View>
  );
}

/** Loops an Animated.Value back and forth between two values with sine-like easing. */
function useOscillation(from: number, to: number, duration: number, delay = 0) {
  const value = useRef(new Animated.Value(from)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: to,
          duration,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: from,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, duration, delay]);

  return value;
}

/**
 * Steps through a pre-aligned sprite cycle via requestAnimationFrame (the
 * same drift-free stepping WalkingSprite uses), forward-only through
 * `sequence` so ripples always travel with the wind rather than rewinding.
 *
 * No cross-fade: frames cut instantly. Every frame stays mounted and decoded
 * in the same box, and only the current one is visible, so a swap is just an
 * opacity flip — no blank flash while an image source loads, and never two
 * poses on screen at once (the old two-layer cross-fade could show both on
 * web when the layers finished loading at different times).
 */
function SpriteLoop({
  frames,
  sequence,
  fps,
  box,
}: {
  frames: number[];
  sequence: number[];
  fps: number;
  box: { left: number; top: number; width: number; height: number };
}) {
  const [frameIndex, setFrameIndex] = useState(sequence[0]);

  useEffect(() => {
    const frameDuration = 1000 / fps;
    const period = sequence.length;
    let rafId: number;
    let lastTime: number | null = null;
    let step = 0;
    let stopped = false;

    const tick = (time: number) => {
      if (stopped) return;
      if (lastTime === null) lastTime = time;
      const elapsed = time - lastTime;

      if (elapsed >= frameDuration) {
        const advance = Math.floor(elapsed / frameDuration);
        lastTime += advance * frameDuration;
        step = (step + advance) % period;
        setFrameIndex(sequence[step]);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, [fps, sequence]);

  return (
    <>
      {frames.map((src, i) => (
        <Image
          key={i}
          source={src}
          style={[{ position: "absolute" }, box, { opacity: i === frameIndex ? 1 : 0 }]}
          resizeMode="stretch"
        />
      ))}
    </>
  );
}

/** The flag on the mast — its pole point pinned to FLAG_ANCHOR. */
function FlagCloth({ rect }: { rect: ContainRect }) {
  const boxW = rect.width * FLAG_BOX_WIDTH_FRAC;
  const boxH = boxW * FLAG_SLOT_ASPECT;
  const anchorX = rect.left + rect.width * FLAG_ANCHOR_X_FRAC;
  const anchorY = rect.top + rect.height * FLAG_ANCHOR_Y_FRAC;
  return (
    <SpriteLoop
      frames={FLAG_FRAMES}
      sequence={FLAG_SEQUENCE}
      fps={FLAG_FPS}
      box={{
        left: anchorX - boxW * FLAG_POLE.x,
        top: anchorY - boxH * FLAG_POLE.y,
        width: boxW,
        height: boxH,
      }}
    />
  );
}

/** The dog's bandana collar — its band pinned to COLLAR_ANCHOR on the neck. */
function Collar({ rect }: { rect: ContainRect }) {
  const boxW = rect.width * COLLAR_BOX_WIDTH_FRAC;
  const boxH = boxW * COLLAR_SLOT_ASPECT;
  const anchorX = rect.left + rect.width * COLLAR_ANCHOR_X_FRAC;
  const anchorY = rect.top + rect.height * COLLAR_ANCHOR_Y_FRAC;
  return (
    <SpriteLoop
      frames={COLLAR_FRAMES}
      sequence={COLLAR_SEQUENCE}
      fps={COLLAR_FPS}
      box={{
        left: anchorX - boxW * COLLAR_POLE.x,
        top: anchorY - boxH * COLLAR_POLE.y,
        width: boxW,
        height: boxH,
      }}
    />
  );
}

/** One wind streak: fades in, drifts left, fades out, rests, repeats. */
function WindGust({ rect, gust }: { rect: ContainRect; gust: GustSpec }) {
  const w = rect.width * gust.widthFrac;
  const h = w * GUST_ASPECT;
  const left = rect.left + rect.width * gust.xFrac - w;
  const top = rect.top + rect.height * gust.yFrac - h / 2;
  const travel = rect.width * gust.travelFrac;

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animated.loop resets progress to 0 before each pass.
    const pass = Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: gust.duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(gust.gap),
    ]);
    const anim = Animated.sequence([Animated.delay(gust.delay), Animated.loop(pass)]);
    anim.start();
    return () => anim.stop();
  }, [progress, gust]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -travel] });
  // Stretch slightly as it gathers, then relax — reads as a gust, not a sticker.
  const scaleX = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.85] });
  const opacity = progress.interpolate({
    inputRange: [0, 0.25, 0.7, 1],
    outputRange: [0, gust.maxOpacity, gust.maxOpacity, 0],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left,
        top,
        width: w,
        height: h,
        opacity,
        transform: [{ translateX }, { scaleX }],
      }}
    >
      <Svg width={w} height={h} viewBox="0 0 120 24">
        <Path
          d={GUST_PATH}
          stroke={WIND_COLOR}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

function FlyingBird({ rect, bird }: { rect: ContainRect; bird: BirdSpec }) {
  const w = rect.width * bird.widthFrac;
  const h = w * BIRD_ASPECT;
  const left = rect.left + rect.width * bird.xFrac - w / 2;
  const top = rect.top + rect.height * bird.yFrac - h / 2;

  const flap = useOscillation(1, 0.3, 240, bird.phase);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left,
        top,
        width: w,
        height: h,
        transform: [{ scaleY: flap }],
      }}
    >
      <Svg width={w} height={h} viewBox="0 0 32 16">
        <Path
          d="M2,10 Q9,2 16,8 Q23,2 30,10"
          stroke="#3A2A22"
          strokeWidth={2.4}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}
