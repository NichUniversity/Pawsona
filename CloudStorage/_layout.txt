import type {
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { withLayoutContext } from 'expo-router';
import React from 'react';
import { Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import { PawsonaTabIcon } from '../../components/ui/pawsona-tab-icons';

const { Navigator } = createMaterialTopTabNavigator();

// Shared with adventure_tab.tsx: whenever a screen needs to reset the tab
// bar back to its normal floating-pill look via navigation.setOptions, it
// must re-apply this object rather than passing `undefined` — undefined
// clobbers the pill styling below instead of falling back to it.
export const PILL_TAB_BAR_STYLE = {
  position: 'absolute' as const,
  left: 16,
  right: 16,
  height: 58,
  borderRadius: 24,
  backgroundColor: 'rgba(65, 63, 63, 0.85)',
  borderTopWidth: 0,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
  elevation: 8,
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
  const isTransitioning = React.useRef(false);

  return (
    <Tabs 
      style={{ backgroundColor: '#FF8C42' }}  
      tabBarPosition="bottom"
      initialLayout={{ width: screenWidth }}
      screenListeners={{
        tabPress: (e) => {
          if (isTransitioning.current) {
            e.preventDefault();
            return;
          }

          isTransitioning.current = true;
          if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }

          // Roughly matches the material-top-tabs transition duration.
          setTimeout(() => {
            isTransitioning.current = false;
          }, 350);
        },
      }}
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true,
        
        tabBarShowIcon: true,
        tabBarShowLabel: true,
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
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          textTransform: 'none',
          marginTop: 2,
        },
        tabBarStyle: {
          ...PILL_TAB_BAR_STYLE,
          bottom: insets.bottom > 0 ? insets.bottom + 8 : 16,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="home" color={color} size={26} />
          ),
        }}
      />

      <Tabs.Screen
        name="daily_log_tab"
        options={{
          title: 'Daily Paw Log',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="daily-log" color={color} size={26} />
          ),
        }}
      />

      <Tabs.Screen
        name="minigames"
        options={{
          title: 'Mini Games',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="minigames" color={color} size={26} />
          ),
        }}
      />

      <Tabs.Screen
        name="store_tab"
        options={{
          title: 'Paw Shop',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="store" color={color} size={26} />
          ),
        }}
      />

      <Tabs.Screen
        name="adventure_tab"
        options={{
          title: 'Adventure',
          tabBarIcon: ({ color }) => (
            <PawsonaTabIcon name="adventure" color={color} size={26} />
          ),
        }}
      />
    </Tabs>
  );
}