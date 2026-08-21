import React from "react";
import {
  Image,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { AVATAR_OPTIONS, AvatarOption, PetCategory } from "../../data/petcategories";

export function findAvatarOption(
  category: PetCategory | null | undefined,
  emoji: string | null | undefined,
  color: string | null | undefined
): AvatarOption | undefined {
  if (!category || !emoji) return undefined;
  const options = AVATAR_OPTIONS[category];

  // Custom-image avatars already use a unique, non-emoji `emoji` key (e.g.
  // "german-shepherd-myavatar"), so match those by that key alone — a pet
  // that already has one equipped keeps rendering correctly even if that
  // avatar's tint `color` is tweaked later. Plain-emoji options (e.g. the
  // snake category, which reuses "🐍" across all five colors) still need
  // the color to tell them apart.
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
  /**
   * "face" = close-up art for avatar-picker/selection UI, falling back to
   * `image` when an option has no dedicated face art.
   * "full" (default) = the normal full-body art shown everywhere else.
   */
  variant?: "face" | "full";
  /**
   * When true, skips the default black backdrop behind the image so
   * whatever's behind this component (e.g. an avatar-swatch's own color
   * tint) shows through the transparent PNG instead. Used in the avatar
   * picker, where each option already sits on its own colored swatch.
   */
  transparentBackdrop?: boolean;
};

/**
 * Renders a pet avatar anywhere in the app: a custom image (on a black
 * backdrop so transparent PNGs stand out, unless `transparentBackdrop` is
 * set) when the matched option has one, otherwise the emoji. Falls back to
 * a paw emoji if nothing matches.
 */
export function AvatarDisplay({
  category,
  emoji,
  color,
  size = 40,
  style,
  variant = "full",
  transparentBackdrop = false,
}: Props) {
  const option = findAvatarOption(category, emoji, color);
  const source =
    variant === "face" ? option?.faceImage ?? option?.image : option?.image;

  if (source) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: transparentBackdrop ? "transparent" : "#000",
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
