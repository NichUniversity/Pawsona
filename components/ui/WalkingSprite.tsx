import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";

import { WALK_ANIMATIONS } from "../../data/walkAnimations";

type Props = {
  /** Ordered sequence of transparent-PNG frames to loop through. */
  frames: ImageSourcePropType[];
  /** Height/width of the sprite box in px (frames are roughly square). Default 96. */
  size?: number;
  /** Playback speed in frames per second. Default 5. */
  fps?: number;
  /** Loop forever (default) or stop after one pass through `frames`. */
  loop?: boolean;
  /** Source art faces right by default; pass "left" to mirror it. */
  facing?: "right" | "left";
  style?: StyleProp<ViewStyle>;
};

/** Plays a looping sprite animation (e.g. a pet's walk cycle) by swapping through crisp PNG frames, with a gentle bob for fluid motion. */
export function WalkingSprite({
  frames,
  size = 96,
  fps = 5,
  loop = true,
  facing = "right",
  style,
}: Props) {
  const [frameIndex, setFrameIndex] = useState(0);
  const indexRef = useRef(0);
  const bobY = useRef(new Animated.Value(0)).current;
  const swayX = useRef(new Animated.Value(0)).current;

  // Crisp, drift-free frame stepping via rAF instead of setInterval.
  useEffect(() => {
    indexRef.current = 0;
    setFrameIndex(0);
    if (frames.length <= 1) return;

    const frameDuration = 1000 / fps;
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

        let next = indexRef.current + steps;
        if (next >= frames.length) {
          if (!loop) {
            indexRef.current = frames.length - 1;
            setFrameIndex(indexRef.current);
            return; // freeze on the last frame, stop scheduling
          }
          next %= frames.length;
        }
        indexRef.current = next;
        setFrameIndex(next);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, [frames, fps, loop]);

  // Continuous bob + sway timed to the walk cycle (bob at 2x sway's rate) so the gait reads as natural, not robotic.
  useEffect(() => {
    if (frames.length <= 1) return;
    const cycleDuration = (1000 / fps) * frames.length;
    const quarter = cycleDuration / 4;
    const bounceEasing = Easing.inOut(Easing.sin);

    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(bobY, { toValue: -1.5, duration: quarter, easing: bounceEasing, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: 0, duration: quarter, easing: bounceEasing, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: -1.5, duration: quarter, easing: bounceEasing, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: 0, duration: quarter, easing: bounceEasing, useNativeDriver: true }),
      ])
    );

    const sway = Animated.loop(
      Animated.sequence([
        Animated.timing(swayX, { toValue: 0.8, duration: quarter, easing: bounceEasing, useNativeDriver: true }),
        Animated.timing(swayX, { toValue: 0, duration: quarter, easing: bounceEasing, useNativeDriver: true }),
        Animated.timing(swayX, { toValue: -0.8, duration: quarter, easing: bounceEasing, useNativeDriver: true }),
        Animated.timing(swayX, { toValue: 0, duration: quarter, easing: bounceEasing, useNativeDriver: true }),
      ])
    );

    bob.start();
    sway.start();
    return () => {
      bob.stop();
      sway.stop();
    };
  }, [frames, fps, bobY, swayX]);

  if (frames.length === 0) return null;

  return (
    <View
      style={[
        { width: size, height: size, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <Animated.View
        style={{
          width: "100%",
          height: "100%",
          transform: [{ translateY: bobY }, { translateX: swayX }],
        }}
      >
        <Image
          source={frames[frameIndex]}
          style={{
            width: "100%",
            height: "100%",
            transform: facing === "left" ? [{ scaleX: -1 }] : undefined,
          }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

type PetWalkProps = Omit<Props, "frames">;

/** Convenience preset: the Golden Retriever's walk cycle, ready to drop in. */
export function GoldenRetrieverWalk(props: PetWalkProps) {
  return (
    <WalkingSprite frames={WALK_ANIMATIONS["golden-retriever-myavatar"]} {...props} />
  );
}
