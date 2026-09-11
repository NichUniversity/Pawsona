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
  /** True for the focused tab — since these flat illustrations can't be tinted, "lit up" is an opacity/scale bump instead. */
  active?: boolean;
};

// One hand-drawn sticker per tab; no background or label baked in (the tab bar and React Navigation handle those).
const ICON_SOURCES: Record<PawsonaIconName, ImageSourcePropType> = {
  home: require('../../assets/images/tab-home.png'),
  'daily-log': require('../../assets/images/tab-paw-log.png'),
  minigames: require('../../assets/images/tab-games.png'),
  store: require('../../assets/images/tab-shop.png'),
  adventure: require('../../assets/images/tab-adventure.png'),
};

export function PawsonaTabIcon({ name, size = 34, active = false }: Props) {
  // Animates the dim/lift instead of snapping, same "pop" language used elsewhere in the app.
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
