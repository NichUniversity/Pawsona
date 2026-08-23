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
import { ThemeProvider as AccentThemeProvider, useTheme } from '../context/ThemeContext';

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
  // AccentThemeProvider wraps everything, including the font-loading gate
  // below, so even that first flash of screen (before Fredoka is ready)
  // uses the right background instead of a hardcoded color.
  return (
    <AccentThemeProvider>
      <RootLayoutFonts />
    </AccentThemeProvider>
  );
}

function RootLayoutFonts() {
  const { theme } = useTheme();
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.background.mid }} />;
  }

  return (
    <AuthProvider>
      <PetProvider>
        <OnboardingProvider>
          <RootLayoutGate />
        </OnboardingProvider>
      </PetProvider>
    </AuthProvider>
  );
}

// Sits below AuthProvider so it can read auth state: shows a blank loader
// while the stored session is being checked, the login screen if nobody's
// signed in (or chosen guest) yet, and the normal tab stack once they have.
function RootLayoutGate() {
  const { theme } = useTheme();
  const { isReady, user } = useAuth();

  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: theme.background.mid }} />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <ThemeProvider value={theme.isDark ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.background.mid },
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
      </Stack>

      <StatusBar style={theme.statusBarStyle} />
    </ThemeProvider>
  );
}
