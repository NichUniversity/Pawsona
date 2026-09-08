// Web stub for `expo-apple-authentication`. Apple Sign In isn't available
// on web and the real package has no web implementation at all (it's a
// native-module-only binding) — importing it directly on web breaks
// `expo start --web` bundling with an unrelated-looking error surfaced at
// app/_layout.tsx's route require.context.
//
// LoginScreen only renders the Apple button / calls signInAsync when
// `appleAvailable` is true, and that's only ever set on iOS, so none of
// this actually executes on web — it just needs to exist so Metro has a
// valid, web-safe module to resolve in place of the native one.
import type { StyleProp, ViewProps, ViewStyle } from "react-native";

export enum AppleAuthenticationScope {
  FULL_NAME = 0,
  EMAIL = 1,
}

export enum AppleAuthenticationButtonType {
  SIGN_IN = 0,
  CONTINUE = 1,
  SIGN_UP = 2,
}

export enum AppleAuthenticationButtonStyle {
  WHITE = 0,
  WHITE_OUTLINE = 1,
  BLACK = 2,
}

export type AppleAuthenticationButtonProps = ViewProps & {
  onPress: () => void;
  buttonType: AppleAuthenticationButtonType;
  buttonStyle: AppleAuthenticationButtonStyle;
  cornerRadius?: number;
  style?: StyleProp<Omit<ViewStyle, "backgroundColor" | "borderRadius">>;
};

export async function isAvailableAsync(): Promise<boolean> {
  return false;
}

export async function signInAsync(): Promise<never> {
  throw new Error("Apple authentication is not available on web.");
}

// Never actually rendered (gated behind `appleAvailable`, which is always
// false on web), so a no-op is fine.
export function AppleAuthenticationButton(_props: AppleAuthenticationButtonProps) {
  return null;
}
