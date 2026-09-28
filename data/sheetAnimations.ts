import { ImageSourcePropType } from "react-native";

/**
 * Pre-rendered idle loops packed into one sprite-sheet image each, played by
 * components/ui/SpriteSheetPlayer.tsx. Keyed by the same `emoji` id used in AVATAR_OPTIONS.
 *
 * Used for the pet standing on the Home lawn (PetRoomBackground -> AvatarDisplay `animated`).
 * A pet with an entry here plays its sheet there; otherwise it falls back to its hand-drawn
 * idle loop (data/idleAnimations.ts), then to its static avatar.
 *
 * Sheet layout: frames run left-to-right, top-to-bottom, `columns` per row. Each frame sits in a
 * `cellWidth` x `cellHeight` cell with `padding` px of transparent space on every side (so a
 * fractional on-screen scale never bleeds a neighbouring frame into view). All frames share one
 * crop, with the paws on the frame's bottom edge.
 */
export type SheetAnimation = {
  sheet: ImageSourcePropType;
  frameCount: number;
  columns: number;
  frameWidth: number;
  frameHeight: number;
  cellWidth: number;
  cellHeight: number;
  padding: number;
  fps: number;
  /** How tall the dog stands on the lawn, as a fraction of its avatar box. Default 0.66. */
  heightFrac?: number;
};

export const SHEET_ANIMATIONS: Record<string, SheetAnimation> = {
  /**
   * Golden retriever breathe + blink, rendered from blender/golden_retriever_breathe.blend after
   * blender/wire_blink_line.py + blender/upgrade_breathe.py: frames 1-72 at 24fps, one slow 3s
   * breath per loop (frame 73 = frame 1, so it loops seamlessly) and one blink on the exhale
   * (closed-eye line on frames 52-54). The head is deliberately still: at lawn size a 1px head bob
   * on every breath reads as the dog shaking.
   * Straight-on orthographic camera, unlit and transparent, at 900x670, cropped to the union of
   * every frame's content (paws on the bottom edge) and scaled to 160px tall. That's about
   * 1:1 with the ~50pt dog on a 3x phone, so the device isn't shrinking a huge image every frame.
   * Palette-quantized (256 colors, imagequant).
   * To re-render after changing the .blend, re-run the same pipeline and keep these numbers in
   * sync with the new sheet.
   */
  "golden-retriever-myavatar": {
    sheet: require("../assets/animations/golden_retriever_home_idle.png"),
    frameCount: 72,
    columns: 12,
    frameWidth: 223,
    frameHeight: 160,
    cellWidth: 229,
    cellHeight: 166,
    padding: 3,
    fps: 24,
  },
  /**
   * German Shepherd (Black): same breathe + blink idle as the golden retriever, built by
   * blender/build_breed_idle.py into blender/german_shepherd_breathe.blend. 72 frames at 24fps (3s loop),
   * one blink on the exhale (closed-eye line on frames 52-54), head / legs / hips / tail still. The
   * breath follows the shepherd's sloping ribcage. Rendered at 1000x1000 and cropped to the union of
   * every frame's content (paws on the bottom edge), 190px tall. heightFrac 0.82 matches the size
   * its static avatar art already had on the lawn.
   */
  "german-shepherd-myavatar": {
    sheet: require("../assets/animations/german_shepherd_home_idle.png"),
    frameCount: 72,
    columns: 12,
    frameWidth: 187,
    frameHeight: 190,
    cellWidth: 193,
    cellHeight: 196,
    padding: 3,
    fps: 24,
    heightFrac: 0.82,
  },
  /**
   * German Shepherd (Sable): same breathe + blink idle as the golden retriever, built by
   * blender/build_breed_idle.py into blender/german_shepherd_sable_breathe.blend. 72 frames at 24fps (3s loop),
   * one blink on the exhale (closed-eye line on frames 52-54), head / legs / hips / tail still. The
   * breath follows the shepherd's sloping ribcage. Rendered at 1000x1000 and cropped to the union of
   * every frame's content (paws on the bottom edge), 190px tall. heightFrac 0.82 matches the size
   * its static avatar art already had on the lawn.
   */
  "german-shepherd-sable-myavatar": {
    sheet: require("../assets/animations/german_shepherd_sable_home_idle.png"),
    frameCount: 72,
    columns: 12,
    frameWidth: 188,
    frameHeight: 190,
    cellWidth: 194,
    cellHeight: 196,
    padding: 3,
    fps: 24,
    heightFrac: 0.82,
  },
  /**
   * Poodle: same breathe + blink idle, built by blender/build_breed_idle.py into
   * blender/poodle_breathe.blend (hanging ear and pom-pom tail pinned). 72 frames at 24fps, closed-eye line on frames
   * 52-54. heightFrac 0.8 keeps the size its static avatar art had on the lawn.
   */
  "poodle-myavatar": {
    sheet: require("../assets/animations/poodle_home_idle.png"),
    frameCount: 72,
    columns: 12,
    frameWidth: 181,
    frameHeight: 190,
    cellWidth: 187,
    cellHeight: 196,
    padding: 3,
    fps: 24,
    heightFrac: 0.8,
  },
  /**
   * Service Dog: same breathe + blink idle, built by blender/build_breed_idle.py into
   * blender/service_dog_breathe.blend (the harness moves with the chest; raised tail pinned). 72 frames at 24fps, closed-eye line on frames
   * 52-54. heightFrac 0.78 keeps the size its static avatar art had on the lawn.
   */
  "service-dog-myavatar": {
    sheet: require("../assets/animations/service_dog_home_idle.png"),
    frameCount: 72,
    columns: 12,
    frameWidth: 196,
    frameHeight: 190,
    cellWidth: 202,
    cellHeight: 196,
    padding: 3,
    fps: 24,
    heightFrac: 0.78,
  },
  /**
   * Bulldog: same breathe + blink idle, built by blender/build_breed_idle.py into
   * blender/bulldog_breathe.blend (stocky ribcage; head, jowls and tail nub pinned). 72 frames at 24fps, closed-eye line on frames
   * 52-54. heightFrac 0.69 keeps the size its static avatar art had on the lawn.
   */
  "bulldog-myavatar": {
    sheet: require("../assets/animations/bulldog_home_idle.png"),
    frameCount: 72,
    columns: 12,
    frameWidth: 183,
    frameHeight: 160,
    cellWidth: 189,
    cellHeight: 166,
    padding: 3,
    fps: 24,
    heightFrac: 0.69,
  },
  /**
   * Wolf: same breathe + blink idle, built by blender/build_breed_idle.py into
   * blender/wolf_breathe.blend (same pose family as the shepherds). 72 frames at 24fps, closed-eye line on frames
   * 52-54. heightFrac 0.8 keeps the size its static avatar art had on the lawn.
   */
  "wolf-myavatar": {
    sheet: require("../assets/animations/wolf_home_idle.png"),
    frameCount: 72,
    columns: 12,
    frameWidth: 191,
    frameHeight: 190,
    cellWidth: 197,
    cellHeight: 196,
    padding: 3,
    fps: 24,
    heightFrac: 0.8,
  },
};

export function findSheetAnimation(emoji: string | null | undefined): SheetAnimation | undefined {
  if (!emoji) return undefined;
  return SHEET_ANIMATIONS[emoji];
}
