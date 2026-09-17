import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CoinIcon } from "../../components/ui/CoinIcon";
import { FetchFrenzyGame } from "../../components/minigames/FetchFrenzyGame";
import { MarkYourTerritoryGame } from "../../components/minigames/MarkYourTerritoryGame";
import { PetMinesweeperGame } from "../../components/minigames/PetMinesweeperGame";
import { SimonSaysGame } from "../../components/minigames/SimonSaysGame";
import { TightSqueezeGame } from "../../components/minigames/TightSqueezeGame";
import { PetEntry, usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";
import { COSMETICS } from "../../data/cosmetics";
import { useTabBarClearance } from "../../hooks/useTabBarClearance";
import { getTabBarStyle } from "./_layout";

// Retro arcade-cabinet art behind the game-picker screen (replaces the shared
// theme-reactive TabBackground gradient, same treatment Home and Daily Log's
// notebook-paper screen got with their own dedicated art).
//
// History: an earlier elaborate attempt at clipping the game-picker content
// into the cabinet's own screen glass kept surfacing new bugs (a pager
// layout-measurement bug, a ScrollView that didn't fill its box, a cabinet
// that shrank with browser height), so it was scrapped for a plain full-bleed
// background with content on top, matching Daily Log's pattern. That in turn
// hit its own bug — resizeMode="cover" needs an explicit width/height: "100%"
// on react-native-web, see `styles.background`'s own comment — which is now
// fixed and confirmed working. With the background rock solid, the
// screen-glass content-fit effect below is a second attempt, done
// differently this time: instead of measuring anything at runtime
// (onLayout, refs), the glass rectangle's position is *computed* from the
// same fit math the browser/OS already applies to the image, driven only by
// useWindowDimensions (the one layout source already proven reliable on web
// in this codebase, per app/(tabs)/_layout.tsx). That keeps this fully
// deterministic and resize-safe without depending on the pager's flaky
// onLayout resolution at all.
//
// resizeMode is "contain", not "cover" — this screen briefly shipped with
// "cover" (matching the plain-background version above) and it broke badly:
// "cover" crops whichever axis overflows, and how much it crops scales with
// how far the window's own aspect ratio differs from the image's. On a
// typical wide desktop browser window (not phone-shaped) that crop is severe
// enough to push the entire screen-glass rect — and therefore the whole
// games menu — off the top of the visible viewport, making the menu
// invisible even though the code was "working." "contain" guarantees the
// full image (and therefore the glass rect, a sub-region of it) is always
// entirely within the container bounds, for literally any window shape, at
// the cost of letterbox bars on aspect ratios that don't match the art —
// this is also the standing project preference for full-screen background
// images for exactly this reason (Daily Log's plain "cover" is the deviation
// there, justified only because its art's aspect ratio already lands close
// to a phone's). backgroundColor on the wrapping view fills those bars with
// a tone sampled from the image's own corners so they blend in.
const MINIGAMES_BACKGROUND = require("../../assets/backgrounds/minigames_arcade_cabinet.png");
const CABINET_LETTERBOX_COLOR = "#030c2f";

// Source image's own pixel dimensions (used to replicate resizeMode="contain"'s
// fit math in JS below) and the fractional bounds of the cabinet's screen
// "glass" within it. Measured directly off the asset by sampling pixel
// colors along the image's horizontal/vertical center lines to find where
// the screen's dark-blue interior meets its black bezel rim (inset slightly
// from the true edge so content sits safely inside the bezel, not touching
// it) — see claude/minigames-arcade-cabinet-background.md for the sampled
// values. If the art is ever swapped for a new cabinet illustration, these
// four fractions need re-measuring against the new file.
const CABINET_IMAGE_WIDTH = 941;
const CABINET_IMAGE_HEIGHT = 1672;
const SCREEN_LEFT_FRAC = 0.11;
const SCREEN_RIGHT_FRAC = 0.89;
const SCREEN_TOP_FRAC = 0.155;
const SCREEN_BOTTOM_FRAC = 0.765;

// Mirrors CSS background-size:contain / native resizeMode="contain": scale
// the image down (or up) just enough that it fits entirely within the
// container on whichever axis is the tighter constraint, letterboxing the
// other. Unlike cover's Math.max, this never overflows either dimension, so
// offsetX/offsetY are always >= 0 and the glass rect they produce is always
// fully within [0, containerWidth] x [0, containerHeight] — it cannot be
// pushed off-screen the way cover's crop could. Applying that same scale +
// offset to the glass's fractional bounds gives its exact on-screen rect, in
// sync with the background Image by construction (same inputs, same
// formula) rather than by measuring the rendered Image after the fact.
function computeScreenGlassRect(containerWidth: number, containerHeight: number) {
  const scale = Math.min(
    containerWidth / CABINET_IMAGE_WIDTH,
    containerHeight / CABINET_IMAGE_HEIGHT
  );
  const displayedWidth = CABINET_IMAGE_WIDTH * scale;
  const displayedHeight = CABINET_IMAGE_HEIGHT * scale;
  const offsetX = (containerWidth - displayedWidth) / 2;
  const offsetY = (containerHeight - displayedHeight) / 2;

  return {
    left: offsetX + displayedWidth * SCREEN_LEFT_FRAC,
    top: offsetY + displayedHeight * SCREEN_TOP_FRAC,
    width: displayedWidth * (SCREEN_RIGHT_FRAC - SCREEN_LEFT_FRAC),
    height: displayedHeight * (SCREEN_BOTTOM_FRAC - SCREEN_TOP_FRAC),
  };
}

type GameId = "simon" | "minesweeper" | "fetchfrenzy" | "tightsqueeze" | "territory";

const GAMES: {
  id: GameId;
  name: string;
  emoji: string;
  available: boolean;
  description: string;
}[] = [
  {
    id: "simon",
    name: "Paw Pattern",
    emoji: "🐾",
    available: true,
    description: "Watch, remember, repeat!",
  },
  {
    id: "minesweeper",
    name: "Sniff & Seek",
    emoji: "🦴",
    available: true,
    description: "Dig up bones, dodge the skunks!",
  },
  {
    id: "fetchfrenzy",
    name: "Fetch Frenzy",
    emoji: "🎾",
    available: true,
    description: "Slide to catch what falls — dodge the rocks!",
  },
  {
    id: "tightsqueeze",
    name: "Tight Squeeze",
    emoji: "🦴",
    available: true,
    description: "Drag the bone through the hollow dog — don't touch the walls!",
  },
  {
    id: "territory",
    name: "Mark Your Territory",
    emoji: "🚩",
    available: true,
    description: "Hold the mailbox to mark it — let go before he looks up!",
  },
];

export default function Minigames() {
  const { coins } = usePets();
  const { accentColor, theme } = useTheme();
  const [activeGame, setActiveGame] = useState<GameId | "menu">("menu");
  const tabBarClearance = useTabBarClearance();

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // Every game now takes over the whole screen (Mark Your Territory always did; the rest used to sit as a small card in a scrollable page) — anything other than the menu itself counts as full screen.
  const isGameFullScreen = activeGame !== "menu";

  // Background Image fills the full window edge-to-edge (see styles.background),
  // so window dimensions are exactly the "container" the cover-crop math needs.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const screenGlassRect = useMemo(
    () => computeScreenGlassRect(windowWidth, windowHeight),
    [windowWidth, windowHeight]
  );

  // Same fade-tab-bar pattern as adventure_tab.tsx: re-apply getTabBarStyle rather than `undefined` when restoring it.
  const restoredTabBarStyle = useMemo(
    () => getTabBarStyle(theme, insets.bottom),
    [theme, insets.bottom]
  );
  const tabBarOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const listenerId = tabBarOpacity.addListener(({ value }) => {
      navigation.setOptions({
        tabBarStyle: {
          ...restoredTabBarStyle,
          opacity: value,
          ...(value <= 0.01 ? { display: "none" } : null),
        },
      });
    });
    return () => tabBarOpacity.removeListener(listenerId);
  }, [navigation, restoredTabBarStyle, tabBarOpacity]);

  useEffect(() => {
    Animated.timing(tabBarOpacity, {
      toValue: isGameFullScreen ? 0 : 1,
      duration: 300,
      useNativeDriver: false, // driving a JS listener, not a native style prop
    }).start();
  }, [isGameFullScreen, tabBarOpacity]);

  // Blocks swiping to another tab while a game is being played — a per-screen options override (same mechanism the tabBarStyle listener above already uses) takes precedence over _layout.tsx's own swipeEnabled default for as long as this screen is focused. Tapping another tab directly still works even with swiping disabled (swipeEnabled only gates the drag gesture), which is why the focus-effect safety net below also resets this — otherwise a game left "in progress" via a tap-away would leave swiping stuck off next time this tab regains focus.
  useEffect(() => {
    navigation.setOptions({ swipeEnabled: !isGameFullScreen });
  }, [isGameFullScreen, navigation]);

  // Safety net: instantly restores the tab bar (and swipe gesture) when leaving this tab entirely, since state persists across tab swaps.
  useFocusEffect(
    useCallback(() => {
      return () => {
        tabBarOpacity.stopAnimation();
        tabBarOpacity.setValue(1);
        navigation.setOptions({ tabBarStyle: restoredTabBarStyle, swipeEnabled: true });
      };
    }, [navigation, restoredTabBarStyle, tabBarOpacity])
  );

  // Every game takes over the whole screen now (no chrome/coin badge/scrollable page behind it) — only the menu itself keeps the scrollable layout.
  if (activeGame === "territory") {
    return <MarkYourTerritoryGame onExit={() => setActiveGame("menu")} />;
  }
  if (activeGame === "simon") {
    return <SimonSaysGame onExit={() => setActiveGame("menu")} />;
  }
  if (activeGame === "minesweeper") {
    return <PetMinesweeperGame onExit={() => setActiveGame("menu")} />;
  }
  if (activeGame === "fetchfrenzy") {
    return <FetchFrenzyGame onExit={() => setActiveGame("menu")} />;
  }
  if (activeGame === "tightsqueeze") {
    return <TightSqueezeGame onExit={() => setActiveGame("menu")} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: CABINET_LETTERBOX_COLOR }}>
      <Image source={MINIGAMES_BACKGROUND} resizeMode="contain" style={styles.background} />

      <View
        style={[
          styles.screenGlass,
          {
            left: screenGlassRect.left,
            top: screenGlassRect.top,
            width: screenGlassRect.width,
            height: screenGlassRect.height,
          },
        ]}
      >
        <ScrollView
          style={styles.screenGlassScroll}
          contentContainerStyle={[
            styles.container,
            { paddingBottom: tabBarClearance },
          ]}
        >
        <View style={styles.coinBadge}>
          <CoinIcon size={16} />
          <Text style={[styles.coinText, { color: accentColor }]}> {coins}</Text>
        </View>

        <PassiveActivitiesSection />

        <Text style={[styles.sectionHeading, { color: theme.text.primary }]}>🎮 Games</Text>
        <View style={styles.grid}>
          {GAMES.map((game) => (
            <Pressable
              key={game.id}
              style={[
                styles.gameCard,
                {
                  backgroundColor: theme.card.background,
                  borderColor: theme.card.border,
                },
                !game.available && styles.gameCardLocked,
              ]}
              onPress={() => game.available && setActiveGame(game.id)}
              disabled={!game.available}
            >
              <Text style={styles.gameEmoji}>
                {game.available ? game.emoji : "🔒"}
              </Text>
              <Text style={[styles.gameName, { color: theme.text.primary }]}>{game.name}</Text>
              <Text style={[styles.gameDescription, { color: theme.text.secondary }]}>
                {game.description}
              </Text>
            </Pressable>
          ))}
        </View>
        </ScrollView>
      </View>
    </View>
  );
}

// --- Passive Coins (idle-clicker activities): 30s cooldown per pet, random coin payout, chance at an unowned cosmetic; cooldowns live in a ref with a 1s ticker to keep countdowns live. ---

const ACTIVITY_COOLDOWN_MS = 30 * 1000;

type ActivityId = "dig" | "walk" | "swim";

const ACTIVITIES: {
  id: ActivityId;
  name: string;
  emoji: string;
  description: string;
  coinRange: [number, number];
  cosmeticChance: number;
}[] = [
  {
    id: "dig",
    name: "Dig",
    emoji: "⛏️",
    description: "Let your pet dig around for buried coins.",
    coinRange: [2, 8],
    cosmeticChance: 0.12,
  },
  {
    id: "walk",
    name: "Walk",
    emoji: "🐾",
    description: "Take your pet for a stroll to sniff out spare change.",
    coinRange: [3, 9],
    cosmeticChance: 0.07,
  },
  {
    id: "swim",
    name: "Swim",
    emoji: "🏊",
    description: "Splash around and see what washes up.",
    coinRange: [3, 10],
    cosmeticChance: 0.09,
  },
];

function cooldownKey(activityId: ActivityId, petId: string) {
  return `${activityId}:${petId}`;
}

function PassiveActivitiesSection() {
  const { pets, setPets, earnCoins } = usePets();
  const { accentColor, theme } = useTheme();

  const confirmedPets = pets.filter((pet) => pet.confirmed);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [resultText, setResultText] = useState<Record<string, string>>({});
  const [, setTick] = useState(0);

  const readyAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (confirmedPets.length === 0) {
      if (selectedPetId !== null) setSelectedPetId(null);
      return;
    }
    if (!selectedPetId || !confirmedPets.some((p) => p.id === selectedPetId)) {
      setSelectedPetId(confirmedPets[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedPets.map((p) => p.id).join(","), selectedPetId]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const updatePet = (id: string, patch: Partial<PetEntry>) => {
    setPets((prev) =>
      prev.map((pet) => (pet.id === id ? { ...pet, ...patch } : pet))
    );
  };

  const handleActivity = (activity: (typeof ACTIVITIES)[number]) => {
    if (!selectedPetId) return;

    const key = cooldownKey(activity.id, selectedPetId);
    const now = Date.now();
    const readyAt = readyAtRef.current[key] ?? 0;
    if (now < readyAt) return;

    readyAtRef.current[key] = now + ACTIVITY_COOLDOWN_MS;
    setTick((t) => t + 1);

    const [minCoins, maxCoins] = activity.coinRange;
    const coinsEarned =
      Math.floor(Math.random() * (maxCoins - minCoins + 1)) + minCoins;
    earnCoins(coinsEarned);

    let message = `+${coinsEarned} coins`;

    if (Math.random() < activity.cosmeticChance) {
      const pet = pets.find((p) => p.id === selectedPetId);
      const unowned = COSMETICS.filter(
        (item) => !pet?.ownedCosmetics.includes(item.id)
      );
      if (pet && unowned.length > 0) {
        const found = unowned[Math.floor(Math.random() * unowned.length)];
        updatePet(pet.id, {
          ownedCosmetics: [...pet.ownedCosmetics, found.id],
        });
        message = `+${coinsEarned} coins & found ${found.emoji} ${found.name}!`;
      }
    }

    setResultText((prev) => ({ ...prev, [activity.id]: message }));
  };

  return (
    <View style={styles.activitiesSection}>
      <Text style={[styles.sectionHeading, { color: theme.text.primary }]}>
        <CoinIcon size={18} /> Passive Coins
      </Text>
      <Text style={[styles.activitiesSubtitle, { color: theme.text.secondary }]}>
        Check in every 30 seconds to earn a few coins — and sometimes a
        cosmetic!
      </Text>

      {confirmedPets.length === 0 ? (
        <View
          style={[
            styles.activitiesEmptyCard,
            { backgroundColor: theme.card.background, borderColor: theme.card.border },
          ]}
        >
          <Text style={[styles.activitiesEmptyText, { color: theme.text.primary }]}>
            Confirm a pet on the Home tab to start earning passive coins!
          </Text>
        </View>
      ) : (
        <>
          {confirmedPets.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activityPetRow}
            >
              {confirmedPets.map((pet) => (
                <Pressable
                  key={pet.id}
                  style={[
                    styles.activityPetChip,
                    {
                      backgroundColor: theme.card.background,
                      borderColor: theme.card.border,
                    },
                    selectedPetId === pet.id && {
                      backgroundColor: accentColor,
                      borderColor: accentColor,
                    },
                  ]}
                  onPress={() => setSelectedPetId(pet.id)}
                >
                  <Text
                    style={[
                      styles.activityPetChipName,
                      { color: selectedPetId === pet.id ? "#fff" : theme.text.primary },
                    ]}
                  >
                    {pet.name || "Unnamed Pet"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {ACTIVITIES.map((activity) => {
            const key = selectedPetId
              ? cooldownKey(activity.id, selectedPetId)
              : "";
            const readyAt = readyAtRef.current[key] ?? 0;
            const remainingMs = Math.max(0, readyAt - Date.now());
            const onCooldown = remainingMs > 0;
            const remainingSec = Math.ceil(remainingMs / 1000);

            return (
              <View
                key={activity.id}
                style={[
                  styles.activityCard,
                  { backgroundColor: theme.card.background, borderColor: theme.card.border },
                ]}
              >
                <View style={styles.activityCardHeader}>
                  <Text style={styles.activityEmoji}>{activity.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.activityName, { color: theme.text.primary }]}>
                      {activity.name}
                    </Text>
                    <Text style={[styles.activityDescription, { color: theme.text.secondary }]}>
                      {activity.description}
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[
                    styles.activityButton,
                    onCooldown
                      ? styles.activityButtonDisabled
                      : { backgroundColor: accentColor },
                  ]}
                  disabled={onCooldown}
                  onPress={() => handleActivity(activity)}
                >
                  <Text
                    style={[
                      styles.activityButtonText,
                      onCooldown && styles.activityButtonTextDisabled,
                    ]}
                  >
                    {onCooldown ? `Ready in ${remainingSec}s` : `Let's go!`}
                  </Text>
                </Pressable>

                {resultText[activity.id] && (
                  <Text style={[styles.activityResultText, { color: accentColor }]}>
                    {resultText[activity.id]}
                  </Text>
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  // StyleSheet.absoluteFill alone (top/left/right/bottom: 0, no width/height)
  // isn't enough for react-native-web's Image: with a local require() asset,
  // whose Metro-attached source carries its own pixel width/height, RN Web
  // falls back to rendering the <img> at that raw intrinsic size (941x1672
  // here) pinned to the top-left corner instead of stretching to fill the
  // parent — which is exactly what looked like "stuck on the left" /
  // "not centered" in the browser regardless of viewport width or the
  // earlier pager initialLayout fix. Adding explicit 100% width/height
  // forces it to actually fill its container, letting resizeMode="cover"
  // do its job. (Confirmed via direct DOM measurement in the dev browser:
  // the rendered <img>'s parent had inline `width: 941px; height: 1672px`
  // instead of matching the viewport.) Daily Log's background Image has
  // this same latent bug — not touched here since it wasn't reported broken.
  // Written out literally (rather than spreading StyleSheet.absoluteFillObject)
  // since that helper isn't declared in this project's installed react-native
  // type definitions (TS2551) — the literal object below is exactly what
  // absoluteFillObject itself is under the hood.
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },

  // Positioned absolutely with explicit left/top/width/height computed by
  // computeScreenGlassRect (see top of file) — never via flex/onLayout, so
  // it can't be thrown off by the pager's flaky web layout resolution.
  // overflow: "hidden" keeps card content from ever visually spilling past
  // the cabinet's own screen bezel if a game card's content runs long.
  screenGlass: {
    position: "absolute",
    overflow: "hidden",
  },

  // Explicit style (not just contentContainerStyle) so the ScrollView's own
  // viewport actually fills screenGlass's box instead of shrinking to its
  // content size — same fix this file's history notes a bare
  // contentContainerStyle already got bitten by once before.
  screenGlassScroll: {
    flex: 1,
    width: "100%",
  },

  container: {
    flexGrow: 1,
    backgroundColor: "transparent",
    padding: 14,
    paddingTop: 16,
    alignItems: "center",
  },

  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginBottom: 24,
  },

  coinText: {
    fontWeight: "800",
    fontSize: 16,
  },

  sectionHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    alignSelf: "flex-start",
    marginBottom: 12,
    marginTop: 4,
  },

  activitiesSection: {
    width: "100%",
    marginBottom: 28,
  },

  activitiesSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 16,
  },

  activitiesEmptyCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  activitiesEmptyText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },

  activityPetRow: {
    gap: 10,
    paddingBottom: 14,
  },

  activityPetChip: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  activityPetChipName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },

  activityCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  activityCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },

  activityEmoji: {
    fontSize: 32,
  },

  activityName: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 2,
  },

  activityDescription: {
    fontSize: 12,
    fontWeight: "600",
  },

  activityButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },

  activityButtonDisabled: {
    backgroundColor: "#3A3A3C",
  },

  activityButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },

  activityButtonTextDisabled: {
    color: "#8E8E93",
  },

  activityResultText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 10,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    gap: 14,
  },

  gameCard: {
    borderRadius: 20,
    padding: 18,
    width: "47%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  gameCardLocked: {
    opacity: 0.4,
  },

  gameEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },

  gameName: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },

  gameDescription: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
