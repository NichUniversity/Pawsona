import { ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";
import { PressableScale } from "../ui/PressableScale";
import { sharedGameStyles } from "./sharedGameStyles";

// Full-screen shell every arcade-style minigame uses (Paw Pattern, Sniff & Seek,
// Fetch Frenzy, Tight Squeeze) -- the exit button + title header used to be copy-pasted
// into each game's own return statement; now they share this one wrapper.
// Mark Your Territory doesn't use this shell -- it renders over its own custom
// scene art rather than a themed card background.
//
// Edge-to-edge pass (2026-09-13, per explicit user request: "fill the entire
// mobile screen just like mark your territory minigame"). Previously this
// shell's content was boxed in -- maxWidth: 480 + paddingHorizontal: 20 left
// side gutters on every phone (maxWidth only ever bound on a tablet-width
// screen, but the horizontal padding always did), and a static title header
// row (paddingTop: insets.top + 64) ate a big top chunk before any game
// content could measure its own play area. Mark Your Territory's own
// territoryFullScreen container never had any of that -- full width, no
// side padding, no reserved header row, just its house art filling the
// container and a couple of small pill-shaped overlays (exit button,
// marking meter) absolutely positioned on top so they cost zero layout
// space. This shell now matches that: gameFullScreenContent is full width
// with only a small safe-area-driven top/bottom margin (not a title-sized
// one), and the title moved from a static header line into its own
// absolutely-positioned pill next to the exit button -- same treatment,
// zero reserved space, so every game's own onLayout-measured play area
// (already written to fill whatever it's given, same pattern as Mark Your
// Territory's onLayout-measured house scene) now gets the space back and
// genuinely fills the screen edge to edge like Mark Your Territory does.
//
// Mobile-only follow-up (same day, per explicit user request: "i want it
// taylored to fit mobile not on the browser"): the edge-to-edge fill above
// is correct on an actual phone (where "100% width" already IS phone
// width), but on a desktop browser tab -- Nich's day-to-day dev-loop preview
// on Windows, per the project's ways-of-working -- "100% width" stretches
// every game across the whole browser window, which was never the intent.
// webPhoneFrame below caps and centers the game (content + exit button +
// title badge, all nested inside it so they stay visually grouped with it)
// to WEB_MOBILE_MAX_WIDTH on web only; on native iOS/Android it's a no-op
// (flex: 1, width: "100%", same as before) since a real device's width
// never exceeds that cap anyway. Net effect: still genuinely edge-to-edge
// on mobile, but a browser tab now shows a phone-shaped column instead of a
// stretched-out desktop layout.
const WEB_MOBILE_MAX_WIDTH = 430; // roughly the widest common phone's logical width (iPhone Pro Max) -- a stand-in phone viewport for the browser case, not a "looks fine on tablets too" breakpoint.

type MinigameShellProps = {
  /** Omit to run without the floating title pill (e.g. Tight Squeeze, per explicit user request to drop its top banner while the game is open) — the exit button and safe-area layout are unaffected either way. */
  title?: string;
  onExit: () => void;
  children: ReactNode;
};

export function MinigameShell({ title, onExit, children }: MinigameShellProps) {
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.gameFullScreen, { backgroundColor: theme.card.background }]}>
      <View style={styles.webPhoneFrame}>
        <View
          style={[
            styles.gameFullScreenContent,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
          ]}
        >
          {children}
        </View>

        <PressableScale
          style={[
            styles.gameFullScreenExitButton,
            {
              top: insets.top + 12,
              left: insets.left + 16,
              backgroundColor: theme.card.background,
              borderColor: theme.card.border,
            },
          ]}
          onPress={onExit}
        >
          <Text style={[sharedGameStyles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
        </PressableScale>

        {/* Was a static header line pushing all game content down by insets.top + 64;
            now a floating pill (same treatment as the exit button) so it costs no
            layout space -- see the file-level comment above. Omitted entirely when
            no title is passed (see the MinigameShellProps comment). */}
        {title && (
          <View
            style={[
              styles.gameFullScreenTitleBadge,
              {
                top: insets.top + 12,
                backgroundColor: theme.card.background,
                borderColor: theme.card.border,
                pointerEvents: "none",
              },
            ]}
          >
            <Text style={[styles.gameTitle, { color: theme.text.primary }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gameFullScreen: {
    flex: 1,
    width: "100%",
    // Same web-only fix territoryFullScreen uses: a swipeable MaterialTopTabs pager doesn't reliably propagate height through flex:1 in a browser.
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : null),
  },

  // See the "Mobile-only follow-up" comment above -- caps to a phone-sized
  // column on web only; native mobile gets the plain full-width behavior
  // (this never actually constrains a real phone's width).
  webPhoneFrame: {
    flex: 1,
    width: "100%",
    ...(Platform.OS === "web" ? { maxWidth: WEB_MOBILE_MAX_WIDTH, alignSelf: "center" } : null),
  },

  gameFullScreenExitButton: {
    position: "absolute",
    zIndex: 10,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
  },

  gameFullScreenTitleBadge: {
    position: "absolute",
    zIndex: 10,
    alignSelf: "center",
    maxWidth: "50%",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
  },

  // Full width, no side gutters, no maxWidth box -- the whole point of this
  // pass. alignItems: "center" still centers each game's own (usually
  // narrower) play-area card horizontally within that full width, same as
  // before; it just no longer ALSO clips the available width down to 480.
  gameFullScreenContent: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },

  gameTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
});
