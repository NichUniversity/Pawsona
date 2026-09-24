import { Platform, useWindowDimensions } from 'react-native';

// Browser dev preview renders the whole app inside a phone-shaped box (see
// WebPhoneFrame in app/_layout.tsx) so every tab looks like it does on an
// iPhone instead of stretching across the desktop window. 430x932 = iPhone
// Pro Max logical size. Both width AND height are capped (scaled down together
// to fit smaller windows) -- capping only the width left a tall browser window
// with a far-taller-than-any-phone column, which squashed every "contain"
// art piece (notebook, arcade cabinet) into letterboxed bands. Native: no effect.
export const WEB_PHONE_WIDTH = 430;
export const WEB_PHONE_HEIGHT = 932;
/** @deprecated kept for older imports -- same as WEB_PHONE_WIDTH. */
export const WEB_PHONE_MAX_WIDTH = WEB_PHONE_WIDTH;

export function getWebPhoneSize(windowWidth: number, windowHeight: number) {
  const scale = Math.min(1, windowWidth / WEB_PHONE_WIDTH, windowHeight / WEB_PHONE_HEIGHT);
  return {
    width: Math.floor(WEB_PHONE_WIDTH * scale),
    height: Math.floor(WEB_PHONE_HEIGHT * scale),
  };
}

// Drop-in replacement for useWindowDimensions() anywhere layout math needs the
// *app's* size: on web it returns the phone box, not the browser window.
export function useAppDimensions() {
  const dims = useWindowDimensions();
  if (Platform.OS !== 'web') return dims;
  return { ...dims, ...getWebPhoneSize(dims.width, dims.height) };
}
