import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

// Little crayon/pen doodles for the Daily Paw Log notebook page — the kind of thing a kid scribbles
// in the margins. Every doodle is drawn in a 24x24 box with slightly wobbly, open-ended strokes so
// it reads as hand-drawn rather than an icon. Sized by the caller to fit inside one ruled row.

export type DoodleKind =
  | "heart"
  | "star"
  | "bone"
  | "paw"
  | "sun"
  | "smiley"
  | "swirl"
  | "sparkle"
  | "ball";

// Muted crayon colors so the doodles sit *on* the paper instead of shouting over it.
export const CRAYON = {
  red: "#D9625B",
  blue: "#5B7FC7",
  green: "#6AA66A",
  orange: "#E39A44",
  purple: "#9A6CC0",
  pencil: "#9C8E7A",
} as const;

type Props = {
  kind: DoodleKind;
  size: number;
  color?: string;
  /** Degrees — a small tilt makes each one look individually drawn. */
  rotate?: number;
  opacity?: number;
};

export function Doodle({ kind, size, color = CRAYON.pencil, rotate = 0, opacity = 0.85 }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ opacity, transform: [{ rotate: `${rotate}deg` }] }}
    >
      {kind === "heart" && (
        // Doesn't quite close at the bottom, like it was drawn in one go.
        <Path
          {...stroke}
          d="M12 20.5c-3.2-2.4-8.3-6-8.1-10.2.1-2.6 2.1-4.4 4.4-4.2 1.7.1 2.9 1.3 3.6 2.8.8-1.6 2.1-2.9 3.9-2.9 2.4 0 4.3 2 4.1 4.6-.3 3.9-4.6 7.1-7.6 9.6"
        />
      )}

      {kind === "star" && (
        <Path
          {...stroke}
          d="M12 3.2l2.3 5.6 5.9.4-4.6 3.8 1.6 5.9L12.1 15.6l-5.2 3.4 1.7-6-4.7-3.7 6-.5L12.2 3.4"
        />
      )}

      {kind === "bone" && (
        <Path
          {...stroke}
          d="M7.2 9.3c-.9-1.8-3.6-1.5-3.8.5-.1 1.1.7 1.8 1.5 2-.9.4-1.5 1.3-1.1 2.3.6 1.6 3 1.5 3.6-.1h9.3c.5 1.6 2.9 1.8 3.6.3.5-1-.1-2-1.1-2.4.9-.3 1.6-1.1 1.4-2.1-.4-1.9-3-2.1-3.8-.4z"
        />
      )}

      {kind === "paw" && (
        <>
          <Path
            {...stroke}
            d="M12 12.4c-2.6 0-5 2.7-4.9 4.9.1 1.9 2.2 2.3 3.3 1.8 1-.4 2.1-.4 3.1 0 1.2.5 3.2 0 3.3-1.8.1-2.3-2.3-4.9-4.8-4.9z"
          />
          <Circle cx={6.3} cy={10.2} r={1.6} {...stroke} />
          <Circle cx={9.6} cy={6.6} r={1.7} {...stroke} />
          <Circle cx={14.4} cy={6.5} r={1.7} {...stroke} />
          <Circle cx={17.8} cy={10.1} r={1.6} {...stroke} />
        </>
      )}

      {kind === "sun" && (
        <>
          <Circle cx={12} cy={12} r={3.8} {...stroke} />
          <Path
            {...stroke}
            d="M12 2.8v2.6M12 18.8v2.5M2.9 12h2.5M18.7 12h2.5M5.4 5.5l1.8 1.8M16.9 16.9l1.7 1.7M18.6 5.4l-1.8 1.8M7.1 16.9l-1.7 1.8"
          />
        </>
      )}

      {kind === "smiley" && (
        <>
          <Path {...stroke} d="M12.3 3.4c-4.8-.2-8.7 3.5-8.8 8.3-.1 4.8 3.6 8.7 8.4 8.8 4.9.1 8.6-3.8 8.6-8.5 0-4.5-3.3-8.3-8.4-8.6" />
          <Circle cx={9.1} cy={10} r={0.5} {...stroke} />
          <Circle cx={15} cy={10} r={0.5} {...stroke} />
          <Path {...stroke} d="M8.3 14.2c1.9 2.5 5.6 2.6 7.5.1" />
        </>
      )}

      {kind === "swirl" && (
        <Path
          {...stroke}
          d="M12.4 12.3c.5-.9-.4-1.9-1.4-1.6-1.4.4-1.6 2.3-.6 3.2 1.5 1.4 4 .6 4.6-1.3.8-2.5-1.3-4.9-3.8-4.8-3.3.1-5.3 3.4-4.4 6.5 1 3.4 5 4.8 8 3.2"
        />
      )}

      {kind === "sparkle" && (
        <Path
          {...stroke}
          d="M12 3.5c.4 4.3 2.1 6.9 6.8 8.4-4.6 1.3-6.4 4-6.8 8.6-.5-4.5-2.3-7.2-6.8-8.5 4.5-1.4 6.3-4.1 6.8-8.5z"
        />
      )}

      {kind === "ball" && (
        <>
          <Path {...stroke} d="M12.2 3.6c-4.7-.1-8.6 3.7-8.6 8.4 0 4.6 3.7 8.5 8.4 8.5 4.7.1 8.5-3.8 8.5-8.4 0-4.5-3.4-8.4-8.3-8.5" />
          <Path {...stroke} d="M4.4 9.3c5.3 1.8 10.2 1.8 15.3-.1M4.5 14.9c5.2-1.7 10.2-1.6 15.1.2" />
        </>
      )}
    </Svg>
  );
}

// A wobbly underline scribble — drawn under the "Choose your pet" title.
export function ScribbleUnderline({
  width,
  height,
  color = CRAYON.orange,
}: {
  width: number | `${number}%`;
  height: number;
  color?: string;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 10" preserveAspectRatio="none">
      <Path
        d="M1.5 6.2c9-2.6 17.5 1.8 26.4-.4 8.6-2.1 17.2 1.9 26-.3 8.8-2.2 17.8 1.8 26.7-.2 6.4-1.4 12.3-.6 17.9.8"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.8}
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}
