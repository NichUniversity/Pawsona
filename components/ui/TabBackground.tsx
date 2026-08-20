import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { useTheme } from "../../context/ThemeContext";

// Shared tab background, theme-reactive: a 3-stop vertical gradient plus a
// faint top-left sheen so it never reads as a completely flat wash. Colors
// come from the active ThemeContext theme (see context/ThemeContext.tsx) —
// deep near-black for Dark (the original Instagram-style look), soft tinted
// washes for White/Orange/Blue/Purple. Built with react-native-svg (already
// a dependency) instead of a raster image, so it's easy to retune per-theme
// in one place.
//
// Replaces the old pawprintbackground*.png images on Home, Minigames,
// Store, and Adventure's default state. Daily Paw Log uses this too, but
// only before a pet is selected — once a pet is chosen it switches to the
// wood/parchment almanac look instead (see daily_log_tab.tsx), which is a
// deliberately distinct "storybook" identity left independent of the app
// theme, same as the Origin Story wizard.

export function TabBackground() {
  const { theme } = useTheme();
  const { top, mid, bottom, sheenColor, sheenOpacity } = theme.background;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="tabFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.55" stopColor={mid} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>

          <RadialGradient id="tabSheen" cx="25%" cy="0%" rx="75%" ry="55%">
            <Stop offset="0" stopColor={sheenColor} stopOpacity={sheenOpacity} />
            <Stop offset="1" stopColor={sheenColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabFade)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabSheen)" />
      </Svg>
    </View>
  );
}
