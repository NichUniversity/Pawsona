import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

// Shared deep-black tab background (same idea as Instagram/Snapchat's dark
// theme): near-black at the top fading to true black, plus a faint
// top-left highlight so it doesn't read as a completely flat void. Built
// with react-native-svg (already a dependency — no new package needed)
// instead of a raster image, so it's easy to retune here in one place.
//
// Replaces the old pawprintbackground*.png images on Home, Minigames,
// Store, and Adventure's default state. Daily Paw Log uses this too, but
// only before a pet is selected — once a pet is chosen it switches to
// full-bleed wood-dark instead (see daily_log_tab.tsx), so the almanac
// never shows this background.

const GREY_HI = "#1C1C1E";
const GREY_MID = "#0D0D0D";
const GREY_LOW = "#000000";

export function TabBackground() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="tabFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={GREY_HI} />
            <Stop offset="0.55" stopColor={GREY_MID} />
            <Stop offset="1" stopColor={GREY_LOW} />
          </LinearGradient>

          <RadialGradient id="tabSheen" cx="25%" cy="0%" rx="75%" ry="55%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabFade)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabSheen)" />
      </Svg>
    </View>
  );
}
