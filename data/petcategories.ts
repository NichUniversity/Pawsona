import { ImageSourcePropType } from "react-native";

export type PetCategory = "dog" | "cat" | "bird" | "snake" | "other";

export type CategoryOption = {
  key: PetCategory;
  label: string;
  emoji: string;
};

export type AvatarOption = {
  label: string;
  emoji: string; // unique key for this option — doesn't have to be a real emoji for image avatars
  color: string; // tint for the avatar's badge/circle
  image?: ImageSourcePropType; // when set, this avatar renders as a custom image instead of the emoji
};

export const PET_CATEGORIES: CategoryOption[] = [
  { key: "dog", label: "Dog", emoji: "🐶" },
  { key: "cat", label: "Cat", emoji: "🐱" },
  { key: "bird", label: "Bird", emoji: "🐦" },
  { key: "snake", label: "Snake", emoji: "🐍" },
  { key: "other", label: "Other", emoji: "🐾" },
];

export const AVATAR_OPTIONS: Record<PetCategory, AvatarOption[]> = {
  dog: [
    { label: "Golden Pup", emoji: "🐶", color: "#F2C879" },
    { label: "Brown Dog", emoji: "🐕", color: "#B5794A" },
    { label: "Poodle", emoji: "🐩", color: "#F5F1E8" },
    { label: "Service Dog", emoji: "🦮", color: "#D9B48F" },
    { label: "Guide Dog", emoji: "🐕‍🦺", color: "#8C6C4B" },
    { label: "Wolf Pup", emoji: "🐺", color: "#8A8F99" },
    {
      label: "Bulldog",
      emoji: "bulldog-myavatar",
      color: "#C9C9C9",
      image: require("../assets/avatars/bulldog.png"),
    },
    {
      label: "Golden Retriever",
      emoji: "golden-retriever-myavatar",
      color: "#E0B876",
      image: require("../assets/avatars/golden_retriever.png"),
    },
  ],
  cat: [
    { label: "Orange Cat", emoji: "🐱", color: "#F2924B" },
    { label: "Black Cat", emoji: "🐈‍⬛", color: "#3A3A3A" },
    { label: "White Cat", emoji: "🐈", color: "#F5F5F5" },
    { label: "Lion Cub", emoji: "🦁", color: "#E5B45C" },
    { label: "Tiger Cub", emoji: "🐯", color: "#E8944A" },
  ],
  bird: [
    { label: "Blue Bird", emoji: "🐦", color: "#6FA8DC" },
    { label: "Parrot", emoji: "🦜", color: "#5FBF6B" },
    { label: "Yellow Chick", emoji: "🐤", color: "#F5D547" },
    { label: "Owl", emoji: "🦉", color: "#9C7A50" },
    { label: "Peacock", emoji: "🦚", color: "#3FA6A0" },
    { label: "Dove", emoji: "🕊️", color: "#E8E8E8" },
  ],
  snake: [
    { label: "Green Snake", emoji: "🐍", color: "#5FA85B" },
    { label: "Red Snake", emoji: "🐍", color: "#C1443C" },
    { label: "Brown Snake", emoji: "🐍", color: "#8C6239" },
    { label: "Black Snake", emoji: "🐍", color: "#3A3A3A" },
    { label: "Yellow Snake", emoji: "🐍", color: "#E0C048" },
  ],
  other: [
    { label: "Rabbit", emoji: "🐰", color: "#E8B7C4" },
    { label: "Hamster", emoji: "🐹", color: "#E8A25A" },
    { label: "Turtle", emoji: "🐢", color: "#6FA37B" },
    { label: "Fish", emoji: "🐠", color: "#5AA9E0" },
    { label: "Lizard", emoji: "🦎", color: "#7FBF6B" },
    { label: "Hedgehog", emoji: "🦔", color: "#B08968" },
    { label: "Frog", emoji: "🐸", color: "#79C267" },
    { label: "Horse", emoji: "🐴", color: "#A9713F" },
  ],
};