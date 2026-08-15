// Shared visual + config constants for the "Daily Paw Log" / "Ask the Pet
// Coach" feature. Used by both daily_log_tab.tsx and OriginStoryWizard.tsx
// so the almanac card and the origin-story wizard stay visually in sync —
// previously each file defined its own copy of these.

// Parchment/wood palette used on the Daily Paw Log almanac card and the
// origin-story wizard, so the wizard feels like part of the same
// storybook rather than a separate, differently-themed screen.
export const WOOD_DARK = "#3E2A18";
export const WOOD_MID = "#6B4A28";
export const PARCHMENT = "#F6E8C6";
export const GOLD = "#D9A441";

// Set this to your deployed server's URL for native (iOS/Android) builds,
// e.g. via an EXPO_PUBLIC_API_BASE_URL env var. It can stay empty for
// web-only testing, where a relative path works fine.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";