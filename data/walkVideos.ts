import type { VideoSource } from "expo-video";

/**
 * Real video clips for a pet's "hold the avatar" walk animation, keyed by
 * the same `emoji` id used in AVATAR_OPTIONS (see data/petcategories.ts) —
 * same lookup convention as WALK_ANIMATIONS in walkAnimations.ts.
 *
 * These are pre-keyed onto solid black (not transparent — video playback
 * on mobile doesn't reliably support alpha channels across iOS/Android),
 * which matches avatarFrame's own black background in daily_log_tab.tsx so
 * the clip reads as if it were transparent. If you add a clip for another
 * pet, key its background to the same black (#000) the same way.
 *
 * A pet without an entry here just falls back to WALK_ANIMATIONS' sprite
 * loop instead (see the lookup in daily_log_tab.tsx).
 */
export const WALK_VIDEOS: Record<string, VideoSource> = {
  "golden-retriever-myavatar": require("../assets/animations/golden_retriever_walk.mp4"),
  "bulldog-myavatar": require("../assets/animations/bulldog_walk.mp4"),
};

export function findWalkVideo(
  emoji: string | null | undefined
): VideoSource | undefined {
  if (!emoji) return undefined;
  return WALK_VIDEOS[emoji];
}
