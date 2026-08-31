import React, { useEffect, useRef } from 'react';
import { Animated, Image, ImageSourcePropType, StyleSheet } from 'react-native';

export type PawsonaIconName =
  | 'home'
  | 'daily-log'
  | 'minigames'
  | 'store'
  | 'adventure';

type Props = {
  name: PawsonaIconName;
  size?: number;
  /** True for the focused tab. These are full-color flat illustrations
   *  (not line icons), so unlike the old SVG set their art can't be
   *  tinted by the theme's active/inactive color — a lift in opacity and
   *  a small scale bump is what stands in for that "lit up" state here. */
  active?: boolean;
};

// One hand-drawn sticker per tab, cropped from a single reference sheet
// down to just each icon's own art (no shared pill background or label
// text baked in — the tab bar still draws its own theme-adaptive
// background, and React Navigation renders the text label).
const ICON_SOURCES: Record<PawsonaIconName, ImageSourcePropType> = {
  home: require('../../assets/images/tab-home.png'),
  'daily-log': require('../../assets/images/tab-paw-log.png'),
  minigames: require('../../assets/images/tab-games.png'),
  store: require('../../assets/images/tab-shop.png'),
  adventure: require('../../assets/images/tab-adventure.png'),
};

export function PawsonaTabIcon({ name, size = 34, active = false }: Props) {
  // Animates the dim/lift instead of snapping between the two states —
  // same little "pop" language PressableScale and the daily reward glow
  // use elsewhere in the app, just driven by tab focus instead of touch.
  const lift = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(lift, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [active, lift]);

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = lift.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <Animated.View
      style={[
        styles.wrap,
        { width: size, height: size, opacity, transform: [{ scale }] },
      ]}
    >
      <Image
        source={ICON_SOURCES[name]}
        style={styles.image}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
