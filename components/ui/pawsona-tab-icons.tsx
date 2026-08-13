import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

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
};

const STROKE = 1.6;

export function PawsonaTabIcon({ name, color, size = 26 }: Props) {
  switch (name) {
    case 'home':
      return <HomeIcon color={color} size={size} />;
    case 'daily-log':
      return <DailyLogIcon color={color} size={size} />;
    case 'minigames':
      return <MinigamesIcon color={color} size={size} />;
    case 'store':
      return <StoreIcon color={color} size={size} />;
    case 'adventure':
      return <AdventureIcon color={color} size={size} />;
    default:
      return null;
  }
}

/* Home — house outline with a paw print inside (reads as "your pet's home") */
function HomeIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11.5 L12 4 L21 11.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.5 10.5 V20 H18.5 V10.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Ellipse cx="12" cy="16.6" rx="2.1" ry="1.7" fill={color} />
      <Circle cx="10" cy="13.6" r="0.95" fill={color} />
      <Circle cx="12" cy="12.5" r="1" fill={color} />
      <Circle cx="14" cy="13.6" r="0.95" fill={color} />
    </Svg>
  );
}

/* Daily Paw Log — notebook with a paw print */
function DailyLogIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="4.5"
        y="3.5"
        width="15"
        height="17"
        rx="2"
        stroke={color}
        strokeWidth={STROKE}
      />
      <Rect x="6.8" y="3.5" width="1.4" height="17" rx="0.7" fill={color} />
      <Circle cx="7.5" cy="7" r="0.85" fill={color} opacity={0.55} />
      <Circle cx="7.5" cy="10.2" r="0.85" fill={color} opacity={0.55} />
      <Circle cx="7.5" cy="13.4" r="0.85" fill={color} opacity={0.55} />

      <Ellipse cx="13.9" cy="15.2" rx="2.5" ry="2" fill={color} />
      <Circle cx="11.5" cy="11.4" r="1.05" fill={color} />
      <Circle cx="13.3" cy="9.9" r="1.1" fill={color} />
      <Circle cx="15.3" cy="9.9" r="1.1" fill={color} />
      <Circle cx="16.9" cy="11.5" r="1.05" fill={color} />
    </Svg>
  );
}

/* Minigames — game controller with a paw accent on the d-pad */
function MinigamesIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 9 H17.5 A3.2 3.2 0 0 1 20.6 12.7 L20.1 16.4 A2 2 0 0 1 16.9 17.9 L15.4 16 H8.6 L7.1 17.9 A2 2 0 0 1 3.9 16.4 L3.4 12.7 A3.2 3.2 0 0 1 6.5 9 Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Ellipse cx="8.3" cy="13.1" rx="1.15" ry="0.9" fill={color} />
      <Circle cx="7.15" cy="11.6" r="0.5" fill={color} />
      <Circle cx="8.3" cy="11.15" r="0.52" fill={color} />
      <Circle cx="9.45" cy="11.6" r="0.5" fill={color} />
      <Circle cx="15.2" cy="11.9" r="0.85" stroke={color} strokeWidth={STROKE * 0.8} />
      <Circle cx="17" cy="13.4" r="0.85" stroke={color} strokeWidth={STROKE * 0.8} />
    </Svg>
  );
}

/* Paw Shop — shopping bag with a paw print */
function StoreIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 8 L7 4.5 A2.3 2.3 0 0 1 9.2 3 H14.8 A2.3 2.3 0 0 1 17 4.5 L18 8"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect
        x="4"
        y="8"
        width="16"
        height="13"
        rx="2"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Ellipse cx="12" cy="16.2" rx="2.5" ry="2" fill={color} />
      <Circle cx="9.5" cy="12.6" r="1.05" fill={color} />
      <Circle cx="11.3" cy="11.1" r="1.1" fill={color} />
      <Circle cx="13.3" cy="11.1" r="1.1" fill={color} />
      <Circle cx="15" cy="12.7" r="1.05" fill={color} />
    </Svg>
  );
}

/* Adventure — winding paw-print trail leading up to a star */
function AdventureIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 20 C6 20 4.5 15.5 7.5 14.5 C10.5 13.5 9.5 9.5 12.5 8.5"
        stroke={color}
        strokeWidth={STROKE * 0.8}
        strokeLinecap="round"
        strokeDasharray="0.1 3.6"
        opacity={0.85}
      />
      <PawPrint cx={4.6} cy={18.4} scale={0.55} color={color} />
      <PawPrint cx={7.4} cy={13.6} scale={0.55} color={color} />
      <Path
        d="M16.3 4.5 L17.6 7.4 L20.7 7.8 L18.5 10 L19 13.1 L16.3 11.5 L13.6 13.1 L14.1 10 L11.9 7.8 L15 7.4 Z"
        fill={color}
      />
    </Svg>
  );
}

function PawPrint({
  cx,
  cy,
  scale,
  color,
}: {
  cx: number;
  cy: number;
  scale: number;
  color: string;
}) {
  return (
    <>
      <Ellipse cx={cx} cy={cy + 1.6 * scale} rx={2.1 * scale} ry={1.7 * scale} fill={color} />
      <Circle cx={cx - 2 * scale} cy={cy - 1.4 * scale} r={0.95 * scale} fill={color} />
      <Circle cx={cx} cy={cy - 2.4 * scale} r={1 * scale} fill={color} />
      <Circle cx={cx + 2 * scale} cy={cy - 1.4 * scale} r={0.95 * scale} fill={color} />
    </>
  );
}