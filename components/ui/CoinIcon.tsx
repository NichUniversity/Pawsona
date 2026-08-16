import React from "react";
import { Image, StyleSheet } from "react-native";

// The Pawsona coin — a gold paw-print coin, used anywhere the app shows
// the in-game currency (coin badges, prices, reward callouts) instead of
// the 🪙 emoji.
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
    // Inline images in RN Text sit high against the baseline by default —
    // this nudges the coin down so it lines up with the digits next to it.
    marginBottom: -2,
  },
});
