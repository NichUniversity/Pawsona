import type {
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { withLayoutContext } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import { OnboardingTutorial } from '../../components/ui/OnboardingTutorial';
import { PawsonaTabIcon } from '../../components/ui/pawsona-tab-icons';
import { useOnboarding } from '../../context/OnboardingContext';

const { Navigator } = createMaterialTopTabNavigator();

// How long swiping (and tab-bar taps) are locked out after any tab change,
// tap- or swipe-triggered, before the next one is allowed to start. This
// is the Instagram-style "small delay" — instead of letting a second
// swipe start while the pager is still mid-settle from the first one
// (which is what triggers the partial-page bug, a known open issue in
// react-native-tab-view on iOS: react-navigation/react-navigation#11088),
// we give the native pager a beat to fully finish before accepting input
// again. Tune this down for snappier feel / up if the glitch reappears —
// just don't drop it too far below the pager's own settle time (~250ms)
// or the bug has room to sneak back in. We're already close to that floor
// here, so if swiping starts glitching again, this is the first thing to
// raise back up.
const TRANSITION_LOCK_MS = 220;

// Shared with adventure_tab.tsx: whenever a screen needs to reset the tab
// bar back to its normal resting look via navigation.setOptions, it must
// re-apply this object rather than passing `undefined` — undefined
// clobbers this styling below instead of falling back to it.
//
// Instagram/Snapchat-style flat bar: edge-to-edge, flush against the
// bottom of the screen, solid black with just a hairline top border
// instead of the old floating rounded "pill" with a drop shadow. Height
// and paddingBottom are added per-instance (see below) since they depend
// on the device's safe-area inset.
export const PILL_TAB_BAR_STYLE = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: 0,
  backgroundColor: '#000000',
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: 'rgba(255,255,255,0.12)',
  shadowOpacity: 0,
  elevation: 0,
};

export const Tabs = withLayoutContext <
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;

  // isTransitioningRef backs the synchronous tabPress check (refs don't
  // lag behind a render); swipeEnabled is the same lock mirrored into
  // state, since it has to be a real prop value for the pager to react to.
  const isTransitioningRef = useRef(false);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [swipeEnabled, setSwipeEnabled] = useState(true);

  const lockTransition = () => {
    isTransitioningRef.current = true;
    setSwipeEnabled(false);

    if (lockTimeoutRef.current) {
      clearTimeout(lockTimeoutRef.current);
    }
    lockTimeoutRef.current = setTimeout(() => {
      isTransitioningRef.current = false;
      setSwipeEnabled(true);
    }, TRANSITION_LOCK_MS);
  };

  const { showOnboarding, finishOnboarding } = useOnboarding();

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      style={{ backgroundColor: '#000000' }}
      tabBarPosition="bottom"
      initialLayout={{ width: screenWidth }}
      screenListeners={{
        tabPress: (e) => {
          if (isTransitioningRef.current) {
            e.preventDefault();
            return;
          }

          if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }

          lockTransition();
        },
        // Fires on any focused-tab change, whether from a tap or a swipe
        // that just settled — this is what catches the swipe-triggered
        // case tabPress alone can't see.
        state: () => {
          lockTransition();
        },
      }}
      screenOptions={{
        swipeEnabled,
        animationEnabled: true,

        // Only mount the focused screen plus one neighbor on each side
        // instead of all five tabs at once. With every tab's animations
        // (glow pulses, background gradients, minigame state, etc.) all
        // running simultaneously, the JS thread falls behind during a
        // fast swipe and the native PagerView's position can end up
        // ahead of what React Navigation thinks is focused — that's the
        // "stuck" / wrong-tab-highlighted symptom. Lazy-mounting keeps
        // far-away tabs from competing for the thread during the swipe.
        lazy: true,
        lazyPreloadDistance: 1,

        tabBarShowIcon: true,
        tabBarShowLabel: false,
        tabBarIndicatorStyle: { height: 0 },
        tabBarPressColor: 'transparent',
        tabBarPressOpacity: 1,

        // Pure grey/white palette so icons read as black & white against the dark bar
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#8d8d90',

        tabBarItemStyle: {
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        },
        tabBarStyle: {
          ...PILL_TAB_BAR_STYLE,
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="home" color={color} size={32} />
          ),
        }}
      />

      <Tabs.Screen
        name="daily_log_tab"
        options={{
          title: 'Daily Paw Log',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="daily-log" color={color} size={32} />
          ),
        }}
      />

      <Tabs.Screen
        name="minigames"
        options={{
          title: 'Mini Games',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="minigames" color={color} size={32} />
          ),
        }}
      />

      <Tabs.Screen
        name="store_tab"
        options={{
          title: 'Paw Shop',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="store" color={color} size={32} />
          ),
        }}
      />

      <Tabs.Screen
        name="adventure_tab"
        options={{
          title: 'Adventure',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="adventure" color={color} size={32} />
          ),
        }}
      />
    </Tabs>

    <OnboardingTutorial visible={showOnboarding} onFinish={finishOnboarding} />
    </View>
  );
}