import type {
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from 'expo-router/js-top-tabs';
import { createMaterialTopTabNavigator } from 'expo-router/js-top-tabs';
import type { ParamListBase, TabNavigationState } from 'expo-router/react-navigation';
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

// Separate, much shorter window just to stop a single logical tap from
// double-buzzing (tabPress fires immediately, then "state" fires again
// once the focus change actually commits). Deliberately NOT the same
// value as TRANSITION_LOCK_MS above — that lock exists to swallow the
// *navigation* on a rapid repeat tap (dodging the partial-swipe bug), but
// the tap itself should still feel like it landed, so haptic isn't gated
// on that longer lock at all.
const HAPTIC_DEDUPE_MS = 80;

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
// Inset from the screen edges. Now that the bar has no background/shadow
// of its own (see getTabBarStyle below), there's no floating-pill shape
// to look odd sitting close to the screen edges, so this can stay small —
// which maximizes the row width for bigger icons and one-line labels.
const PILL_SIDE_MARGIN = 12;
const PILL_BOTTOM_MARGIN = 14;

// Floating, but transparent now instead of the solid PokiPet-style pill —
// no background fill and no drop shadow, just the icons/labels themselves
// lifted off the bottom edge. Dropping the pill shape freed up room to
// size the icons up and gave labels enough width to stay on one line.
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

  // Deliberately separate from isTransitioningRef/lockTransition above.
  // tabPress and "state" both fire for a single tap (tabPress immediately,
  // then state once the new tab commits) — this is just what stops that
  // pair from double-buzzing. It does NOT gate on the transition lock, so
  // a tap that lands *during* the lock (and gets its navigation swallowed
  // to dodge the partial-swipe bug) still gets its own haptic — the touch
  // should always feel like it registered, even when the page-change
  // itself is being intentionally debounced.
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
          // Always acknowledge the touch, even if the transition below
          // ends up getting debounced away — see fireHaptic's comment.
          fireHaptic();

          if (isTransitioningRef.current) {
            e.preventDefault();
            return;
          }

          lockTransition();
        },
        // Fires on any focused-tab change, whether from a tap or a swipe
        // that just settled — this is what catches the swipe-triggered
        // case tabPress alone can't see.
        state: () => {
          fireHaptic();
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