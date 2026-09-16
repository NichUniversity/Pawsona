import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type Props = {
  /** Top of the band fireflies should drift within, in px (usually just above the room floor). */
  bandTop: number;
  /** Height of that band, in px. */
  bandHeight: number;
  /** How many fireflies to render. Kept small — this is ambient texture, not a light show. */
  count?: number;
};

const FIREFLY_COLOR = "rgba(255, 221, 130, 0.95)";
const GLOW_COLOR = "rgba(255, 200, 120, 0.16)";

/**
 * Ambient "living menu" texture for the Home tab room: a few soft fireflies drifting
 * and pulsing, plus one slow ambient glow. Deliberately drawn with plain Views/shadows
 * instead of new PNG/SVG art — there's no leaf/firefly art in assets/ yet, and this reads
 * fine without it. Built on RN's built-in Animated API (not Reanimated) to match
 * WalkingSprite/PetRoomBackground/ScrollingLayer, which all use the same API already.
 */
export function AmbientEffects({ bandTop, bandHeight, count = 3 }: Props) {
  if (bandHeight <= 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <AmbientGlow top={bandTop + bandHeight * 0.35} />
      {Array.from({ length: count }, (_, i) => (
        <Firefly key={i} seed={i} count={count} bandTop={bandTop} bandHeight={bandHeight} />
      ))}
    </View>
  );
}

function useLoop(initial: number, to: number, duration: number, delay = 0) {
  const value = useRef(new Animated.Value(initial)).current;

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
          toValue: initial,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
    // Deliberately only re-run if the shape of the loop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, to, duration, delay]);

  return value;
}

function Firefly({
  seed,
  count,
  bandTop,
  bandHeight,
}: {
  seed: number;
  count: number;
  bandTop: number;
  bandHeight: number;
}) {
  // Spread fireflies evenly left-to-right, each with its own drift distance/speed/phase
  // so the loop doesn't read as three copies of one animation.
  const leftPercent = 14 + (seed * 72) / Math.max(1, count - 1 || 1);
  const top = bandTop + bandHeight * (0.2 + (seed % 3) * 0.28);

  const driftX = useLoop(0, 16 + seed * 6, 3400 + seed * 500);
  const driftY = useLoop(0, seed % 2 === 0 ? 10 : -10, 2600 + seed * 420, seed * 180);
  const opacity = useLoop(0.15, 0.85, 1300 + seed * 260, seed * 240);

  return (
    <Animated.View
      style={[
        styles.firefly,
        {
          left: `${leftPercent}%`,
          top,
          opacity,
          transform: [{ translateX: driftX }, { translateY: driftY }],
        },
      ]}
    />
  );
}

/** One slow, wide pulse of warm light behind the fireflies — cheap atmosphere, no art required. */
function AmbientGlow({ top }: { top: number }) {
  const opacity = useLoop(0.4, 1, 2600);

  return (
    <Animated.View
      style={[styles.glow, { top, opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  firefly: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: FIREFLY_COLOR,
    shadowColor: FIREFLY_COLOR,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  glow: {
    position: "absolute",
    left: "20%",
    width: "60%",
    height: 90,
    borderRadius: 90,
    backgroundColor: GLOW_COLOR,
  },
});
