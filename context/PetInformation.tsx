import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

import { CATEGORY_LABELS, CosmeticCategory } from "../data/cosmetics";
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

// Kept as an alias so any existing `import { CosmeticCategory } from
// ".../PetInformation"` (if one ever creeps back in) still resolves — the
// real source of truth is data/cosmetics.ts, which the Store tab already
// imports from directly.
export type { CosmeticCategory };

// One equipped-item slot per cosmetic category, built from the same
// category list the Store uses — adding a new category to
// data/cosmetics.ts (e.g. a future "toy" or "bed" slot) only needs to
// happen in one place instead of being kept in sync by hand here too.
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

// --- Daily streak + reward -------------------------------------------
//
// Coins grow the longer the streak runs (day 1 is the smallest reward,
// day 7 the biggest), then the schedule repeats — so week 2's day-1
// reward matches week 1's, rather than growing forever. Missing a full
// calendar day resets the streak back to day 1.
export const DAILY_REWARD_SCHEDULE = [10, 15, 20, 25, 30, 40, 60];

function rewardForStreak(streakDay: number): number {
  const index = (streakDay - 1) % DAILY_REWARD_SCHEDULE.length;
  return DAILY_REWARD_SCHEDULE[index];
}

// YYYY-MM-DD in the device's local calendar — two people who open the app
// at 11:59pm and 12:01am on the same night should see different "days",
// which a UTC-based key would get wrong for anyone west of Greenwich.
function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Whole-day gap between two YYYY-MM-DD keys, computed at UTC noon so nothing
// near a DST boundary rounds to the wrong number of days.
function daysBetweenKeys(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// The streak value claiming *right now* would produce, given the last
// claimed day. Pure — used both to preview "Day N" in the UI before
// tapping claim, and by claimDailyReward itself so the two can't drift.
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
  hasStorybook: boolean;
  streak: number;
  longestStreak: number;
  lastClaimDate: string | null;
};

type PetContextType = {
  pets: PetEntry[];
  setPets: React.Dispatch<React.SetStateAction<PetEntry[]>>;
  coins: number;
  earnCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  unlockedAreas: string[];
  unlockArea: (areaName: string, price: number) => boolean;
  hasStorybook: boolean;
  unlockStorybook: () => void;
  /** Current consecutive-day login streak (0 before the very first claim). */
  streak: number;
  /** Longest streak ever reached, for a little bragging-rights display. */
  longestStreak: number;
  /** True once per calendar day until claimDailyReward() is called. */
  canClaimDailyReward: boolean;
  /** The streak day (and its coin reward) tapping claim right now would land on. */
  previewStreak: number;
  previewReward: number;
  /** Grants the day's coins, advances (or resets) the streak, and returns
   *  the amount awarded — 0 if today's reward was already claimed. */
  claimDailyReward: () => number;
  /** True once the saved pet/coin/streak state has finished loading from
   *  disk — check this before acting on canClaimDailyReward so a fresh
   *  launch doesn't briefly see default (unclaimed) state. */
  isHydrated: boolean;
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
  const [hasStorybook, setHasStorybook] = useState<boolean>(false);
  const [streak, setStreak] = useState<number>(0);
  const [longestStreak, setLongestStreak] = useState<number>(0);
  const [lastClaimDate, setLastClaimDate] = useState<string | null>(null);

  // Guards the save effect below from firing with default state before the
  // load effect has had a chance to run — without this, a fresh mount
  // would briefly write STARTING_COINS etc. over whatever was actually
  // saved, racing the load and sometimes winning.
  const hydrated = useRef(false);
  // A real (re-render-triggering) mirror of the ref above, exposed to
  // consumers as `isHydrated` — the Home tab's daily-reward popup waits on
  // this so it doesn't flash open based on default state (streak 0, no
  // last-claim date) for the instant before the saved values load in.
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
          if (saved.hasStorybook) setHasStorybook(true);
          if (typeof saved.streak === "number") setStreak(saved.streak);
          if (typeof saved.longestStreak === "number") {
            setLongestStreak(saved.longestStreak);
          }
          if (saved.lastClaimDate) setLastClaimDate(saved.lastClaimDate);
        }
      } catch {
        // Fall back to the defaults already set above.
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
      hasStorybook,
      streak,
      longestStreak,
      lastClaimDate,
    };
    AsyncStorage.setItem(PET_STATE_STORAGE_KEY, JSON.stringify(snapshot)).catch(
      () => {
        // Worst case this round of changes doesn't survive a relaunch.
      }
    );
  }, [pets, coins, unlockedAreas, hasStorybook, streak, longestStreak, lastClaimDate]);

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

  const unlockStorybook = () => {
    setHasStorybook(true);
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
        hasStorybook,
        unlockStorybook,
        streak,
        longestStreak,
        canClaimDailyReward,
        previewStreak,
        previewReward,
        claimDailyReward,
        isHydrated,
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
