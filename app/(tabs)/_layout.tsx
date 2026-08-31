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

// How long swiping (and tab-bar taps) are locked out after any tab change,
// tap- or swipe-triggered, before the next one is allowed to start. This
// is the Instagram-style "small delay" — instead of letting a second
// swipe start while the pager is still mid-settle from the first one
// (which is what triggers the partial-page bug, a known open issue in
// react-native-tab-view on iOS: react-navigation/react-navigation#11088),
// we give the native pager a beat to fully finish before accepting input
// again. Tune this down for snappier feel / up if the glitch reappears —
// just don't drop it too far below the pager's own settle time (~250ms)
// or the bug has room to sneak back in. We're now BELOW that settle-time
// floor purely to keep things snappy — if the partial-swipe glitch comes
// back, raise this toward 220-250 first before changing anything else.
const TRANSITION_LOCK_MS = 160;

// Shared with adventure_tab.tsx: whenever a screen needs to reset the tab
// bar back to its normal resting look via navigation.setOptions, it must
// re-apply this style rather than passing `undefined` — undefined clobbers
// this styling below instead of falling back to it. Call this with the
// current theme (from useTheme()) rather than reaching for a static
// constant, so the reset always matches whatever theme is active instead
// of snapping back to a hardcoded color.
//
// Keep these two in sync with hooks/useTabBarClearance.ts's TAB_BAR_HEIGHT
// (which should equal PILL_HEIGHT + PILL_BOTTOM_MARGIN below) — that hook
// is what keeps scrollable tab screens from letting content scroll behind
// the floating pill.
const PILL_HEIGHT = 64;
// Wider inset than a typical floating pill — this is what makes the bar
// narrower/more compact horizontally (PokiPet's small bar look) while
// keeping the height/icon size from the previous pass.
const PILL_SIDE_MARGIN = 60;
const PILL_BOTTOM_MARGIN = 14;

// PokiPet-style floating pill: fully rounded, lifted off the bottom edge
// with margin on all three sides, solid theme-colored background and a
// soft drop shadow — instead of the old Instagram/Snapchat-style bar that
// sat edge-to-edge and flush against the bottom of the screen.
export function getTabBarStyle(theme: ThemeDefinition, bottomInset: number) {
  return {
    position: 'absolute' as const,
    left: PILL_SIDE_MARGIN,
    right: PILL_SIDE_MARGIN,
    bottom: PILL_BOTTOM_MARGIN + bottomInset,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: theme.tabBar.background,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
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
      style={{ backgroundColor: theme.tabBar.background }}
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
        // The new sticker icons come from the same reference sheet as
        // their label ("HOME", "PAW LOG", ...), so this turns the label
        // back on to match — it had been off while the icons were plain
        // line art with nothing but color to identify each tab.
        tabBarShowLabel: true,
        tabBarIndicatorStyle: { height: 0 },
        tabBarPressColor: 'transparent',
        tabBarPressOpacity: 1,

        // Tint colors still follow the active theme for the text label —
        // the icon art itself is full-color now and can't be tinted (see
        // pawsona-tab-icons.tsx), so it uses opacity/scale for its own
        // active state instead.
        tabBarActiveTintColor: theme.tabBar.activeTint,
        tabBarInactiveTintColor: theme.tabBar.inactiveTint,
        tabBarLabelStyle: {
          fontFamily: 'Fredoka_700Bold',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
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
            <PawsonaTabIcon name="home" size={34} active={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="daily_log_tab"
        options={{
          title: 'Daily Paw Log',
          tabBarLabel: 'Paw Log',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="daily-log" size={34} active={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="minigames"
        options={{
          title: 'Mini Games',
          tabBarLabel: 'Games',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="minigames" size={34} active={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="store_tab"
        options={{
          title: 'Paw Shop',
          tabBarLabel: 'Shop',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="store" size={34} active={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="adventure_tab"
        options={{
          title: 'Adventure',
          tabBarLabel: 'Adventure',
          tabBarIcon: ({ focused }) => (
            <PawsonaTabIcon name="adventure" size={34} active={focused} />
          ),
        }}
      />
    </Tabs>

    <OnboardingTutorial visible={showOnboarding} onFinish={finishOnboarding} />
    </View>
  );
}