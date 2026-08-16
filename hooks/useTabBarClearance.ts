import { useSafeAreaInsets } from "react-native-safe-area-context";

// Keep this in sync with the tabBarStyle in app/(tabs)/_layout.tsx
// (height: 58 + insets.bottom, flush against the bottom edge) — this
// hook exists so every scrollable tab screen reserves exactly enough space
// for the flat bottom tab bar instead of letting content scroll behind it.
const TAB_BAR_HEIGHT = 58;

// Extra breathing room between the bar and the last bit of content, so
// nothing sits flush against the bar.
const EXTRA_GAP = 20;

/**
 * Returns the bottom padding a scrollable tab screen needs so its content
 * can fully scroll clear of the bottom tab bar, on any device (including
 * ones with a home-indicator safe area).
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom + EXTRA_GAP;
}