import { Platform } from "react-native";

// RN's shadowColor/shadowOffset/shadowOpacity/shadowRadius only ever worked on
// iOS (Android has always needed the separate `elevation` prop instead, which
// this doesn't touch); react-native-web deprecated its old shadow*-prop
// polyfill in favor of the standard CSS `boxShadow` shorthand, and now warns
// ("shadow* style props are deprecated. Use boxShadow.") every time it sees
// one of those keys. These two helpers return the right shape for whichever
// platform is actually running, so native keeps its real shadow untouched and
// web gets an equivalent boxShadow/textShadow with no warning.

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

type ShadowOptions = {
  /** Native shadowColor, as hex (e.g. "#000"). Default "#000". */
  color?: string;
  offsetX?: number;
  offsetY: number;
  /** Native shadowOpacity (0-1); also mixed into the web rgba(). */
  opacity: number;
  radius: number;
  /** Android drop-shadow strength; ignored on web. */
  elevation: number;
};

/** Cross-platform replacement for a shadowColor/shadowOffset/shadowOpacity/shadowRadius/elevation block. Spread the result into a style object. */
export function crossPlatformShadow({
  color = "#000",
  offsetX = 0,
  offsetY,
  opacity,
  radius,
  elevation,
}: ShadowOptions) {
  if (Platform.OS === "web") {
    const { r, g, b } = hexToRgb(color);
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px rgba(${r}, ${g}, ${b}, ${opacity})`,
    } as const;
  }
  return {
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}

type TextShadowOptions = {
  /** Any CSS-legal color (hex or rgba string) — used as-is on both platforms. */
  color: string;
  offsetX?: number;
  offsetY: number;
  radius: number;
};

/** Cross-platform replacement for a textShadowColor/textShadowOffset/textShadowRadius block. Spread the result into a style object. */
export function crossPlatformTextShadow({
  color,
  offsetX = 0,
  offsetY,
  radius,
}: TextShadowOptions) {
  if (Platform.OS === "web") {
    return { textShadow: `${offsetX}px ${offsetY}px ${radius}px ${color}` } as const;
  }
  return {
    textShadowColor: color,
    textShadowOffset: { width: offsetX, height: offsetY },
    textShadowRadius: radius,
  };
}
