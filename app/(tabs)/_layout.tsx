import type {
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { withLayoutContext } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Dimensions, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import { OnboardingTutorial } from '../../components/ui/OnboardingTutorial';
import { PawsonaTabIcon } from '../../components/ui/pawsona-tab-icons';
import { useOnboarding } from '../../context/OnboardingContext';
import { ThemeDefinition, useTheme } from '../../context/ThemeContext';

const { Navigator } = createMaterialTopTabNavigator();

// Lockout after a tab change to avoid the pager's partial-page bug (react-navigation/react-navigation#11088); raise toward 220-250 first if the glitch reappears.
const TRANSITION_LOCK_MS = 160;

// Shorter, separate window to stop a single tap's haptic from double-buzzing (tabPress fires, then "state" fires again on commit).
const HAPTIC_DEDUPE_MS = 80;

// Shared with adventure_tab.tsx: re-apply this style (never pass `undefined`, which clobbers it) with the live theme when resetting the tab bar; keep in sync with useTabBarClearance.ts's TAB_BAR_HEIGHT.
const PILL_HEIGHT = 64;
// Inset from screen edges — kept small since the bar has no background/shadow, maximizing row width for icons and labels.
const PILL_SIDE_MARGIN = 12;
const PILL_BOTTOM_MARGIN = 14;

// Floating but transparent (no pill fill/shadow) — just icons/labels lifted off the bottom edge.
export function getTabBarStyle(theme: ThemeDefinition, bottomInset: number) {
  return {
    position: 'absolute' as const,
    left: PILL_SIDE_MARGIN,
    right: PILL_SIDE_MARGIN,
    bottom: PILL_BOTTOM_MARGIN + bottomInset,
    height: PILL_HEIGHT,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    paddingBottom: 0,
  };
}

export const Tabs = withLayoutContext <
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const { theme } = useTheme();

  // isTransitioningRef backs the synchronous tabPress check; swipeEnabled mirrors it into state so the pager prop can react.
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

  // Separate from the transition lock: stops tabPress+state from double-buzzing, without gating the haptic on that longer lock.
  const recentHapticRef = useRef(false);
  const hapticResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireHaptic = () => {
    if (recentHapticRef.current) {
      return;
    }
    recentHapticRef.current = true;

    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (hapticResetTimeoutRef.current) {
      clearTimeout(hapticResetTimeoutRef.current);
    }
    hapticResetTimeoutRef.current = setTimeout(() => {
      recentHapticRef.current = false;
    }, HAPTIC_DEDUPE_MS);
  };

  const { showOnboarding, finishOnboarding } = useOnboarding();

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      style={{ backgroundColor: theme.tabBar.background }}
      tabBarPosition="bottom"
      initialLayout={{ width: screenWidth }}
      screenListeners={{
        tabPress: (e: { preventDefault: () => void }) => {
          // Always acknowledge the touch, even if the transition itself gets debounced away.
          fireHaptic();

          if (isTransitioningRef.current) {
            e.preventDefault();
            return;
          }

          lockTransition();
        },
        // Fires on any focused-tab change, catching the swipe-triggered case tabPress alone can't see.
        state: () => {
          fireHaptic();
          lockTransition();
        },
      }}
      screenOptions={{
        swipeEnabled,
        animationEnabled: true,

        // Lazy-mounts only the focused tab + 1 neighbor, avoiding the JS-thread overload from all five tabs' animations running at once (which caused a "stuck"/wrong-tab-highlighted bug).
        lazy: true,
        lazyPreloadDistance: 1,

        tabBarShowIcon: true,
        // Labels are back on to match the new sticker icons (previously off when icons were plain line art).
        tabBarShowLabel: true,
        tabBarIndicatorStyle: { height: 0 },
        tabBarPressColor: 'transparent',
        tabBarPressOpacity: 1,

        // Tint colors follow the theme for the text label only — icon art can't be tinted, so it uses opacity/scale instead.
        tabBarActiveTintColor: theme.tabBar.activeTint,
        tabBarInactiveTintColor: theme.tabBar.inactiveTint,
        tabBarLabelStyle: {
          fontFamily: 'Fredoka_700Bold',
          fontSize: 8,
          textTransform: 'uppercase',
          letterSpacing: 0,
          marginTop: 2,
        },

        tabBarItemStyle: {
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        },
        tabBarStyle: getTabBarStyle(theme, insets.bottom),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="home" size={30} active={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="daily_log_tab"
        options={{
          title: 'Daily Paw Log',
          tabBarLabel: 'Paw Log',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="daily-log" size={30} active={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="minigames"
        options={{
          title: 'Mini Games',
          tabBarLabel: 'Games',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="minigames" size={30} active={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="store_tab"
        options={{
          title: 'Paw Shop',
          tabBarLabel: 'Shop',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="store" size={30} active={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="adventure_tab"
        options={{
          title: 'Adventure',
          tabBarLabel: 'Adventure',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="adventure" size={30} active={focused} />
          ),
        }}
      />
    </Tabs>

    <OnboardingTutorial visible={showOnboarding} onFinish={finishOnboarding} />
    </View>
  );
}