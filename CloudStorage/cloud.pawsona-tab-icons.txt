import React from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

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

/* Home — dog house */
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
      <Path
        d="M9.5 20 V15.5 A2.5 2.5 0 0 1 14.5 15.5 V20"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="4" r="1" fill={color} />
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
      <Line
        x1="7.5"
        y1="3.5"
        x2="7.5"
        y2="20.5"
        stroke={color}
        strokeWidth={STROKE * 0.75}
      />
      <Circle cx="7.5" cy="6.5" r="0.9" fill={color} />
      <Circle cx="7.5" cy="10" r="0.9" fill={color} />
      <Circle cx="7.5" cy="13.5" r="0.9" fill={color} />
      <Circle cx="7.5" cy="17" r="0.9" fill={color} />

      {/* paw pad */}
      <Ellipse cx="13.8" cy="15.3" rx="2.3" ry="1.8" fill={color} />
      {/* toes */}
      <Circle cx="11.6" cy="11.9" r="1" fill={color} />
      <Circle cx="13.2" cy="10.6" r="1.05" fill={color} />
      <Circle cx="15" cy="10.6" r="1.05" fill={color} />
      <Circle cx="16.4" cy="12" r="1" fill={color} />
    </Svg>
  );
}

/* Minigames — arcade joystick */
function MinigamesIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="6.5"
        y="15.5"
        width="11"
        height="5"
        rx="2"
        stroke={color}
        strokeWidth={STROKE}
      />
      <Line
        x1="12"
        y1="15.5"
        x2="12"
        y2="7.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Circle cx="12" cy="5.5" r="2.6" fill={color} />
      <Circle cx="15.3" cy="18" r="1" fill={color} />
    </Svg>
  );
}

/* Paw Shop — storefront with a paw-print sign */
function StoreIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10 L5 6 H19 L21 10 Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Rect
        x="4"
        y="10"
        width="16"
        height="10"
        stroke={color}
        strokeWidth={STROKE}
      />
      <Rect
        x="10"
        y="14"
        width="4"
        height="6"
        stroke={color}
        strokeWidth={STROKE}
      />
      {/* tiny paw sign above the awning */}
      <Ellipse cx="12" cy="4.4" rx="1.3" ry="1" fill={color} />
      <Circle cx="10.4" cy="2.6" r="0.55" fill={color} />
      <Circle cx="12" cy="2.2" r="0.55" fill={color} />
      <Circle cx="13.6" cy="2.6" r="0.55" fill={color} />
    </Svg>
  );
}

/* Adventure — compass */
function AdventureIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={STROKE} />
      <Path d="M12 5 L13.6 12 L12 12.8 L10.4 12 Z" fill={color} />
      <Path
        d="M12 19 L10.4 12 L12 11.2 L13.6 12 Z"
        stroke={color}
        strokeWidth={STROKE * 0.8}
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="1" fill={color} />
    </Svg>
  );
}