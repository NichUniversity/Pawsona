import {
  Fredoka_400Regular,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
  useFonts,
} from '@expo-google-fonts/fredoka';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, View } from 'react-native';
import 'react-native-reanimated';

import { LoginScreen } from '../components/ui/LoginScreen';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { OnboardingProvider } from '../context/OnboardingContext';
import { PetProvider } from '../context/PetInformation';
import { ThemeProvider as AccentThemeProvider } from '../context/ThemeContext';
import { useColorScheme } from '../hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Known false-positive from react-native-reanimated: its Babel plugin
// scans every file for shared-value-in-inline-style patterns once
// reanimated is present anywhere in the project (it's a transitive
// dependency of react-navigation's tab bar here), and it misfires on
// plain React Native `Animated` usage — like the fade/glow animations on
// the Home tab — even though we never touch reanimated's API there.
// Confirmed cosmetic upstream: software-mansion/react-native-reanimated#5094.
LogBox.ignoreLogs([
  "shared value's .value inside reanimated inline style",
]);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#FF8C42' }} />;
  }

  return (
    <AccentThemeProvider>
      <AuthProvider>
        <PetProvider>
          <OnboardingProvider>
            <RootLayoutGate />
          </OnboardingProvider>
        </PetProvider>
      </AuthProvider>
    </AccentThemeProvider>
  );
}

// Sits below AuthProvider so it can read auth state: shows a blank loader
// while the stored session is being checked, the login screen if nobody's
// signed in (or chosen guest) yet, and the normal tab stack once they have.
function RootLayoutGate() {
  const colorScheme = useColorScheme();
  const { isReady, user } = useAuth();

  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: '#FF8C42' },
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}