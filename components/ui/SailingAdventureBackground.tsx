import React, { useEffect, useRef, useState } from "react";
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
// is a hand-drawn 6-frame sprite cycle (see FlagCloth below) played the same
// way WalkingSprite plays a pet's walk cycle.
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

// --- Flag: a 6-frame hand-drawn flap cycle (assets/animations/flag_wave_0..5
// .png), not a shape we transform ourselves — the art already supplies the
// waving motion. Each frame is a tall, mostly-transparent canvas (362x724)
// with the flag drawn in the lower-middle, giving the cloth room to swing
// without ever getting clipped; the pole edge sits close to the frame's
// right side and is already oriented flowing left, matching this scene's
// wind direction, so no mirroring is needed.
//
// The pole edge isn't at the exact same spot in every frame — the whole flag
// rocks a few pixels frame to frame, not just the tail (natural secondary
// motion in the source art, not a bug). Anchoring to one averaged position
// made that rocking read as the flag drifting loose from the mast instead of
// flapping on it, so FLAG_POLE_FRACS gives each frame's own measured pole
// point instead, and FlagCloth repositions the box per frame so that point
// always lands exactly on FLAG_ANCHOR_X/Y_FRAC — the fixed spot on the mast.
const FLAG_FRAMES = [
  require("../../assets/animations/flag_wave_0.png"),
  require("../../assets/animations/flag_wave_1.png"),
  require("../../assets/animations/flag_wave_2.png"),
  require("../../assets/animations/flag_wave_3.png"),
  require("../../assets/animations/flag_wave_4.png"),
  require("../../assets/animations/flag_wave_5.png"),
];
const FLAG_SLOT_ASPECT = 724 / 362;
// Measured per-frame pole position, as a fraction of each frame's own 362x724 canvas.
const FLAG_POLE_FRACS = [
  { x: 0.9641, y: 0.5359 },
  { x: 0.9641, y: 0.5028 },
  { x: 0.9392, y: 0.5256 },
  { x: 0.9475, y: 0.5166 },
  { x: 0.9254, y: 0.5035 },
  { x: 0.9088, y: 0.5311 },
];
const FLAG_ANCHOR_X_FRAC = 0.4017;
const FLAG_ANCHOR_Y_FRAC = 0.2414;
const FLAG_BOX_WIDTH_FRAC = 0.175;
const FLAG_FPS = 3;

// --- Collar: a 6-frame hand-drawn flap cycle (assets/animations/collar_wave_0..5
// .png), the same kind of asset and the same technique as the flag above — a
// knotted bandana collar with a trailing tail that catches the wind, where the
// art already supplies the flowing motion instead of us transforming a shape.
// Each frame is a tall, mostly-transparent 362x724 canvas with the collar's
// ring/knot on the right and the tail trailing left, oriented flowing with
// this scene's wind (no mirroring needed, same as the flag).
//
// As with the flag, the ring isn't pixel-identical across frames — it rocks
// slightly along with the tail's flap cycle — so COLLAR_POLE_FRACS gives each
// frame's own measured ring/knot position (the rivet ball on the ring, found
// by scanning in from the right edge for the first column whose vertical
// content run exceeds 40px) and Collar repositions the box per frame so that
// point always lands on COLLAR_ANCHOR_X/Y_FRAC — the fixed spot on the neck.
// Anchor position and scale were tuned by compositing test frames directly
// onto assets/backgrounds/adventure_sailing_sunset.png until the ring's dark
// opening sat right at the dog's neck at a believable size.
const COLLAR_FRAMES = [
  require("../../assets/animations/collar_wave_0.png"),
  require("../../assets/animations/collar_wave_1.png"),
  require("../../assets/animations/collar_wave_2.png"),
  require("../../assets/animations/collar_wave_3.png"),
  require("../../assets/animations/collar_wave_4.png"),
  require("../../assets/animations/collar_wave_5.png"),
];
const COLLAR_SLOT_ASPECT = 724 / 362;
// Measured per-frame ring/knot position, as a fraction of each frame's own 362x724 canvas.
const COLLAR_POLE_FRACS = [
  { x: 0.9972, y: 0.471 },
  { x: 0.9365, y: 0.4696 },
  { x: 0.9227, y: 0.4682 },
  { x: 0.884, y: 0.4675 },
  { x: 0.8702, y: 0.4675 },
  { x: 0.8812, y: 0.4675 },
];
const COLLAR_ANCHOR_X_FRAC = 0.43;
const COLLAR_ANCHOR_Y_FRAC = 0.585;
const COLLAR_BOX_WIDTH_FRAC = 0.2;
// A touch faster than the flag — this is loose fabric, not canvas.
const COLLAR_FPS = 3.5;

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
 * Plays the flag's 6-frame flap cycle via requestAnimationFrame — the same
 * crisp, drift-free stepping technique WalkingSprite uses, just without its
 * body bob/sway (that's tuned for a walking gait and belongs to pet avatars,
 * per WalkingSprite's own doc comment; this flag's motion already comes
 * entirely from the art itself).
 *
 * Played as a forward-then-backward "ping-pong" (0,1,2,3,4,5,4,3,2,1,0,...)
 * rather than wrapping straight back to frame 0. The source art is a single
 * calm-to-windswept-to-calm sweep, so a hard wrap briefly showed two similar
 * calm frames back to back at the loop seam (5 then 0), which read as the
 * flag pausing for a beat. Reversing direction at each end instead means the
 * frame never repeats itself, so the motion never visibly stalls.
 */
function FlagCloth({ rect }: { rect: ContainRect }) {
  const boxW = rect.width * FLAG_BOX_WIDTH_FRAC;
  const boxH = boxW * FLAG_SLOT_ASPECT;
  const anchorX = rect.left + rect.width * FLAG_ANCHOR_X_FRAC;
  const anchorY = rect.top + rect.height * FLAG_ANCHOR_Y_FRAC;

  const [frameIndex, setFrameIndex] = useState(0);
  // The just-previous frame, kept on-screen at full opacity underneath while
  // the new frame fades in on top of it (see the fade effect below) — this is
  // what makes consecutive frames cross-dissolve instead of cutting instantly.
  const prevFrameIndexRef = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;

  // Each frame's own pole point, so the box shifts slightly per frame and the
  // pole always lands exactly on (anchorX, anchorY) — see the comment above
  // FLAG_POLE_FRACS for why this can't just be one fixed offset.
  const pole = FLAG_POLE_FRACS[frameIndex];
  const left = anchorX - boxW * pole.x;
  const top = anchorY - boxH * pole.y;

  useEffect(() => {
    const frameDuration = 1000 / FLAG_FPS;
    const frameCount = FLAG_FRAMES.length;
    // Ping-pong period: 0,1,2,3,4,5,4,3,2,1,(0,...) — each end frame is a
    // single beat, not held for two, so the direction reverses cleanly.
    const period = 2 * (frameCount - 1);
    let rafId: number;
    let lastTime: number | null = null;
    let step = 0;
    let currentIndex = 0;
    let stopped = false;

    const tick = (time: number) => {
      if (stopped) return;
      if (lastTime === null) lastTime = time;
      const elapsed = time - lastTime;

      if (elapsed >= frameDuration) {
        const advance = Math.floor(elapsed / frameDuration);
        lastTime += advance * frameDuration;
        step = (step + advance) % period;
        const index = step < frameCount ? step : period - step;
        // Recorded synchronously here (not in a render/effect keyed off
        // frameIndex) so it's always one step ahead of the state update below
        // and never lags a frame behind what's about to render.
        prevFrameIndexRef.current = currentIndex;
        currentIndex = index;
        setFrameIndex(index);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Cross-fade into the new frame: snap the fade to 0 the instant frameIndex
  // changes (the previous-frame layer below is still opaque underneath at
  // that point, so nothing flashes), then animate it up to 1 over a chunk of
  // the frame's own hold time — short enough to fully settle before the next
  // frame swap starts, so it reads as a smooth blend rather than a held cross-fade.
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: Math.min(180, (1000 / FLAG_FPS) * 0.6),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [frameIndex, fade]);

  return (
    <View style={{ position: "absolute", left, top, width: boxW, height: boxH }}>
      <Image
        source={FLAG_FRAMES[prevFrameIndexRef.current]}
        style={{ position: "absolute", width: "100%", height: "100%" }}
        resizeMode="contain"
      />
      <Animated.Image
        source={FLAG_FRAMES[frameIndex]}
        style={{ position: "absolute", width: "100%", height: "100%", opacity: fade }}
        resizeMode="contain"
      />
    </View>
  );
}

/**
 * Plays the collar's 6-frame flap cycle exactly like FlagCloth above — same
 * rAF stepping, same per-frame anchor repositioning, same ping-pong playback
 * (0,1,2,3,4,5,4,3,2,1,0,...) so the loop never stalls at the seam between a
 * calm end frame and a hard-wrapped start frame.
 */
function Collar({ rect }: { rect: ContainRect }) {
  const boxW = rect.width * COLLAR_BOX_WIDTH_FRAC;
  const boxH = boxW * COLLAR_SLOT_ASPECT;
  const anchorX = rect.left + rect.width * COLLAR_ANCHOR_X_FRAC;
  const anchorY = rect.top + rect.height * COLLAR_ANCHOR_Y_FRAC;

  const [frameIndex, setFrameIndex] = useState(0);
  // Same cross-fade technique as FlagCloth above — see its comments for why.
  const prevFrameIndexRef = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;

  const pole = COLLAR_POLE_FRACS[frameIndex];
  const left = anchorX - boxW * pole.x;
  const top = anchorY - boxH * pole.y;

  useEffect(() => {
    const frameDuration = 1000 / COLLAR_FPS;
    const frameCount = COLLAR_FRAMES.length;
    const period = 2 * (frameCount - 1);
    let rafId: number;
    let lastTime: number | null = null;
    let step = 0;
    let currentIndex = 0;
    let stopped = false;

    const tick = (time: number) => {
      if (stopped) return;
      if (lastTime === null) lastTime = time;
      const elapsed = time - lastTime;

      if (elapsed >= frameDuration) {
        const advance = Math.floor(elapsed / frameDuration);
        lastTime += advance * frameDuration;
        step = (step + advance) % period;
        const index = step < frameCount ? step : period - step;
        prevFrameIndexRef.current = currentIndex;
        currentIndex = index;
        setFrameIndex(index);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: Math.min(180, (1000 / COLLAR_FPS) * 0.6),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [frameIndex, fade]);

  return (
    <View style={{ position: "absolute", left, top, width: boxW, height: boxH }}>
      <Image
        source={COLLAR_FRAMES[prevFrameIndexRef.current]}
        style={{ position: "absolute", width: "100%", height: "100%" }}
        resizeMode="contain"
      />
      <Animated.Image
        source={COLLAR_FRAMES[frameIndex]}
        style={{ position: "absolute", width: "100%", height: "100%", opacity: fade }}
        resizeMode="contain"
      />
    </View>
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
