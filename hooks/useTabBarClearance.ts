import { useSafeAreaInsets } from "react-native-safe-area-context";

// Keep these two values in sync with the tabBarStyle in
// app/(tabs)/_layout.tsx (height, and the bottom offset formula) — this
// hook exists so every scrollable tab screen reserves exactly enough space
// for the floating pill bar instead of letting content scroll behind it.
const TAB_BAR_HEIGHT = 58;
const TAB_BAR_MIN_BOTTOM_OFFSET = 16;
const TAB_BAR_SAFE_AREA_GAP = 8;

// Extra breathing room between the bar and the last bit of content, so
// nothing sits flush against the bar.
const EXTRA_GAP = 20;

/**
 * Returns the bottom padding a scrollable tab screen needs so its content
 * can fully scroll clear of the floating bottom tab bar, on any device
 * (including ones with a home-indicator safe area).
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  const barBottomOffset =
    insets.bottom > 0
      ? insets.bottom + TAB_BAR_SAFE_AREA_GAP
      : TAB_BAR_MIN_BOTTOM_OFFSET;

  return barBottomOffset + TAB_BAR_HEIGHT + EXTRA_GAP;
}