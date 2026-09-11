import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { CATEGORY_LABELS, COSMETICS, CosmeticCategory } from "../data/cosmetics";
import { PetCategory } from "../data/petcategories";

export type AttributeRatings = {
  intelligence: number;
  speed: number;
  mischief: number;
  strength: number;
  energy: number;
};

export type PawLogEntry = {
  id: string;
  event: string;
  date: string;
};

export type { CosmeticCategory };

// One equipped-item slot per cosmetic category from data/cosmetics.ts.
export type EquippedCosmetics = Record<CosmeticCategory, string | null>;

export type PetEntry = {
  id: string;
  photoUri: string | null;
  category: PetCategory | null;
  selectedEmoji: string | null;
  color: string | null;
  name: string;
  backstory: string;
  confirmed: boolean;
  ratings: AttributeRatings;
  logs: PawLogEntry[];
  ownedCosmetics: string[];
  equippedCosmetics: EquippedCosmetics;
};

export const EMPTY_RATINGS: AttributeRatings = {
  intelligence: 0,
  speed: 0,
  mischief: 0,
  strength: 0,
  energy: 0,
};

// "avatar"-category cosmetics are account-wide once bought; used only to migrate ids recorded per-pet before this was global.
const AVATAR_COSMETIC_IDS = new Set(
  COSMETICS.filter((item) => item.category === "avatar").map((item) => item.id)
);

export const EMPTY_EQUIPPED: EquippedCosmetics = (
  Object.keys(CATEGORY_LABELS) as CosmeticCategory[]
).reduce((acc, category) => {
  acc[category] = null;
  return acc;
}, {} as EquippedCosmetics);

export const STARTING_COINS = 50;

export const makeEmptyEntry = (): PetEntry => ({
  id: `pet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  photoUri: null,
  category: null,
  selectedEmoji: null,
  color: null,
  name: "",
  backstory: "",
  confirmed: false,
  ratings: { ...EMPTY_RATINGS },
  logs: [],
  ownedCosmetics: [],
  equippedCosmetics: { ...EMPTY_EQUIPPED },
});

// --- Daily streak + reward ---
// Reward grows through day 7, then the schedule repeats. Missing a full
// calendar day resets the streak to day 1.
export const DAILY_REWARD_SCHEDULE = [10, 15, 20, 25, 30, 40, 60];

function rewardForStreak(streakDay: number): number {
  const index = (streakDay - 1) % DAILY_REWARD_SCHEDULE.length;
  return DAILY_REWARD_SCHEDULE[index];
}

// YYYY-MM-DD in the device's local calendar.
function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Whole-day gap between two YYYY-MM-DD keys.
function daysBetweenKeys(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// The streak value claiming right now would produce.
function nextStreakValue(
  lastClaimDate: string | null,
  currentStreak: number,
  today: string
): number {
  if (!lastClaimDate) return 1;
  const gap = daysBetweenKeys(lastClaimDate, today);
  if (gap <= 0) return currentStreak; // already claimed today
  if (gap === 1) return currentStreak + 1; // picked up right on schedule
  return 1; // missed at least one full day — back to day 1
}

const PET_STATE_STORAGE_KEY = "pawsona_pet_state_v1";

type PersistedPetState = {
  pets: PetEntry[];
  coins: number;
  unlockedAreas: string[];
  hasBookOfOrigin: boolean;
  hasBondKeeper: boolean;
  /** Avatar-category cosmetic ids owned account-wide (see AVATAR_COSMETIC_IDS). */
  unlockedAvatars: string[];
  streak: number;
  longestStreak: number;
  lastClaimDate: string | null;
  /** @deprecated old field name for hasBookOfOrigin — read once for migration, never written. */
  hasStorybook?: boolean;
};

type PetContextType = {
  pets: PetEntry[];
  setPets: React.Dispatch<React.SetStateAction<PetEntry[]>>;
  coins: number;
  earnCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  unlockedAreas: string[];
  unlockArea: (areaName: string, price: number) => boolean;
  /** True once a pet has found the Book of Origin; gates the AI-assisted Origin Story wizard (the plain backstory box stays open regardless). */
  hasBookOfOrigin: boolean;
  unlockBookOfOrigin: () => void;
  /** True once the Bond Keeper is found — placeholder, not yet wired to any adventure content. */
  hasBondKeeper: boolean;
  unlockBondKeeper: () => void;
  /** Avatar-category cosmetic ids owned account-wide; other cosmetics stay per-pet on PetEntry.ownedCosmetics. */
  unlockedAvatars: string[];
  unlockAvatar: (itemId: string) => void;
  /** Current consecutive-day login streak (0 before the very first claim). */
  streak: number;
  /** Longest streak ever reached, for a little bragging-rights display. */
  longestStreak: number;
  /** True once per calendar day until claimDailyReward() is called. */
  canClaimDailyReward: boolean;
  /** The streak day (and its coin reward) tapping claim right now would land on. */
  previewStreak: number;
  previewReward: number;
  /** Grants the day's coins, advances/resets the streak, and returns the amount awarded (0 if already claimed today). */
  claimDailyReward: () => number;
  /** True once saved state has finished loading from disk — check before acting on canClaimDailyReward. */
  isHydrated: boolean;
  /** Resets every pet/coin/streak field to fresh-install defaults and clears the on-disk copy — used by "Delete Account". */
  resetAllData: () => Promise<void>;
};

const PetContext = createContext<PetContextType | undefined>(undefined);

export function PetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pets, setPets] = useState<PetEntry[]>([makeEmptyEntry()]);
  const [coins, setCoins] = useState<number>(STARTING_COINS);
  const [unlockedAreas, setUnlockedAreas] = useState<string[]>([
    "Magical Forest",
  ]);
  const [hasBookOfOrigin, setHasBookOfOrigin] = useState<boolean>(false);
  const [hasBondKeeper, setHasBondKeeper] = useState<boolean>(false);
  const [unlockedAvatars, setUnlockedAvatars] = useState<string[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [longestStreak, setLongestStreak] = useState<number>(0);
  const [lastClaimDate, setLastClaimDate] = useState<string | null>(null);

  // Guards the save effect from firing with default state before load runs.
  const hydrated = useRef(false);
  // Re-render-triggering mirror of the ref above, exposed as `isHydrated`.
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PET_STATE_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<PersistedPetState>;
          if (saved.pets?.length) setPets(saved.pets);
          if (typeof saved.coins === "number") setCoins(saved.coins);
          if (saved.unlockedAreas) setUnlockedAreas(saved.unlockedAreas);
          // hasBookOfOrigin used to be saved as "hasStorybook" — fall back to that for old saves.
          if (saved.hasBookOfOrigin || saved.hasStorybook) {
            setHasBookOfOrigin(true);
          }
          if (saved.hasBondKeeper) setHasBondKeeper(true);

          // Merge the saved global list with avatar ids recorded per-pet before this was account-wide.
          const migratedAvatars = new Set(saved.unlockedAvatars ?? []);
          (saved.pets ?? []).forEach((pet) => {
            pet.ownedCosmetics?.forEach((id) => {
              if (AVATAR_COSMETIC_IDS.has(id)) migratedAvatars.add(id);
            });
          });
          if (migratedAvatars.size > 0) {
            setUnlockedAvatars(Array.from(migratedAvatars));
          }

          if (typeof saved.streak === "number") setStreak(saved.streak);
          if (typeof saved.longestStreak === "number") {
            setLongestStreak(saved.longestStreak);
          }
          if (saved.lastClaimDate) setLastClaimDate(saved.lastClaimDate);
        }
      } catch {
        // Keep the defaults already set above.
      } finally {
        hydrated.current = true;
        setIsHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;

    const snapshot: PersistedPetState = {
      pets,
      coins,
      unlockedAreas,
      hasBookOfOrigin,
      hasBondKeeper,
      unlockedAvatars,
      streak,
      longestStreak,
      lastClaimDate,
    };
    AsyncStorage.setItem(
      PET_STATE_STORAGE_KEY,
      JSON.stringify(snapshot)
    ).catch(() => {});
  }, [
    pets,
    coins,
    unlockedAreas,
    hasBookOfOrigin,
    hasBondKeeper,
    unlockedAvatars,
    streak,
    longestStreak,
    lastClaimDate,
  ]);

  const earnCoins = (amount: number) => {
    setCoins((prev) => prev + amount);
  };

  const spendCoins = (amount: number) => {
    if (coins < amount) return false;
    setCoins((prev) => prev - amount);
    return true;
  };

  const unlockArea = (areaName: string, price: number) => {
    if (unlockedAreas.includes(areaName)) return true;

    const success = spendCoins(price);
    if (success) {
      setUnlockedAreas((prev) => [...prev, areaName]);
    }
    return success;
  };

  const unlockBookOfOrigin = () => {
    setHasBookOfOrigin(true);
  };

  // Placeholder — nothing calls this yet; wire it up once the hardest adventure grants the Bond Keeper.
  const unlockBondKeeper = () => {
    setHasBondKeeper(true);
  };

  const unlockAvatar = (itemId: string) => {
    setUnlockedAvatars((prev) =>
      prev.includes(itemId) ? prev : [...prev, itemId]
    );
  };

  const today = localDateKey(new Date());
  const canClaimDailyReward = lastClaimDate !== today;
  const previewStreak = nextStreakValue(lastClaimDate, streak, today);
  const previewReward = rewardForStreak(previewStreak);

  const claimDailyReward = (): number => {
    if (!canClaimDailyReward) return 0;

    const nextStreak = nextStreakValue(lastClaimDate, streak, today);
    const reward = rewardForStreak(nextStreak);

    earnCoins(reward);
    setStreak(nextStreak);
    setLongestStreak((prev) => Math.max(prev, nextStreak));
    setLastClaimDate(today);

    return reward;
  };

  // Wipes pet/coin/streak fields to fresh-install defaults for "Delete Account"; doesn't touch auth or device-level preferences.
  const resetAllData = async () => {
    setPets([makeEmptyEntry()]);
    setCoins(STARTING_COINS);
    setUnlockedAreas(["Magical Forest"]);
    setHasBookOfOrigin(false);
    setHasBondKeeper(false);
    setUnlockedAvatars([]);
    setStreak(0);
    setLongestStreak(0);
    setLastClaimDate(null);
    await AsyncStorage.removeItem(PET_STATE_STORAGE_KEY);
  };

  return (
    <PetContext.Provider
      value={{
        pets,
        setPets,
        coins,
        earnCoins,
        spendCoins,
        unlockedAreas,
        unlockArea,
        hasBookOfOrigin,
        unlockBookOfOrigin,
        hasBondKeeper,
        unlockBondKeeper,
        unlockedAvatars,
        unlockAvatar,
        streak,
        longestStreak,
        canClaimDailyReward,
        previewStreak,
        previewReward,
        claimDailyReward,
        isHydrated,
        resetAllData,
      }}
    >
      {children}
    </PetContext.Provider>
  );
}

export function usePets() {
  const context = useContext(PetContext);

  if (!context) {
    throw new Error("usePets must be used inside PetInformation.");
  }

  return context;
}
