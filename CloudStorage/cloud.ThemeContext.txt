import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeKey = "dark" | "white" | "orange" | "blue" | "purple";
// Old name kept as an alias — a few files may still reference it by this name.
export type AccentColorKey = ThemeKey;

type ThemeBackground = {
  /** Vertical gradient stops, same 3-stop approach TabBackground has always used. */
  top: string;
  mid: string;
  bottom: string;
  /** Soft highlight painted over the gradient (top-left radial sheen). */
  sheenColor: string;
  sheenOpacity: number;
};

export type ThemeDefinition = {
  key: ThemeKey;
  label: string;
  /** True for the one dark theme — lets components branch for things like
   *  icon backdrops or shadow colors without checking `key` directly. */
  isDark: boolean;
  statusBarStyle: "light" | "dark";
  /** Primary accent/button color — this is what `accentColor` has always meant. */
  accent: string;
  background: ThemeBackground;
  card: { background: string; border: string };
  text: { primary: string; secondary: string };
  tabBar: { background: string; border: string; activeTint: string; inactiveTint: string };
  /** Color swatch shown as the little dot in the Settings picker. */
  swatchColor: string;
};

export const THEMES: Record<ThemeKey, ThemeDefinition> = {
  dark: {
    key: "dark",
    label: "Dark",
    isDark: true,
    statusBarStyle: "light",
    accent: "#FF8C42",
    background: {
      top: "#1C1C1E",
      mid: "#0D0D0D",
      bottom: "#000000",
      sheenColor: "#FFFFFF",
      sheenOpacity: 0.08,
    },
    card: { background: "#1C1C1E", border: "rgba(255,255,255,0.08)" },
    text: { primary: "#F5F5F5", secondary: "#8E8E93" },
    tabBar: {
      background: "#000000",
      border: "rgba(255,255,255,0.12)",
      activeTint: "#FFFFFF",
      inactiveTint: "#8d8d90",
    },
    swatchColor: "#1C1C1E",
  },
  white: {
    key: "white",
    label: "White",
    isDark: false,
    statusBarStyle: "dark",
    accent: "#FF8C42",
    background: {
      top: "#FFFFFF",
      mid: "#F7F7F8",
      bottom: "#EFEFF2",
      sheenColor: "#FF8C42",
      sheenOpacity: 0.05,
    },
    card: { background: "#FFFFFF", border: "rgba(0,0,0,0.08)" },
    text: { primary: "#1C1C1E", secondary: "#6B6B70" },
    tabBar: {
      background: "#FFFFFF",
      border: "rgba(0,0,0,0.1)",
      activeTint: "#FF8C42",
      inactiveTint: "#9A9AA0",
    },
    swatchColor: "#FFFFFF",
  },
  orange: {
    key: "orange",
    label: "Orange",
    isDark: false,
    statusBarStyle: "dark",
    accent: "#FF8C42",
    background: {
      top: "#FFF3E6",
      mid: "#FFE6CC",
      bottom: "#FFD8AD",
      sheenColor: "#FFFFFF",
      sheenOpacity: 0.35,
    },
    card: { background: "#FFFAF3", border: "rgba(255,140,66,0.25)" },
    text: { primary: "#3A2A1A", secondary: "#8A6B52" },
    tabBar: {
      background: "#FFF3E6",
      border: "rgba(255,140,66,0.2)",
      activeTint: "#FF8C42",
      inactiveTint: "#B08A68",
    },
    swatchColor: "#FF8C42",
  },
  blue: {
    key: "blue",
    label: "Blue",
    isDark: false,
    statusBarStyle: "dark",
    accent: "#4A9DFF",
    background: {
      top: "#EAF4FF",
      mid: "#D9EBFF",
      bottom: "#C7E1FF",
      sheenColor: "#FFFFFF",
      sheenOpacity: 0.35,
    },
    card: { background: "#F5FAFF", border: "rgba(74,157,255,0.25)" },
    text: { primary: "#1A2B3D", secondary: "#5A7285" },
    tabBar: {
      background: "#EAF4FF",
      border: "rgba(74,157,255,0.2)",
      activeTint: "#4A9DFF",
      inactiveTint: "#7C97AC",
    },
    swatchColor: "#4A9DFF",
  },
  purple: {
    key: "purple",
    label: "Purple",
    isDark: false,
    statusBarStyle: "dark",
    accent: "#A66BFF",
    background: {
      top: "#F3ECFF",
      mid: "#E9DCFF",
      bottom: "#DECBFF",
      sheenColor: "#FFFFFF",
      sheenOpacity: 0.35,
    },
    card: { background: "#FAF7FF", border: "rgba(166,107,255,0.25)" },
    text: { primary: "#2E1A47", secondary: "#75688A" },
    tabBar: {
      background: "#F3ECFF",
      border: "rgba(166,107,255,0.2)",
      activeTint: "#A66BFF",
      inactiveTint: "#9A8AAE",
    },
    swatchColor: "#A66BFF",
  },
};

// Ordered list for the Settings picker (dot color + label per theme).
export const THEME_OPTIONS: { key: ThemeKey; label: string; value: string }[] =
  (Object.keys(THEMES) as ThemeKey[]).map((key) => ({
    key,
    label: THEMES[key].label,
    value: THEMES[key].swatchColor,
  }));

// Old name, kept so any straggling import doesn't break.
export const ACCENT_COLORS = THEME_OPTIONS;

const DEFAULT_THEME: ThemeKey = "dark";
const THEME_STORAGE_KEY = "pawsona_theme_accent_v1";

type ThemeContextType = {
  /** Full token set for the active theme — background, card, text, tab bar, accent. */
  theme: ThemeDefinition;
  themeKey: ThemeKey;
  setThemeKey: (key: ThemeKey) => void;
  /** Back-compat aliases — `accentColor` is still the button/highlight color. */
  accentKey: ThemeKey;
  accentColor: string;
  setAccentKey: (key: ThemeKey) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// App-wide theme, swappable from Settings and remembered on the device.
// Picking a theme now changes the background (and cards, text, tab bar)
// along with the accent color — Dark is the default, matching the
// Instagram-style look the app started with; White/Orange/Blue/Purple are
// full light themes built around that color.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKeyState] = useState<ThemeKey>(DEFAULT_THEME);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored && stored in THEMES) {
          setThemeKeyState(stored as ThemeKey);
        }
      } catch {
        // Fall back to the default theme.
      }
    })();
  }, []);

  const setThemeKey = (key: ThemeKey) => {
    setThemeKeyState(key);
    AsyncStorage.setItem(THEME_STORAGE_KEY, key).catch(() => {
      // Worst case the choice doesn't persist across a relaunch.
    });
  };

  const theme = THEMES[themeKey] ?? THEMES[DEFAULT_THEME];

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themeKey,
        setThemeKey,
        accentKey: themeKey,
        accentColor: theme.accent,
        setAccentKey: setThemeKey,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// Small helper for translucent accent-tinted backgrounds (e.g. an
// "equipped"/"unlocked" pill) that need to follow whatever accent color is
// currently selected instead of being hardcoded to orange.
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return context;
}
