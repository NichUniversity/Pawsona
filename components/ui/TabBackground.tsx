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

// Shared theme-reactive tab background: a 3-stop gradient plus a faint sheen, built with react-native-svg. Used on Home, Minigames, Store, Adventure, and Daily Paw Log (until a pet is selected, which switches to its own wood/parchment look).

export function TabBackground() {
  const { theme } = useTheme();
  const { top, mid, bottom, sheenColor, sheenOpacity } = theme.background;

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
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
