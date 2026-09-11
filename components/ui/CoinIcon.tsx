import React from "react";
import { Image, StyleSheet } from "react-native";

// The Pawsona coin — used anywhere the app shows in-game currency instead of the 🪙 emoji.
const COIN_SOURCE = require("../../assets/images/paw-coin.png");

type Props = {
  size?: number;
};

export function CoinIcon({ size = 16 }: Props) {
  return (
    <Image
      source={COIN_SOURCE}
      style={[
        styles.icon,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    // Nudges the coin down to line up with the digits next to it.
    marginBottom: -2,
  },
});
