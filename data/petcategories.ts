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
  faceImage?: ImageSourcePropType; // optional close-up face art shown while picking this avatar; falls back to `image`
  // Options that share the same `variantGroup` are alternate "looks" of the
  // same avatar (e.g. a black vs. sable German Shepherd). Once a pet's
  // avatar is confirmed, tapping its badge only lets the user switch among
  // options with a matching variantGroup, instead of reopening the full
  // species picker. Options with no variantGroup are treated as their own
  // single-item group (no alternate looks yet).
  variantGroup?: string;
  // When true, this option is left out of the main species-wide picker
  // (initial setup / "choose a different animal entirely") and is only
  // reachable as an alternate look via getAvatarVariants — i.e. someone
  // has to first pick another option in its variantGroup, then switch to
  // this one from the confirmed-pet "Choose a look" menu.
  hiddenFromMainPicker?: boolean;
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
      faceImage: require("../assets/avatars/bulldog_face.png"),
    },
    {
      label: "Golden Retriever",
      emoji: "golden-retriever-myavatar",
      color: "#E0B876",
      image: require("../assets/avatars/golden_retriever.png"),
      faceImage: require("../assets/avatars/golden_retriever_face.png"),
    },
    {
      label: "German Shepherd (Black)",
      emoji: "german-shepherd-myavatar",
      color: "#B5B5B5",
      image: require("../assets/avatars/german_shepherd.png"),
      faceImage: require("../assets/avatars/german_shepherd_face.png"),
      variantGroup: "german-shepherd",
    },
    {
      label: "German Shepherd (Sable)",
      emoji: "german-shepherd-sable-myavatar",
      color: "#B5793A",
      image: require("../assets/avatars/german_shepherd_sable.png"),
      faceImage: require("../assets/avatars/german_shepherd_sable_face.png"),
      variantGroup: "german-shepherd",
      hiddenFromMainPicker: true,
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

/**
 * The options to show in the main species-wide avatar picker (initial
 * setup / "choose a different animal entirely") — everything except
 * options marked `hiddenFromMainPicker` (alternate looks reachable only
 * via getAvatarVariants).
 */
export function getMainPickerOptions(category: PetCategory): AvatarOption[] {
  return AVATAR_OPTIONS[category].filter((o) => !o.hiddenFromMainPicker);
}

/**
 * All avatar options in `category` that are alternate looks of `option` —
 * itself included. Falls back to just `[option]` when it has no group,
 * since it has no other looks defined yet.
 */
export function getAvatarVariants(
  category: PetCategory,
  option: Pick<AvatarOption, "emoji" | "variantGroup">
): AvatarOption[] {
  if (!option.variantGroup) {
    const self = AVATAR_OPTIONS[category].find(
      (o) => o.emoji === option.emoji
    );
    return self ? [self] : [];
  }
  return AVATAR_OPTIONS[category].filter(
    (o) => o.variantGroup === option.variantGroup
  );
}