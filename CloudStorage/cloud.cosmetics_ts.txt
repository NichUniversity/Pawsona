export type CosmeticCategory =
  | "hat"
  | "collar"
  | "background"
  | "accessory"
  | "toy"
  | "bed";

export type CosmeticItem = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  category: CosmeticCategory;
};

export const COSMETICS: CosmeticItem[] = [
  // Hats
  { id: "hat-crown", name: "Royal Crown", emoji: "👑", price: 40, category: "hat" },
  { id: "hat-party", name: "Party Hat", emoji: "🎉", price: 15, category: "hat" },
  { id: "hat-wizard", name: "Wizard Hat", emoji: "🧙", price: 30, category: "hat" },
  { id: "hat-cowboy", name: "Cowboy Hat", emoji: "🤠", price: 20, category: "hat" },

  // Collars
  { id: "collar-bowtie", name: "Bow Tie", emoji: "🎀", price: 10, category: "collar" },
  { id: "collar-bandana", name: "Bandana", emoji: "🏴", price: 12, category: "collar" },
  { id: "collar-bell", name: "Jingle Collar", emoji: "🔔", price: 18, category: "collar" },

  // Backgrounds
  { id: "bg-beach", name: "Sunny Beach", emoji: "🏖️", price: 25, category: "background" },
  { id: "bg-space", name: "Outer Space", emoji: "🌌", price: 35, category: "background" },
  { id: "bg-rainbow", name: "Rainbow Sky", emoji: "🌈", price: 30, category: "background" },
  { id: "bg-forest", name: "Enchanted Forest", emoji: "🌳", price: 20, category: "background" },

  // Accessories
  { id: "acc-glasses", name: "Cool Shades", emoji: "🕶️", price: 15, category: "accessory" },
  { id: "acc-bone", name: "Golden Bone", emoji: "🦴", price: 22, category: "accessory" },
  { id: "acc-star", name: "Shiny Star", emoji: "⭐", price: 28, category: "accessory" },

  // Toys
  { id: "toy-ball", name: "Bouncy Ball", emoji: "🎾", price: 12, category: "toy" },
  { id: "toy-mouse", name: "Squeaky Mouse", emoji: "🐭", price: 14, category: "toy" },
  { id: "toy-frisbee", name: "Frisbee", emoji: "🥏", price: 16, category: "toy" },
  { id: "toy-yarn", name: "Yarn Ball", emoji: "🧶", price: 10, category: "toy" },

  // Beds
  { id: "bed-cozy", name: "Cozy Basket", emoji: "🧺", price: 25, category: "bed" },
  { id: "bed-cloud", name: "Cloud Pillow", emoji: "☁️", price: 32, category: "bed" },
  { id: "bed-castle", name: "Pet Castle", emoji: "🏰", price: 45, category: "bed" },
  { id: "bed-hammock", name: "Sunny Hammock", emoji: "🌞", price: 28, category: "bed" },
];

export const CATEGORY_LABELS: Record<CosmeticCategory, { label: string; emoji: string }> = {
  hat: { label: "Hats", emoji: "🎩" },
  collar: { label: "Collars", emoji: "🎀" },
  background: { label: "Backgrounds", emoji: "🖼️" },
  accessory: { label: "Accessories", emoji: "✨" },
  toy: { label: "Toys", emoji: "🧸" },
  bed: { label: "Beds", emoji: "🛏️" },
};
