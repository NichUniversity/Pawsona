import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ImageSourcePropType,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";

type Props = {
  /** Transparent-PNG frames, all on the same canvas size (see data/idleAnimations.ts). */
  frames: ImageSourcePropType[];
  /**
   * Play order as indexes into `frames` (loops back to the start). Defaults to 0..n-1. Lets a
   * sheet whose drawing order jumps between poses be played in its smoothest order instead.
   */
  sequence?: number[];
  /** How long each pose holds fully on screen, in ms. Default 300. */
  holdMs?: number;
  /** Cross-fade time from one pose into the next, in ms. Default 380. */
  fadeMs?: number;
  /**
   * Frame canvas width / height. When given, the art is drawn full-width at that aspect and
   * pinned to the bottom of the box (paws on the box's bottom edge) instead of letterboxed.
   */
  aspect?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Loops a pet's idle animation in place. Smoothness comes from three things:
 *  - cross-fading: the next pose fades in ON TOP of the current one (which stays fully opaque
 *    underneath until the fade finishes), so poses blend instead of snapping, and the body never
 *    turns see-through mid-fade the way two half-opacity frames would;
 *  - a relaxed pace (hold + fade ≈ 0.7s per pose by default, ~11s for a 16-frame loop);
 *  - a gentle "breathing" rise and fall, scaled from the feet so the paws stay planted.
 * Every frame stays mounted (stacked) so nothing has to decode mid-animation — swapping one
 * Image's `source` instead would flash blank, especially on web.
 */
export function IdleSprite({ frames, sequence, holdMs = 300, fadeMs = 380, aspect, style }: Props) {
  const order = sequence && sequence.length > 0 ? sequence : frames.map((_, i) => i);

  // One opacity per frame. `base` is the pose fully showing underneath; `top` fades in over it.
  const opacities = useRef(frames.map((_, i) => new Animated.Value(i === order[0] ? 1 : 0))).current;
  const [layer, setLayer] = useState({ base: order[0], top: -1 });
  const breath = useRef(new Animated.Value(0)).current;
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (order.length <= 1) return;
    let step = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    opacities.forEach((o, i) => o.setValue(i === order[0] ? 1 : 0));
    setLayer({ base: order[0], top: -1 });

    const advance = () => {
      if (cancelled) return;
      const from = order[step % order.length];
      const to = order[(step + 1) % order.length];
      setLayer({ base: from, top: to });
      opacities[to].setValue(0);
      Animated.timing(opacities[to], {
        toValue: 1,
        duration: fadeMs,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (cancelled || !finished) return;
        opacities[from].setValue(0);
        setLayer({ base: to, top: -1 });
        step += 1;
        timer = setTimeout(advance, holdMs);
      });
    };

    timer = setTimeout(advance, holdMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      opacities.forEach((o) => o.stopAnimation());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, order.join(","), holdMs, fadeMs]);

  // Slow breathing: ~3.6s in/out, a barely-there 0.8% rise (kept tiny so it never reads as the
  // dog changing size).
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  if (frames.length === 0) return null;

  // scaleY about the box center would lift the feet; shift down by half the growth so the
  // bottom edge (paws) stays put.
  const scaleY = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.008] });
  const artHeight = aspect ? box.width / aspect : box.height;
  const translateY = breath.interpolate({ inputRange: [0, 1], outputRange: [0, -(artHeight * 0.008) / 2] });

  return (
    <View
      style={[{ width: "100%", height: "100%" }, style]}
      pointerEvents="none"
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <Animated.View
        style={[
          aspect
            ? { position: "absolute", left: 0, right: 0, bottom: 0, aspectRatio: aspect }
            : { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
          { transform: [{ translateY }, { scaleY }] },
        ]}
      >
        {frames.map((frame, i) => (
          <Animated.Image
            key={i}
            source={frame}
            resizeMode="contain"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              opacity: opacities[i],
              // The fading-in pose sits above the base pose.
              zIndex: i === layer.top ? 2 : i === layer.base ? 1 : 0,
            }}
          />
        ))}
      </Animated.View>
    </View>
  );
}
