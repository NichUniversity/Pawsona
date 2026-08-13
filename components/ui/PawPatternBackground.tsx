import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Pattern, Rect } from 'react-native-svg';

type Props = {
  /** Solid backdrop color behind the paw print tiles. */
  backgroundColor: string;
  /** Color of the paw print tiles themselves. */
  patternColor?: string;
  /** Opacity of the paw print tiles (0-1). Keep low so content stays readable. */
  patternOpacity?: number;
  /** Size in px of one repeat of the pattern (paw-to-paw spacing). */
  tileSize?: number;
};

/**
 * Full-bleed solid-color background with a diagonal repeating paw print
 * pattern on top, built from a single SVG <Pattern> so it costs one draw
 * call regardless of screen size. Meant to sit as the first/bottom-most
 * child of a screen, behind a transparent ScrollView.
 */
export function PawPatternBackground({
  backgroundColor,
  patternColor = '#FFFFFF',
  patternOpacity = 0.16,
  tileSize = 130,
}: Props) {
  const patternId = `pawTile-${backgroundColor.replace('#', '')}`;

  return (
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={tileSize}
          height={tileSize}
          patternTransform="rotate(45)"
        >
          <PawPrint
            cx={tileSize * 0.5}
            cy={tileSize * 0.5}
            scale={(tileSize / 64) * 1.6}
            color={patternColor}
            opacity={patternOpacity}
          />
        </Pattern>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

function PawPrint({
  cx,
  cy,
  scale,
  color,
  opacity,
}: {
  cx: number;
  cy: number;
  scale: number;
  color: string;
  opacity: number;
}) {
  return (
    <>
      <Ellipse cx={cx} cy={cy + 5 * scale} rx={6.5 * scale} ry={5.2 * scale} fill={color} opacity={opacity} />
      <Circle cx={cx - 6 * scale} cy={cy - 4 * scale} r={2.9 * scale} fill={color} opacity={opacity} />
      <Circle cx={cx - 1.5 * scale} cy={cy - 7 * scale} r={3.1 * scale} fill={color} opacity={opacity} />
      <Circle cx={cx + 4 * scale} cy={cy - 6.4 * scale} r={3 * scale} fill={color} opacity={opacity} />
      <Circle cx={cx + 7.5 * scale} cy={cy - 2 * scale} r={2.7 * scale} fill={color} opacity={opacity} />
    </>
  );
}