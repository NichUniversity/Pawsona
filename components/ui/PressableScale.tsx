import React, { forwardRef, useRef } from "react";
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";

import { useSettings } from "../../context/SettingsContext";

// Lets Pressable's own `style` prop animate, so flex sizing (e.g. `flex: 1` tabs) still works.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** How far the button shrinks on press, as a fraction of its full size. */
  scaleTo?: number;
};

// Drop-in <Pressable> replacement that adds an iOS-style press "squish" animation.
export const PressableScale = forwardRef<React.ElementRef<typeof Pressable>, Props>(
  ({ style, scaleTo = 0.94, onPressIn, onPressOut, ...rest }, ref) => {
    const scale = useRef(new Animated.Value(1)).current;
    const { triggerHaptic } = useSettings();

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
          // Haptic fires on press-down, not release, to feel responsive.
          triggerHaptic();
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
