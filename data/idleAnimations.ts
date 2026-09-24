import { ImageSourcePropType } from "react-native";

/**
 * Standing-idle loops for pet avatars (breathing, blinks, head turns, a tail wag), keyed by the
 * same `emoji` id used in AVATAR_OPTIONS. Played by IdleSprite wherever a full-body avatar is
 * shown with `animated` on (Home lawn, Daily Paw Log card). Pets without an entry here just
 * show their static avatar image.
 *
 * Frame prep (golden retriever, 16 frames): cut from one 4x4 hand-drawn sheet. The source rows
 * are drawn at slightly different proportions: body length is nearly constant but height varies
 * by up to ~12% (the bottom rows are drawn squatter). So each frame is scaled horizontally and
 * vertically separately (all corrections within ~6%) so its paws-to-back height (132px) AND its
 * chest-to-rump / leg-span length match every other frame, then shifted so the body and legs line
 * up on one shared ground line -- only the head, chest fur and tail move. Edge fringe cleaned;
 * all frames share one 405x230 transparent canvas (see IDLE_ASPECTS).
 * Art faces left, same as the static avatar image.
 */
export const IDLE_ANIMATIONS: Record<string, ImageSourcePropType[]> = {
  "golden-retriever-myavatar": [
    require("../assets/animations/golden_retriever_idle_0.png"),
    require("../assets/animations/golden_retriever_idle_1.png"),
    require("../assets/animations/golden_retriever_idle_2.png"),
    require("../assets/animations/golden_retriever_idle_3.png"),
    require("../assets/animations/golden_retriever_idle_4.png"),
    require("../assets/animations/golden_retriever_idle_5.png"),
    require("../assets/animations/golden_retriever_idle_6.png"),
    require("../assets/animations/golden_retriever_idle_7.png"),
    require("../assets/animations/golden_retriever_idle_8.png"),
    require("../assets/animations/golden_retriever_idle_9.png"),
    require("../assets/animations/golden_retriever_idle_10.png"),
    require("../assets/animations/golden_retriever_idle_11.png"),
    require("../assets/animations/golden_retriever_idle_12.png"),
    require("../assets/animations/golden_retriever_idle_13.png"),
    require("../assets/animations/golden_retriever_idle_14.png"),
    require("../assets/animations/golden_retriever_idle_15.png"),
  ],
};

/**
 * Smoothest play order per pet (indexes into its IDLE_ANIMATIONS frames). Worked out by measuring
 * how different every pair of frames is and picking the loop with the smallest total change, so
 * consecutive poses are as close as possible. Pets without an entry play 0..n-1.
 */
export const IDLE_SEQUENCES: Record<string, number[]> = {
  "golden-retriever-myavatar": [0, 1, 2, 3, 8, 10, 14, 12, 13, 15, 11, 9, 7, 6, 5, 4],
};

/**
 * Width / height of each pet's idle frame canvas. The idle art is much wider than it is tall, so
 * it's drawn full-width and pinned to the BOTTOM of its box (paws on the ground line) rather than
 * letterboxed into the middle of a square.
 */
export const IDLE_ASPECTS: Record<string, number> = {
  "golden-retriever-myavatar": 405 / 230,
};

export function findIdleAspect(emoji: string | null | undefined): number | undefined {
  if (!emoji) return undefined;
  return IDLE_ASPECTS[emoji];
}

export function findIdleSequence(emoji: string | null | undefined): number[] | undefined {
  if (!emoji) return undefined;
  return IDLE_SEQUENCES[emoji];
}

export function findIdleFrames(
  emoji: string | null | undefined
): ImageSourcePropType[] | undefined {
  if (!emoji) return undefined;
  return IDLE_ANIMATIONS[emoji];
}
