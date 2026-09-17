import { ImageSourcePropType } from "react-native";

/**
 * Side-profile walk-cycle frames for pet avatars, keyed by the same
 * `emoji` id used in AVATAR_OPTIONS. Frames loop seamlessly (last -> first).
 */
export const WALK_ANIMATIONS: Record<string, ImageSourcePropType[]> = {
  // Live for golden retriever now — see data/walkVideos.ts, which no longer
  // has a golden-retriever-myavatar entry, so this sprite loop is what plays.
  // Frames are pre-aligned to a shared ground line; art faces left already,
  // so WalkingSprite's default (unmirrored) facing is correct here.
  "golden-retriever-myavatar": [
    require("../assets/animations/golden_retriever_walk_0.png"),
    require("../assets/animations/golden_retriever_walk_1.png"),
    require("../assets/animations/golden_retriever_walk_2.png"),
    require("../assets/animations/golden_retriever_walk_3.png"),
    require("../assets/animations/golden_retriever_walk_4.png"),
    require("../assets/animations/golden_retriever_walk_5.png"),
    require("../assets/animations/golden_retriever_walk_6.png"),
    require("../assets/animations/golden_retriever_walk_7.png"),
    require("../assets/animations/golden_retriever_walk_8.png"),
    require("../assets/animations/golden_retriever_walk_9.png"),
  ],
  // Bulldog's sprite-frame PNGs were removed — it now falls back to the
  // video clip in data/walkVideos.ts (WALK_VIDEOS still has a
  // "bulldog-myavatar" entry), same fallback pattern golden retriever
  // used before it got its own sprite loop above.
};

export function findWalkFrames(
  emoji: string | null | undefined
): ImageSourcePropType[] | undefined {
  if (!emoji) return undefined;
  return WALK_ANIMATIONS[emoji];
}
