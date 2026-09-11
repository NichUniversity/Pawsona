import React, { useEffect, useRef } from "react";
import { Animated, Image, ImageSourcePropType, StyleSheet, View } from "react-native";

type Props = {
  source: ImageSourcePropType;
  width: number;    // rendered width of ONE tile (must match the image's tileable width)
  height: number;
  speed: number;     // px / second — bigger = scrolls faster (closer to camera)
  running: boolean;  // tie this to your game's "playing" state
  direction?: "left" | "right";
};

/** Infinite horizontal scroller: two tiled copies slide together, snapping back to 0 once the lead copy scrolls fully off screen. */
export function ScrollingLayer({
  source,
  width,
  height,
  speed,
  running,
  direction = "left",
}: Props) {
  const offset = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!running) {
      anim.current?.stop();
      return;
    }

    const duration = (width / speed) * 1000;
    const toValue = direction === "left" ? -width : width;

    const loop = () => {
      offset.setValue(0);
      anim.current = Animated.timing(offset, {
        toValue,
        duration,
        useNativeDriver: true,
      });
      anim.current.start(({ finished }) => {
        if (finished) loop();
      });
    };
    loop();

    return () => anim.current?.stop();
    // `offset` is a stable ref, included only to satisfy exhaustive-deps.
  }, [running, speed, width, direction, offset]);

  return (
    <View style={[styles.clip, { width, height }]}>
      <Animated.View
        style={[
          styles.row,
          { height, transform: [{ translateX: offset }] },
        ]}
      >
        <Image source={source} style={{ width, height }} resizeMode="stretch" />
        <Image source={source} style={{ width, height }} resizeMode="stretch" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    width: "200%",
  },
});