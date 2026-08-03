import React from "react";
import { Image, ImageStyle, StyleProp, Text, TextStyle } from "react-native";

import { getAvatarOption } from "../../data/avatars";

type Props = {
  id: string | null | undefined;
  size?: number;
  style?: StyleProp<TextStyle> | StyleProp<ImageStyle>;
};

export function AvatarDisplay({ id, size = 40, style }: Props) {
  const option = getAvatarOption(id);

  if (!option) {
    return (
      <Text style={[{ fontSize: size }, style as StyleProp<TextStyle>]}>
        🐾
      </Text>
    );
  }

  if (option.kind === "image") {
    return (
      <Image
        source={option.image}
        style={[{ width: size, height: size }, style as StyleProp<ImageStyle>]}
        resizeMode="contain"
      />
    );
  }

  return (
    <Text style={[{ fontSize: size }, style as StyleProp<TextStyle>]}>
      {option.emoji}
    </Text>
  );
}