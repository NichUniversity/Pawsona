import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

import { ONBOARDING_STORAGE_KEY } from "../constants/onboarding";

type OnboardingContextType = {
  showOnboarding: boolean;
  finishOnboarding: () => void;
  replayOnboarding: () => void;
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

// Lifted out of the tabs layout so the Home tab's Settings menu can also
// trigger a replay, without both places duplicating the AsyncStorage check.
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!done) {
          setShowOnboarding(true);
        }
      } catch {
        // If storage isn't available, just skip the tutorial rather than
        // blocking the app from loading.
      }
    })();
  }, []);

  const finishOnboarding = () => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true").catch(() => {
      // Ignore — worst case the tutorial shows again next launch.
    });
  };

  const replayOnboarding = () => {
    setShowOnboarding(true);
  };

  return (
    <OnboardingContext.Provider
      value={{ showOnboarding, finishOnboarding, replayOnboarding }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error("useOnboarding must be used inside OnboardingProvider.");
  }

  return context;
}
