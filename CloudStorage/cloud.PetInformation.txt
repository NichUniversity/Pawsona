import React, { createContext, useContext, useState } from "react";

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

export type CosmeticCategory = "hat" | "collar" | "background" | "accessory";

export type EquippedCosmetics = {
  hat: string | null;
  collar: string | null;
  background: string | null;
  accessory: string | null;
};

export type PetEntry = {
  id: string;
  photoUri: string | null;
  category: PetCategory | null;
  selectedEmoji: string | null;
  color: string | null;
  name: string;
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

export const EMPTY_EQUIPPED: EquippedCosmetics = {
  hat: null,
  collar: null,
  background: null,
  accessory: null,
};

export const STARTING_COINS = 50;

export const makeEmptyEntry = (): PetEntry => ({
  id: `pet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  photoUri: null,
  category: null,
  selectedEmoji: null,
  color: null,
  name: "",
  confirmed: false,
  ratings: { ...EMPTY_RATINGS },
  logs: [],
  ownedCosmetics: [],
  equippedCosmetics: { ...EMPTY_EQUIPPED },
});

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