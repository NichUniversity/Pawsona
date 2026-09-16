import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { createContext, useContext, useEffect, useState } from "react";

const SETTINGS_STORAGE_KEY = "pawsona_settings_v1";

type PersistedSettings = {
  hapticsEnabled: boolean;
  livingHomeScreen: boolean;
};

const DEFAULT_SETTINGS: PersistedSettings = {
  hapticsEnabled: true,
  livingHomeScreen: true,
};

type SettingsContextType = {
  /** Whether PressableScale (and anything else that asks) should fire a haptic tick. Defaults on. */
  hapticsEnabled: boolean;
  setHapticsEnabled: (value: boolean) => void;
  /** Fires a light haptic impact only if hapticsEnabled is on; swallows errors on unsupported hardware. */
  triggerHaptic: (style?: Haptics.ImpactFeedbackStyle) => void;
  /**
   * Whether the Home tab shows the animated PetRoomBackground scene (ambling pet,
   * fireflies) or falls back to the plain static TabBackground gradient. Independent
   * of the theme accent color — flipping this off never changes ThemeContext, it only
   * decides which background component Home renders. Defaults on.
   */
  livingHomeScreen: boolean;
  setLivingHomeScreen: (value: boolean) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

// App-wide "quality of life" preferences, separate from ThemeContext (colors) and AuthContext (session).
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(
    DEFAULT_SETTINGS.hapticsEnabled
  );
  const [livingHomeScreen, setLivingHomeScreenState] = useState<boolean>(
    DEFAULT_SETTINGS.livingHomeScreen
  );
  const hydrated = React.useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<PersistedSettings>;
          if (typeof saved.hapticsEnabled === "boolean") {
            setHapticsEnabledState(saved.hapticsEnabled);
          }
          if (typeof saved.livingHomeScreen === "boolean") {
            setLivingHomeScreenState(saved.livingHomeScreen);
          }
        }
      } catch {
        // Fall back to the defaults already set above.
      } finally {
        hydrated.current = true;
      }
    })();
  }, []);

  const setHapticsEnabled = (value: boolean) => {
    setHapticsEnabledState(value);
    // Read-modify-write so concurrent settings saves can't clobber each other.
    AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      .then((raw) => {
        const current = raw ? JSON.parse(raw) : {};
        return AsyncStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({ ...current, hapticsEnabled: value })
        );
      })
      .catch(() => {
        // Worst case the choice doesn't persist across a relaunch.
      });
  };

  const setLivingHomeScreen = (value: boolean) => {
    setLivingHomeScreenState(value);
    AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      .then((raw) => {
        const current = raw ? JSON.parse(raw) : {};
        return AsyncStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify({ ...current, livingHomeScreen: value })
        );
      })
      .catch(() => {
        // Worst case the choice doesn't persist across a relaunch.
      });
  };

  const triggerHaptic: SettingsContextType["triggerHaptic"] = (style) => {
    if (!hapticsEnabled) return;
    try {
      Haptics.impactAsync(style ?? Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Unsupported device/simulator — a missed tick is never worth a crash.
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        hapticsEnabled,
        setHapticsEnabled,
        triggerHaptic,
        livingHomeScreen,
        setLivingHomeScreen,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings must be used inside SettingsProvider.");
  }

  return context;
}
