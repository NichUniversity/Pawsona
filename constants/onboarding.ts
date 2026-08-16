// Shared between app/(tabs)/_layout.tsx (shows the walkthrough modal) and
// app/(tabs)/index.tsx (gates the upload-box glow animation) so both agree
// on what "first launch" means. Bump the version suffix if the tutorial
// content changes and should run again for everyone.
export const ONBOARDING_STORAGE_KEY = 'pawsona_onboarding_complete_v1';
