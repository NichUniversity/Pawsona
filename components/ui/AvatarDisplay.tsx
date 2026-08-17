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
  return AVATAR_OPTIONS[category].find(
    (opt) => opt.emoji === emoji && opt.color === color
  );
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
};

/**
 * Renders a pet avatar anywhere in the app: a custom image (on a black
 * backdrop so transparent PNGs stand out) when the matched option has one,
 * otherwise the emoji. Falls back to a paw emoji if nothing matches.
 */
export function AvatarDisplay({
  category,
  emoji,
  color,
  size = 40,
  style,
  variant = "full",
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
            backgroundColor: "#000",
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
