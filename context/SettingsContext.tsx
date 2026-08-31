import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { createContext, useContext, useEffect, useState } from "react";

const SETTINGS_STORAGE_KEY = "pawsona_settings_v1";

type PersistedSettings = {
  hapticsEnabled: boolean;
};

const DEFAULT_SETTINGS: PersistedSettings = {
  hapticsEnabled: true,
};

type SettingsContextType = {
  /** Whether PressableScale (and anything else that asks) should fire a
   *  haptic tick. Defaults on — most similar apps ship haptics on by
   *  default and let you turn them off, not the other way around. */
  hapticsEnabled: boolean;
  setHapticsEnabled: (value: boolean) => void;
  /** Fires a light haptic impact if — and only if — hapticsEnabled is on.
   *  Swallow-safe: Haptics can throw on simulators/unsupported hardware,
   *  and a settings toggle should never be able to crash a button press. */
  triggerHaptic: (style?: Haptics.ImpactFeedbackStyle) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

// App-wide "quality of life" preferences (Settings sheet), separate from
// ThemeContext (which owns colors) and AuthContext (which owns the
// session) — this is the home for toggles that don't belong in either.
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(
    DEFAULT_SETTINGS.hapticsEnabled
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
    // Read-modify-write so a future second setting can't clobber this one
    // (or vice versa) if both happen to save around the same time.
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
      value={{ hapticsEnabled, setHapticsEnabled, triggerHaptic }}
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
