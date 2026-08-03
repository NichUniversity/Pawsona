import { ImageSourcePropType } from "react-native";

export type AvatarOption = {
  id: string; // stored in PetEntry.selectedEmoji
  label: string;
  kind: "emoji" | "image";
  emoji?: string;
  image?: ImageSourcePropType;
};

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "🐶", label: "Golden Pup", kind: "emoji", emoji: "🐶" },
  { id: "🐕", label: "Brown Dog", kind: "emoji", emoji: "🐕" },
  { id: "🦮", label: "Service Dog", kind: "emoji", emoji: "🦮" },
  { id: "🐩", label: "Poodle", kind: "emoji", emoji: "🐩" },
  { id: "🐕‍🦺", label: "Guide Dog", kind: "emoji", emoji: "🐕‍🦺" },
  {
    id: "dog_emoji_brown",
    label: "Custom Brown Pup",
    kind: "image",
    image: require("../assets/avatars/dog_emoji_brown.png"),
  },
];

export function getAvatarOption(id: string | null | undefined) {
  if (!id) return undefined;
  return AVATAR_OPTIONS.find((a) => a.id === id);
}