// Native (iOS/Android) implementation — just re-exports the real module.
// The `AppleAuthCompat.web.ts` sibling provides a safe stub so Metro never
// tries to bundle the native-only `expo-apple-authentication` package for
// the web target (it has no web implementation and throws during bundling
// under `expo start --web`). LoginScreen imports from this wrapper instead
// of `expo-apple-authentication` directly so Metro's platform-extension
// resolution (`.web.ts` vs plain `.ts`) picks the right one per platform.
export * from "expo-apple-authentication";
