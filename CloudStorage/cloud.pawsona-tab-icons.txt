import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

export type PawsonaIconName =
  | 'home'
  | 'daily-log'
  | 'minigames'
  | 'store'
  | 'adventure';

type Props = {
  name: PawsonaIconName;
  color: string;
  size?: number;
  /** True for the focused tab — lights the icon's own line up with a
   *  neon-tube glow instead of the plain outline used the rest of the time. */
  active?: boolean;
};

const STROKE = 1.6;
// The active icon's line is drawn a little bolder than the resting outline
// so it reads as "lit up" rather than just a color change.
const ACTIVE_STROKE = STROKE * 1.2;

// The glow traces the exact same line the icon is already drawn with, just
// wider and faint, layered a few times with decreasing width and
// increasing opacity — a flat SVG stroke has no built-in blur, so this
// stacked falloff is what stands in for one. It hugs the icon's own shape
// (a neon tube) instead of sitting behind it as a separate blob.
const GLOW_LAYERS: { widthMultiplier: number; opacity: number }[] = [
  { widthMultiplier: 3.5, opacity: 0.05 },
  { widthMultiplier: 2.3, opacity: 0.1 },
  { widthMultiplier: 1.5, opacity: 0.18 },
];

// Simplified, minimal line-art icon set — one clean outline shape per tab
// plus a small solid paw-print badge that ties the set together, so the
// tab bar reads cleanly at small sizes instead of feeling busy. Keeps the
// same {name, color, size} contract so the tab bar's active/inactive
// tinting keeps working unchanged; `active` is new and purely additive —
// omitting it renders exactly as before.
export function PawsonaTabIcon({ name, color, size = 26, active = false }: Props) {
  const iconStroke = active ? ACTIVE_STROKE : STROKE;

  return (
    <View
      style={
        active
          ? [styles.glowShadow, { shadowColor: color }]
          : undefined
      }
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {active &&
          GLOW_LAYERS.map((layer) => (
            <G key={layer.widthMultiplier} opacity={layer.opacity}>
              <IconShapes
                name={name}
                color={color}
                strokeWidth={iconStroke * layer.widthMultiplier}
                skipBadge
              />
            </G>
          ))}
        <IconShapes name={name} color={color} strokeWidth={iconStroke} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // iOS renders a real colored blur here (the SVG has no opaque
  // background, so the shadow follows the icon's own alpha shape). Android
  // ignores shadow* without elevation, so this is a no-op there — the
  // widened glow stroke above is what carries the neon look on that
  // platform.
  glowShadow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
});

function IconShapes({
  name,
  color,
  strokeWidth,
  skipBadge = false,
}: {
  name: PawsonaIconName;
  color: string;
  strokeWidth: number;
  /** The glow pass skips the small solid paw badge — widening its stroke
   *  does nothing (it's filled, not stroked), so drawing it again would
   *  just be a redundant, exactly-overlapping circle stack. */
  skipBadge?: boolean;
}) {
  switch (name) {
    case 'home':
      return <HomeIcon color={color} strokeWidth={strokeWidth} skipBadge={skipBadge} />;
    case 'daily-log':
      return <DailyLogIcon color={color} strokeWidth={strokeWidth} skipBadge={skipBadge} />;
    case 'minigames':
      return <MinigamesIcon color={color} strokeWidth={strokeWidth} skipBadge={skipBadge} />;
    case 'store':
      return <StoreIcon color={color} strokeWidth={strokeWidth} skipBadge={skipBadge} />;
    case 'adventure':
      return <AdventureIcon color={color} strokeWidth={strokeWidth} skipBadge={skipBadge} />;
    default:
      return null;
  }
}

/* Shared small solid paw-print badge used as an accent on every icon. */
function PawGlyph({
  cx,
  cy,
  scale = 1,
  color,
}: {
  cx: number;
  cy: number;
  scale?: number;
  color: string;
}) {
  const s = scale;
  return (
    <>
      <Circle cx={cx - 1.3 * s} cy={cy - 0.85 * s} r={0.55 * s} fill={color} />
      <Circle cx={cx - 0.5 * s} cy={cy - 1.5 * s} r={0.6 * s} fill={color} />
      <Circle cx={cx + 0.5 * s} cy={cy - 1.5 * s} r={0.6 * s} fill={color} />
      <Circle cx={cx + 1.3 * s} cy={cy - 0.85 * s} r={0.55 * s} fill={color} />
      <Ellipse cx={cx} cy={cy + 0.35 * s} rx={1.2 * s} ry={1 * s} fill={color} />
    </>
  );
}

type IconProps = { color: string; strokeWidth: number; skipBadge?: boolean };

/* Home — simple peaked-roof house with a door and a tiny paw badge tucked
   in the gable. */
function HomeIcon({ color, strokeWidth, skipBadge }: IconProps) {
  return (
    <>
      <Path
        d="M4 11 L12 4 L20 11"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x="6" y="11" width="12" height="9" rx="1.4" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Rect x="10.2" y="15.5" width="3.6" height="4.5" rx="1" stroke={color} strokeWidth={strokeWidth * 0.85} strokeLinejoin="round" />
      {!skipBadge && <PawGlyph cx={12} cy={8.6} scale={0.55} color={color} />}
    </>
  );
}

/* Daily Paw Log — closed journal with a spine fold and a paw badge on the
   cover. */
function DailyLogIcon({ color, strokeWidth, skipBadge }: IconProps) {
  return (
    <>
      <Rect x="6.5" y="4" width="13" height="17" rx="2.3" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M9.3 4.5 V20.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {!skipBadge && <PawGlyph cx={14.6} cy={12.6} scale={1.05} color={color} />}
    </>
  );
}

/* Pet Minigames — rounded controller silhouette with a paw badge where the
   buttons would be. */
function MinigamesIcon({ color, strokeWidth, skipBadge }: IconProps) {
  return (
    <>
      <Path
        d="M6.5 9.6 H17.5 A3.2 3.2 0 0 1 20.6 13.3 L20.1 17 A2 2 0 0 1 16.9 18.5 L15.4 16.6 H8.6 L7.1 18.5 A2 2 0 0 1 3.9 17 L3.4 13.3 A3.2 3.2 0 0 1 6.5 9.6 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {!skipBadge && <PawGlyph cx={12} cy={14} scale={0.6} color={color} />}
    </>
  );
}

/* Pet Store — simple shopping bag with a looped handle and a paw badge on
   the front. */
function StoreIcon({ color, strokeWidth, skipBadge }: IconProps) {
  return (
    <>
      <Path
        d="M5.5 9 L7 20 H17 L18.5 9 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path d="M9 9 V6.6 A3 3 0 0 1 15 6.6 V9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {!skipBadge && <PawGlyph cx={12} cy={14.4} scale={0.75} color={color} />}
    </>
  );
}

/* Adventure — simple map pin with a paw badge marking the destination. */
function AdventureIcon({ color, strokeWidth, skipBadge }: IconProps) {
  return (
    <>
      <Path
        d="M12 3 A6.3 6.3 0 0 1 18.3 9.3 C18.3 14.2 12 21 12 21 C12 21 5.7 14.2 5.7 9.3 A6.3 6.3 0 0 1 12 3 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {!skipBadge && <PawGlyph cx={12} cy={9.6} scale={0.75} color={color} />}
    </>
  );
}
