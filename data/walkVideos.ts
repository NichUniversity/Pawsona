import type { VideoSource } from "expo-video";

/**
 * Video clips for a pet's "hold the avatar" walk animation, keyed by the
 * same `emoji` id used in AVATAR_OPTIONS. Pre-keyed onto solid
 * AVATAR_BACKDROP_COLOR (components/ui/AvatarDisplay.tsx, currently
 * "#D8C79A") to match avatarFrame's background in daily_log_tab.tsx. If
 * that color ever changes, these clips need to be re-rendered onto the new
 * color too — it's baked into the video pixels, not applied at runtime.
 * A pet without an entry here falls back to WALK_ANIMATIONS' sprite loop
 * instead.
 */
export const WALK_VIDEOS: Record<string, VideoSource> = {
  "golden-retriever-myavatar": require("../assets/animations/golden_retriever_walk.mp4"),
  "bulldog-myavatar": require("../assets/animations/bulldog_walk.mp4"),
  "poodle-myavatar": require("../assets/animations/poodle_walk.mp4"),
  "german-shepherd-sable-myavatar": require("../assets/animations/german_shepherd_sable_walk.mp4"),
  "german-shepherd-myavatar": require("../assets/animations/german_shepherd_walk.mp4"),
  "wolf-myavatar": require("../assets/animations/wolf_walk.mp4"),
};

export function findWalkVideo(
  emoji: string | null | undefined
): VideoSource | undefined {
  if (!emoji) return undefined;
  return WALK_VIDEOS[emoji];
}
