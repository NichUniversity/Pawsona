import React from "react";
import {
  Image,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { findIdleAspect, findIdleFrames, findIdleSequence } from "../../data/idleAnimations";
import { AVATAR_OPTIONS, AvatarOption, PetCategory } from "../../data/petcategories";
import { findSheetAnimation } from "../../data/sheetAnimations";
import { IdleSprite } from "./IdleSprite";
import { SpriteSheetPlayer } from "./SpriteSheetPlayer";

// Rendered (sprite-sheet) idle art: default height of the dog as a fraction of the avatar box.
// A sheet can override it with `heightFrac` (data/sheetAnimations.ts), so each breed keeps the
// size its static avatar art already had on the lawn.
const SHEET_DOG_HEIGHT_FRAC = 0.66;

// Shared "picture frame mat" color behind avatar art.
export const AVATAR_BACKDROP_COLOR = "#D8C79A";

export function findAvatarOption(
  category: PetCategory | null | undefined,
  emoji: string | null | undefined,
  color: string | null | undefined
): AvatarOption | undefined {
  if (!category || !emoji) return undefined;
  const options = AVATAR_OPTIONS[category];

  // Custom-image avatars match by emoji alone; plain-emoji options also need color.
  const byEmojiOnly = options.find((opt) => opt.emoji === emoji && opt.image);
  if (byEmojiOnly) return byEmojiOnly;

  return options.find((opt) => opt.emoji === emoji && opt.color === color);
}

type Props = {
  category: PetCategory | null | undefined;
  emoji: string | null | undefined;
  color?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle> | StyleProp<TextStyle>;
  /** "face" = close-up art, falls back to `image`. "full" = full-body art. */
  variant?: "face" | "full";
  /** Skip the default black backdrop (e.g. when already on a colored swatch). */
  transparentBackdrop?: boolean;
  /** Full-body only: play the pet's idle loop (data/idleAnimations.ts) if it has one. */
  animated?: boolean;
};

/** Renders a pet avatar: a custom image if the matched option has one, otherwise the emoji. */
export function AvatarDisplay({
  category,
  emoji,
  color,
  size = 40,
  style,
  variant = "full",
  transparentBackdrop = false,
  animated = false,
}: Props) {
  const option = findAvatarOption(category, emoji, color);
  const source =
    variant === "face" ? option?.faceImage ?? option?.image : option?.image;
  const sheetAnimation = animated && variant === "full" ? findSheetAnimation(option?.emoji) : undefined;
  const idleFrames = animated && variant === "full" ? findIdleFrames(option?.emoji) : undefined;

  // Pre-rendered idle loop (e.g. the golden retriever's Blender breathe + blink): preferred over
  // the hand-drawn idle frames. Pinned to the bottom-center of the box, paws on its bottom edge
  // like the idle loop below, with no round clip.
  if (source && sheetAnimation) {
    const dogHeight = size * (sheetAnimation.heightFrac ?? SHEET_DOG_HEIGHT_FRAC);
    const dogWidth = (dogHeight * sheetAnimation.frameWidth) / sheetAnimation.frameHeight;
    return (
      <View style={[{ width: size, height: size }, style as StyleProp<ViewStyle>]}>
        <SpriteSheetPlayer
          key={option?.emoji}
          animation={sheetAnimation}
          style={{ position: "absolute", left: (size - dogWidth) / 2, bottom: 0, width: dogWidth }}
        />
      </View>
    );
  }

  // Idle-animated full-body art: drawn full-width and pinned to the bottom of the box (paws on
  // the box's bottom edge, where the Home lawn's shadow sits), with no round clip -- the wide idle
  // canvas would otherwise lose its paws and tail to the circle's corners.
  if (source && idleFrames) {
    return (
      <View style={[{ width: size, height: size }, style as StyleProp<ViewStyle>]}>
        {/* 1.2x wide (overhanging the box equally on both sides) so the dog stands about as tall
            as the static avatar art does -- the idle canvas is much wider than it is tall. */}
        <IdleSprite
          key={option?.emoji}
          frames={idleFrames}
          sequence={findIdleSequence(option?.emoji)}
          aspect={findIdleAspect(option?.emoji)}
          style={{ position: "absolute", left: -size * 0.1, bottom: 0, width: size * 1.2, height: size }}
        />
      </View>
    );
  }

  if (source) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: transparentBackdrop ? "transparent" : AVATAR_BACKDROP_COLOR,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          },
          style as StyleProp<ViewStyle>,
        ]}
      >
        <Image
          source={source}
          style={{ width: size * 0.82, height: size * 0.82 }}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <Text style={[{ fontSize: size }, style as StyleProp<TextStyle>]}>
      {option?.emoji ?? emoji ?? "🐾"}
    </Text>
  );
}
