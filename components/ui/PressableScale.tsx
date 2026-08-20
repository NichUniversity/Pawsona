import React, { forwardRef, useRef } from "react";
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";

// Animated.createAnimatedComponent lets a single Pressable's `style` prop
// carry an Animated value — same element, same layout behavior as a plain
// <Pressable>, just with a style that can animate. (Wrapping Pressable in a
// separate Animated.View instead would break anything relying on flex
// sizing, e.g. `flex: 1` tabs in a row, since the size-bearing style and the
// touch target would live on two different elements.)
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** How far the button shrinks on press, as a fraction of its full size. */
  scaleTo?: number;
};

// A drop-in replacement for RN's <Pressable> that adds the classic iOS
// "squish" — it shrinks slightly the instant you touch it, then springs
// back to full size on release, instead of just flipping straight from
// tap to action. Same props as Pressable, so it's a mechanical swap
// everywhere a button used <Pressable>.
export const PressableScale = forwardRef<React.ElementRef<typeof Pressable>, Props>(
  ({ style, scaleTo = 0.94, onPressIn, onPressOut, ...rest }, ref) => {
    const scale = useRef(new Animated.Value(1)).current;

    const animateTo = (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        useNativeDriver: true,
        speed: 40,
        bounciness: 8,
      }).start();
    };

    return (
      <AnimatedPressable
        ref={ref}
        style={[style, { transform: [{ scale }] }]}
        onPressIn={(e: any) => {
          animateTo(scaleTo);
          onPressIn?.(e);
        }}
        onPressOut={(e: any) => {
          animateTo(1);
          onPressOut?.(e);
        }}
        {...rest}
      />
    );
  }
);

PressableScale.displayName = "PressableScale";
