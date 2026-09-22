import React, { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useIsFocused } from "expo-router";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Ellipse, G, Rect, Path } from "react-native-svg";

// Decorative animated wallpaper for the Paw Shop tab: alternating paw-print
// and shopping-bag glyphs arranged on a diagonal grid, drifting slowly in an
// endless diagonal loop. Rendered as a translucent layer on top of
// TabBackground, so it never affects the legibility of the theme-driven text
// that sits above it — only the two icon colors are configurable.
//
// The animation runs only while this tab is focused (paused via
// useIsFocused + cancelAnimation), so it costs nothing on the other tabs.

const TILE = 110; // px between repeats of the paw/bag motif
const LOOP_DURATION = 15000; // ms for one full diagonal drift cycle
const PAW_OPACITY = 0.16;
const BAG_OPACITY = 0.22;

type Props = {
  /** Color for one of the two shopping-bag glyphs. Defaults to the Paw Shop accent green. */
  accentColor?: string;
  /** Color for the other shopping-bag glyph. Defaults to the app's gold coin tone. */
  goldColor?: string;
};

type GlyphKind = "paw" | "bagAccent" | "bagGold";

type Glyph = {
  x: number;
  y: number;
  kind: GlyphKind;
  rotation: number;
};

function buildGlyphs(
  width: number,
  height: number
): { glyphs: Glyph[]; gridWidth: number; gridHeight: number } {
  // One extra tile of buffer on every side keeps the grid fully covering the
  // screen throughout the [-TILE, 0] translation range the loop animates
  // through, so the wrap-around reset is invisible.
  const cols = Math.ceil(width / TILE) + 3;
  const rows = Math.ceil(height / TILE) + 3;
  const glyphs: Glyph[] = [];

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const baseX = col * TILE;
      const baseY = row * TILE;
      const evenCell = (row + col) % 2 === 0;

      // Paws sit on one diagonal, bags on the other; the bag color
      // alternates by checkerboard parity so both accent tones read as
      // their own diagonal streak, echoing the reference wallpaper.
      glyphs.push({
        x: baseX + TILE * 0.28,
        y: baseY + TILE * 0.28,
        kind: "paw",
        rotation: evenCell ? -18 : 16,
      });
      glyphs.push({
        x: baseX + TILE * 0.76,
        y: baseY + TILE * 0.76,
        kind: evenCell ? "bagAccent" : "bagGold",
        rotation: evenCell ? 10 : -12,
      });
    }
  }

  return {
    glyphs,
    gridWidth: (cols + 1) * TILE,
    gridHeight: (rows + 1) * TILE,
  };
}

function PawGlyph({ color }: { color: string }) {
  return (
    <G>
      <Ellipse cx={0} cy={9} rx={10} ry={8} fill={color} />
      <Ellipse
        cx={-11}
        cy={-5}
        rx={4.7}
        ry={6}
        transform="rotate(-24 -11 -5)"
        fill={color}
      />
      <Ellipse cx={-3.6} cy={-11.7} rx={4.7} ry={6.5} fill={color} />
      <Ellipse cx={4.7} cy={-11.7} rx={4.7} ry={6.5} fill={color} />
      <Ellipse
        cx={11.7}
        cy={-5}
        rx={4.7}
        ry={6}
        transform="rotate(24 11.7 -5)"
        fill={color}
      />
    </G>
  );
}

function BagGlyph({ color }: { color: string }) {
  return (
    <G>
      <Path
        d="M-8 -8 C-8 -17 8 -17 8 -8"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <Rect x={-13} y={-8} width={26} height={25} rx={4} fill={color} />
    </G>
  );
}

export function StoreDiagonalPattern({
  accentColor = "#2E9E5B",
  goldColor = "#D9A441",
}: Props) {
  const { width, height } = useWindowDimensions();
  const isFocused = useIsFocused();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isFocused) {
      progress.value = withRepeat(
        withTiming(1, { duration: LOOP_DURATION, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(progress);
    }
    return () => cancelAnimation(progress);
  }, [isFocused, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const shift = progress.value * TILE;
    return {
      transform: [{ translateX: shift - TILE }, { translateY: shift - TILE }],
    };
  });

  const { glyphs, gridWidth, gridHeight } = useMemo(
    () => buildGlyphs(width, height),
    [width, height]
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <Animated.View
        style={[{ width: gridWidth, height: gridHeight }, animatedStyle]}
      >
        <Svg width={gridWidth} height={gridHeight}>
          {glyphs.map((glyph, index) => {
            const color =
              glyph.kind === "paw"
                ? "#FFFFFF"
                : glyph.kind === "bagAccent"
                ? accentColor
                : goldColor;
            const opacity = glyph.kind === "paw" ? PAW_OPACITY : BAG_OPACITY;

            return (
              <G
                key={index}
                transform={`translate(${glyph.x}, ${glyph.y}) rotate(${glyph.rotation})`}
                opacity={opacity}
              >
                {glyph.kind === "paw" ? (
                  <PawGlyph color={color} />
                ) : (
                  <BagGlyph color={color} />
                )}
              </G>
            );
          })}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
});
