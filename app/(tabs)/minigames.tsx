import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CoinIcon } from "../../components/ui/CoinIcon";
import { FetchFrenzyGame } from "../../components/minigames/FetchFrenzyGame";
import { MarkYourTerritoryGame } from "../../components/minigames/MarkYourTerritoryGame";
import { PetMinesweeperGame } from "../../components/minigames/PetMinesweeperGame";
import { SimonSaysGame } from "../../components/minigames/SimonSaysGame";
import { TabBackground } from "../../components/ui/TabBackground";
import { TightSqueezeGame } from "../../components/minigames/TightSqueezeGame";
import { PetEntry, usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";
import { COSMETICS } from "../../data/cosmetics";
import { useTabBarClearance } from "../../hooks/useTabBarClearance";
import { getTabBarStyle } from "./_layout";

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
    <View style={{ flex: 1 }}>
      <TabBackground />

      <ScrollView
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
  container: {
    flexGrow: 1,
    backgroundColor: "transparent",
    padding: 20,
    paddingTop: 80,
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
