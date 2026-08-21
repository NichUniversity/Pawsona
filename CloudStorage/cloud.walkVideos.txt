import type { VideoSource } from "expo-video";

/**
 * Video clips for a pet's "hold the avatar" walk animation, keyed by the
 * same `emoji` id used in AVATAR_OPTIONS. Pre-keyed onto solid black to
 * match avatarFrame's background in daily_log_tab.tsx. A pet without an
 * entry here falls back to WALK_ANIMATIONS' sprite loop instead.
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
