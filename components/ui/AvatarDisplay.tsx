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

// Shared "picture frame mat" color behind avatar art — matches
// daily_log_tab.tsx's photoFrame background so the photo box and the
// avatar/walk box read as one matched pair. Also baked into the
// WALK_VIDEOS clips (see data/walkVideos.ts) — changing this alone won't
// recolor those; re-render the clips too.
export const AVATAR_BACKDROP_COLOR = "#D8C79A";

export function findAvatarOption(
  category: PetCategory | null | undefined,
  emoji: string | null | undefined,
  color: string | null | undefined
): AvatarOption | undefined {
  if (!category || !emoji) return undefined;
  const options = AVATAR_OPTIONS[category];

  // Custom-image avatars have a unique emoji key, so match by that alone.
  // Plain-emoji options (e.g. snakes reuse "🐍") still need color too.
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
