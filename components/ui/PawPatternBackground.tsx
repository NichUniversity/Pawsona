import React from "react";
import { Image, ImageSourcePropType, StyleSheet, View } from "react-native";

// Full-screen pawprint pattern behind a tab's content; `backgroundColor` shows through gaps and while loading.
type Props = {
  backgroundColor?: string;
  source?: ImageSourcePropType;
};

const DEFAULT_SOURCE = require("../../assets/images/pawprintbackground.png");

export function PawPatternBackground({
  backgroundColor,
  source = DEFAULT_SOURCE,
}: Props) {
  return (
    <View
      pointerEvents="none"
      style={[styles.fill, backgroundColor ? { backgroundColor } : null]}
    >
      <Image source={source} style={styles.fill} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
  },
});