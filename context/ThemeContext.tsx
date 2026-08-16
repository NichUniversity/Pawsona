import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export type AccentColorKey = "orange" | "blue" | "pink" | "green" | "purple";

export const ACCENT_COLORS: {
  key: AccentColorKey;
  label: string;
  value: string;
}[] = [
  { key: "orange", label: "Orange", value: "#FF8C42" },
  { key: "blue", label: "Blue", value: "#4A9DFF" },
  { key: "pink", label: "Pink", value: "#FF6FA5" },
  { key: "green", label: "Green", value: "#2BC48A" },
  { key: "purple", label: "Purple", value: "#A66BFF" },
];

const DEFAULT_ACCENT: AccentColorKey = "orange";
const THEME_STORAGE_KEY = "pawsona_theme_accent_v1";

type ThemeContextType = {
  accentKey: AccentColorKey;
  accentColor: string;
  setAccentKey: (key: AccentColorKey) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// App-wide accent color, swappable from Settings and remembered on the
// device. The dark/black backgrounds themselves stay fixed (that's the
// Instagram-style look the user picked) — this only recolors buttons,
// active states, and highlights that used to be hardcoded orange.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accentKey, setAccentKeyState] = useState<AccentColorKey>(DEFAULT_ACCENT);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored && ACCENT_COLORS.some((c) => c.key === stored)) {
          setAccentKeyState(stored as AccentColorKey);
        }
      } catch {
        // Fall back to the default accent.
      }
    })();
  }, []);

  const setAccentKey = (key: AccentColorKey) => {
    setAccentKeyState(key);
    AsyncStorage.setItem(THEME_STORAGE_KEY, key).catch(() => {
      // Worst case the choice doesn't persist across a relaunch.
    });
  };

  const accentColor =
    ACCENT_COLORS.find((c) => c.key === accentKey)?.value ?? ACCENT_COLORS[0].value;

  return (
    <ThemeContext.Provider value={{ accentKey, accentColor, setAccentKey }}>
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
