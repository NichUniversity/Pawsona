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

/**
 * Infinite horizontal scroller: renders two copies of the same tileable
 * image back-to-back and slides them together. The instant the lead copy
 * has moved a full tile-width off screen, we snap the offset back to 0 —
 * since the image tiles seamlessly, the snap is invisible.
 */
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
  }, [running, speed, width, direction]);

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