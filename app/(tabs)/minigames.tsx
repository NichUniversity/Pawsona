import { useFocusEffect, useNavigation } from "expo-router";
import { ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextStyle, useWindowDimensions, View } from "react-native";
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

// Game-picker screen drawn inside an arcade-cabinet illustration.
// The art uses resizeMode="contain" (never "cover", which can crop the
// screen glass off-screen on wide windows); letterbox bars are filled with a
// color sampled from the art. The menu is placed inside the cabinet's screen
// glass by computing the glass rect from the same "contain" math, driven by
// useWindowDimensions (no onLayout measuring, which is flaky in the pager).
const MINIGAMES_BACKGROUND = require("../../assets/backgrounds/minigames_arcade_cabinet.png");
const CABINET_LETTERBOX_COLOR = "#030c2f";

// Art size and the screen glass's bounds as fractions of it (sampled from
// the image, inset slightly from the bezel). Re-measure if the art changes;
// see claude/minigames-arcade-cabinet-background.md.
const CABINET_IMAGE_WIDTH = 941;
const CABINET_IMAGE_HEIGHT = 1672;
const SCREEN_LEFT_FRAC = 0.11;
const SCREEN_RIGHT_FRAC = 0.89;
const SCREEN_TOP_FRAC = 0.155;
const SCREEN_BOTTOM_FRAC = 0.765;

// Where the screen glass lands on screen when the art is drawn with
// "contain" in a containerWidth x containerHeight box.
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

// Fixed neon palette sampled from the cabinet art. Not theme-based: the
// cabinet is always dark navy, so light-mode theme colors would clash.
const ARCADE = {
  panel: "rgba(6, 10, 46, 0.88)",
  panelPressed: "rgba(38, 24, 108, 0.95)",
  text: "#FFFFFF",
  textMuted: "#A9B4FF",
  textDim: "#6C76B8",
  cyan: "#3DD5FF",
  magenta: "#FF3DA0",
  yellow: "#FFD23F",
  green: "#39FF88",
  purple: "#B26BFF",
  ink: "#07093A", // dark navy for text on top of a bright neon fill
};

// Each game card takes the next neon color, so the menu reads like the cabinet's colored buttons.
const NEON_CYCLE = [ARCADE.cyan, ARCADE.magenta, ARCADE.yellow, ARCADE.green, ARCADE.purple];

// Monospace stands in for a pixel font (no extra font dependency; Fredoka is too soft for this).
const ARCADE_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: '"Courier New", monospace',
});

// Outer neon glow; "80" is a hex alpha suffix on the color (~50% opacity).
function neonGlow(color: string) {
  return { boxShadow: `0 0 10px ${color}80` };
}

// Text glow: web wants a CSS textShadow string (textShadow* props are
// deprecated there), native uses the textShadow* props.
function neonText(color: string, radius: number): TextStyle {
  if (Platform.OS === "web") {
    return { textShadow: `0 0 ${radius}px ${color}` } as unknown as TextStyle;
  }
  return {
    textShadowColor: color,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: radius,
  };
}

type GameId = "simon" | "minesweeper" | "fetchfrenzy" | "tightsqueeze" | "territory";

// Every game runs full screen and gets an onExit back to the menu.
const GAME_COMPONENTS: Record<GameId, ComponentType<{ onExit: () => void }>> = {
  simon: SimonSaysGame,
  minesweeper: PetMinesweeperGame,
  fetchfrenzy: FetchFrenzyGame,
  tightsqueeze: TightSqueezeGame,
  territory: MarkYourTerritoryGame,
};

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
    description: "Guide the paw through the cave tunnels — don't touch the walls!",
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
  const { theme } = useTheme();
  const [activeGame, setActiveGame] = useState<GameId | "menu">("menu");
  const tabBarClearance = useTabBarClearance();

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isGameFullScreen = activeGame !== "menu";

  // The background fills the window, so the window is the "contain" box.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const screenGlassRect = useMemo(
    () => computeScreenGlassRect(windowWidth, windowHeight),
    [windowWidth, windowHeight]
  );

  // Fade the tab bar out while a game is open (same pattern as
  // adventure_tab.tsx). Restore with the full style, never `undefined`.
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

  // No swiping between tabs while a game is open.
  useEffect(() => {
    navigation.setOptions({ swipeEnabled: !isGameFullScreen });
  }, [isGameFullScreen, navigation]);

  // When leaving the tab (state persists), restore the tab bar and swiping.
  useFocusEffect(
    useCallback(() => {
      return () => {
        tabBarOpacity.stopAnimation();
        tabBarOpacity.setValue(1);
        navigation.setOptions({ tabBarStyle: restoredTabBarStyle, swipeEnabled: true });
      };
    }, [navigation, restoredTabBarStyle, tabBarOpacity])
  );

  if (isGameFullScreen) {
    const ActiveGame = GAME_COMPONENTS[activeGame];
    return <ActiveGame onExit={() => setActiveGame("menu")} />;
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
        <View style={styles.creditsBadge}>
          <Text style={styles.creditsLabel}>CREDITS</Text>
          <CoinIcon size={16} />
          <Text style={styles.creditsValue}>{String(coins).padStart(2, "0")}</Text>
        </View>

        <PassiveActivitiesSection />

        <Text style={[styles.sectionHeading, styles.gamesHeading]}>🎮 SELECT GAME</Text>
        <View style={styles.grid}>
          {GAMES.map((game, index) => {
            const neon = NEON_CYCLE[index % NEON_CYCLE.length];

            return (
              <Pressable
                key={game.id}
                style={({ pressed }) => [
                  styles.gameCard,
                  { borderColor: neon },
                  neonGlow(neon),
                  pressed && { backgroundColor: ARCADE.panelPressed, transform: [{ scale: 0.97 }] },
                  !game.available && styles.gameCardLocked,
                ]}
                onPress={() => game.available && setActiveGame(game.id)}
                disabled={!game.available}
              >
                <Text style={[styles.gameNumber, { color: neon }]}>
                  GAME {String(index + 1).padStart(2, "0")}
                </Text>
                <Text style={styles.gameEmoji}>
                  {game.available ? game.emoji : "🔒"}
                </Text>
                <Text style={[styles.gameName, neonText(neon, 6)]}>
                  {game.name.toUpperCase()}
                </Text>
                <Text style={styles.gameDescription}>{game.description}</Text>
                <Text style={[styles.gamePlayTag, { color: game.available ? neon : ARCADE.textDim }]}>
                  {game.available ? "▶ PLAY" : "LOCKED"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        </ScrollView>
      </View>
    </View>
  );
}

// --- Passive coins ---
// Each activity has a 30s cooldown per pet, pays a random amount, and has a
// small chance to award a cosmetic the pet doesn't own yet. Cooldowns live in
// a ref; a 1s ticker re-renders to keep the countdowns live.

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
      <Text style={[styles.sectionHeading, styles.passiveHeading]}>
        <CoinIcon size={18} /> PASSIVE COINS
      </Text>
      <Text style={styles.activitiesSubtitle}>
        Check in every 30 seconds to earn a few coins — and sometimes a
        cosmetic!
      </Text>

      {confirmedPets.length === 0 ? (
        <View style={styles.activitiesEmptyCard}>
          <Text style={styles.activitiesEmptyText}>
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
              {confirmedPets.map((pet) => {
                const isSelected = selectedPetId === pet.id;

                return (
                  <Pressable
                    key={pet.id}
                    style={[
                      styles.activityPetChip,
                      isSelected && {
                        backgroundColor: ARCADE.yellow,
                        borderColor: ARCADE.yellow,
                      },
                    ]}
                    onPress={() => setSelectedPetId(pet.id)}
                  >
                    <Text
                      style={[
                        styles.activityPetChipName,
                        { color: isSelected ? ARCADE.ink : ARCADE.text },
                      ]}
                    >
                      {(pet.name || "Unnamed Pet").toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
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
              <View key={activity.id} style={[styles.activityCard, neonGlow(ARCADE.cyan)]}>
                <View style={styles.activityCardHeader}>
                  <Text style={styles.activityEmoji}>{activity.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityName}>{activity.name.toUpperCase()}</Text>
                    <Text style={styles.activityDescription}>{activity.description}</Text>
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.activityButton,
                    onCooldown
                      ? styles.activityButtonDisabled
                      : { backgroundColor: pressed ? "#FFE58A" : ARCADE.yellow },
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
                    {onCooldown ? `READY IN ${remainingSec}S` : `LET'S GO!`}
                  </Text>
                </Pressable>

                {resultText[activity.id] && (
                  <Text style={styles.activityResultText}>
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
  // Explicit 100% size is required: RN Web otherwise renders a local
  // require() image at its natural pixel size. Written out literally since
  // absoluteFillObject isn't in this project's RN types.
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },

  // Rect comes from computeScreenGlassRect; clips anything past the bezel.
  screenGlass: {
    position: "absolute",
    overflow: "hidden",
  },

  // Explicit size so the ScrollView fills the glass instead of its content.
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

  // Arcade "CREDITS" coin counter.
  creditsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    backgroundColor: ARCADE.panel,
    borderWidth: 2,
    borderColor: ARCADE.yellow,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 22,
    boxShadow: `0 0 10px ${ARCADE.yellow}80`,
  },

  creditsLabel: {
    fontFamily: ARCADE_FONT,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: ARCADE.textMuted,
  },

  creditsValue: {
    fontFamily: ARCADE_FONT,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
    color: ARCADE.yellow,
  },

  sectionHeading: {
    fontFamily: ARCADE_FONT,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2,
    color: ARCADE.text,
    alignSelf: "flex-start",
    marginBottom: 12,
    marginTop: 4,
  },

  gamesHeading: {
    color: ARCADE.magenta,
    ...neonText(ARCADE.magenta, 8),
  },

  passiveHeading: {
    color: ARCADE.cyan,
    ...neonText(ARCADE.cyan, 8),
  },

  activitiesSection: {
    width: "100%",
    marginBottom: 28,
  },

  activitiesSubtitle: {
    fontFamily: ARCADE_FONT,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    color: ARCADE.textMuted,
    marginBottom: 14,
  },

  activitiesEmptyCard: {
    backgroundColor: ARCADE.panel,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: ARCADE.cyan,
  },

  activitiesEmptyText: {
    fontFamily: ARCADE_FONT,
    fontSize: 12,
    fontWeight: "700",
    color: ARCADE.text,
    textAlign: "center",
  },

  activityPetRow: {
    gap: 8,
    paddingBottom: 12,
  },

  activityPetChip: {
    backgroundColor: ARCADE.panel,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: ARCADE.cyan,
  },

  activityPetChipName: {
    fontFamily: ARCADE_FONT,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },

  activityCard: {
    backgroundColor: ARCADE.panel,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: ARCADE.cyan,
  },

  activityCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },

  activityEmoji: {
    fontSize: 30,
  },

  activityName: {
    fontFamily: ARCADE_FONT,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
    color: ARCADE.text,
    marginBottom: 2,
  },

  activityDescription: {
    fontFamily: ARCADE_FONT,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    color: ARCADE.textMuted,
  },

  activityButton: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },

  activityButtonDisabled: {
    backgroundColor: "#1B2160",
  },

  activityButtonText: {
    fontFamily: ARCADE_FONT,
    color: ARCADE.ink,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1.5,
  },

  activityButtonTextDisabled: {
    color: ARCADE.textDim,
  },

  activityResultText: {
    fontFamily: ARCADE_FONT,
    fontSize: 12,
    fontWeight: "800",
    color: ARCADE.green,
    textAlign: "center",
    marginTop: 10,
    ...neonText(ARCADE.green, 6),
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },

  // Border color + glow are per-card (see NEON_CYCLE), applied inline at the call site.
  gameCard: {
    backgroundColor: ARCADE.panel,
    borderRadius: 10,
    borderWidth: 2,
    paddingVertical: 10,
    paddingHorizontal: 10,
    width: "47%",
    alignItems: "center",
  },

  gameCardLocked: {
    opacity: 0.45,
  },

  gameNumber: {
    fontFamily: ARCADE_FONT,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    alignSelf: "flex-start",
    marginBottom: 6,
  },

  gameEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },

  gameName: {
    fontFamily: ARCADE_FONT,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: ARCADE.text,
    textAlign: "center",
    marginBottom: 4,
  },

  gameDescription: {
    fontFamily: ARCADE_FONT,
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 14,
    color: ARCADE.textMuted,
    textAlign: "center",
    marginBottom: 8,
  },

  gamePlayTag: {
    fontFamily: ARCADE_FONT,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: "auto",
  },
});
