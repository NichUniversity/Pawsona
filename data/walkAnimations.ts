import { ImageSourcePropType } from "react-native";

/**
 * Side-profile walk-cycle frames for pet avatars, keyed by the same
 * `emoji` id used in AVATAR_OPTIONS (see data/petcategories.ts) so a walk
 * animation can be looked up for whichever avatar a pet has equipped.
 *
 * Frames are ordered to loop seamlessly (frame 4 -> frame 0) and all share
 * the same canvas size/alignment so the dog doesn't jitter between frames —
 * keep that alignment if you add more frame sets.
 */
export const WALK_ANIMATIONS: Record<string, ImageSourcePropType[]> = {
  "golden-retriever-myavatar": [
    require("../assets/animations/golden_retriever_walk_0.png"),
    require("../assets/animations/golden_retriever_walk_1.png"),
    require("../assets/animations/golden_retriever_walk_2.png"),
    require("../assets/animations/golden_retriever_walk_3.png"),
    require("../assets/animations/golden_retriever_walk_4.png"),
  ],
  "bulldog-myavatar": [
    require("../assets/animations/bulldog_walk_0.png"),
    require("../assets/animations/bulldog_walk_1.png"),
    require("../assets/animations/bulldog_walk_2.png"),
    require("../assets/animations/bulldog_walk_3.png"),
    require("../assets/animations/bulldog_walk_4.png"),
    require("../assets/animations/bulldog_walk_5.png"),
    require("../assets/animations/bulldog_walk_6.png"),
    require("../assets/animations/bulldog_walk_7.png"),
    require("../assets/animations/bulldog_walk_8.png"),
    require("../assets/animations/bulldog_walk_9.png"),
  ],
};

export function findWalkFrames(
  emoji: string | null | undefined
): ImageSourcePropType[] | undefined {
  if (!emoji) return undefined;
  return WALK_ANIMATIONS[emoji];
}
