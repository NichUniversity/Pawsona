import { useSafeAreaInsets } from "react-native-safe-area-context";

// Keep this in sync with getTabBarStyle in app/(tabs)/_layout.tsx — the
// floating pill's own PILL_HEIGHT (64) + PILL_BOTTOM_MARGIN (14), lifted
// off the bottom edge by insets.bottom on top of that. This hook exists so
// every scrollable tab screen reserves exactly enough space for the pill
// instead of letting content scroll behind it.
const TAB_BAR_HEIGHT = 78;

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