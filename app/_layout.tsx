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
import { SettingsProvider } from '../context/SettingsContext';
import { ThemeProvider as AccentThemeProvider, useTheme } from '../context/ThemeContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Known cosmetic false-positive from react-native-reanimated misfiring on plain RN `Animated` usage (upstream issue #5094).
LogBox.ignoreLogs([
  "shared value's .value inside reanimated inline style",
]);

export default function RootLayout() {
  // Wraps everything, including the font-loading gate, so the first screen flash uses the right background.
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
    <SettingsProvider>
      <AuthProvider>
        <PetProvider>
          <OnboardingProvider>
            <RootLayoutGate />
          </OnboardingProvider>
        </PetProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

// Shows a blank loader while checking session, the login screen if not signed in, otherwise the tab stack.
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
