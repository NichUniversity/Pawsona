import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { CoinIcon } from "../../components/ui/CoinIcon";
import { PressableScale } from "../../components/ui/PressableScale";
import { TabBackground } from "../../components/ui/TabBackground";
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
    emoji: "🕳️",
    available: true,
    description: "Navigate the narrow passage — one touch and it's over!",
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

// --- Paw Pattern (Simon Says) ---

const PADS = [
  { id: 0, emoji: "🐾", color: "#FFB067" },
  { id: 1, emoji: "🦴", color: "#FFD98E" },
  { id: 2, emoji: "🎾", color: "#8FD9A8" },
  { id: 3, emoji: "🐕", color: "#8EC5FF" },
] as const;

const COINS_PER_ROUND = 5;
const SHOW_DURATION = 500;
const GAP_DURATION = 250;

function SimonSaysGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [sequence, setSequence] = useState<number[]>([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [isShowingSequence, setIsShowingSequence] = useState(false);
  const [activePad, setActivePad] = useState<number | null>(null);
  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">(
    "idle"
  );
  // Measured size of the play area below the title/round text — the pad grid is sized to fill it (see padGridSize below) instead of the old fixed 220x220 box.
  const [playAreaSize, setPlayAreaSize] = useState({ width: 0, height: 0 });

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAllTimeouts = () => {
    timeouts.current.forEach((t) => clearTimeout(t));
    timeouts.current = [];
  };

  useEffect(() => {
    return () => clearAllTimeouts();
  }, []);

  const playSequence = (seq: number[]) => {
    setIsShowingSequence(true);
    setActivePad(null);

    seq.forEach((padId, i) => {
      const onTime = i * (SHOW_DURATION + GAP_DURATION);
      const offTime = onTime + SHOW_DURATION;

      timeouts.current.push(
        setTimeout(() => setActivePad(padId), onTime)
      );
      timeouts.current.push(
        setTimeout(() => setActivePad(null), offTime)
      );
    });

    const doneTime = seq.length * (SHOW_DURATION + GAP_DURATION);
    timeouts.current.push(
      setTimeout(() => {
        setIsShowingSequence(false);
        setPlayerIndex(0);
      }, doneTime)
    );
  };

  const startGame = () => {
    clearAllTimeouts();
    const firstPad = Math.floor(Math.random() * PADS.length);
    const newSequence = [firstPad];

    setSequence(newSequence);
    setRound(1);
    setGameState("playing");
    playSequence(newSequence);
  };

  const nextRound = (currentSequence: number[]) => {
    const nextPad = Math.floor(Math.random() * PADS.length);
    const newSequence = [...currentSequence, nextPad];

    setSequence(newSequence);
    setRound((r) => r + 1);
    playSequence(newSequence);
  };

  const handlePadPress = (padId: number) => {
    if (gameState !== "playing" || isShowingSequence) return;

    setActivePad(padId);
    timeouts.current.push(setTimeout(() => setActivePad(null), 200));

    const expected = sequence[playerIndex];

    if (padId !== expected) {
      clearAllTimeouts();
      setGameState("gameover");
      return;
    }

    const nextPlayerIndex = playerIndex + 1;

    if (nextPlayerIndex === sequence.length) {
      earnCoins(COINS_PER_ROUND);
      timeouts.current.push(
        setTimeout(() => nextRound(sequence), 600)
      );
    } else {
      setPlayerIndex(nextPlayerIndex);
    }
  };

  const handleExit = () => {
    clearAllTimeouts();
    onExit();
  };

  // Pad grid fills the measured play area (a square inscribed in it, capped so pads don't balloon absurdly large on a big screen) instead of the old fixed 220-wide grid of 100x100 pads.
  const padGridSize = Math.max(
    160,
    Math.min(playAreaSize.width, playAreaSize.height, 520) - 8
  );
  const padGap = Math.round(padGridSize * 0.06);
  const padSize = Math.floor((padGridSize - padGap) / 2);

  return (
    <View style={[styles.gameFullScreen, { backgroundColor: theme.card.background }]}>
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
        onPress={handleExit}
      >
        <Text style={[styles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      <View
        style={[
          styles.gameFullScreenContent,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <Text style={[styles.gameTitle, { color: theme.text.primary }]}>🐾 Paw Pattern</Text>

        {gameState !== "idle" && (
          <>
            <Text style={[styles.roundText, { color: theme.text.primary }]}>
              {gameState === "playing"
                ? isShowingSequence
                  ? "Watch closely..."
                  : "Your turn!"
                : "Game Over"}
            </Text>
            <Text style={[styles.roundSubtext, { color: theme.text.secondary }]}>Round {round}</Text>
          </>
        )}

        <View
          style={styles.gameFullScreenPlayWrap}
          onLayout={(e) => {
            const width = Math.round(e.nativeEvent.layout.width);
            const height = Math.round(e.nativeEvent.layout.height);
            setPlayAreaSize((prev) =>
              prev.width === width && prev.height === height ? prev : { width, height }
            );
          }}
        >
          {gameState === "idle" ? (
            <View style={styles.gameFullScreenIdleContent}>
              <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
                Watch the pattern, then repeat it back. Every round earns{" "}
                <CoinIcon size={13} /> {COINS_PER_ROUND}!
              </Text>
              <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
                <Text style={styles.primaryButtonText}>Start Game</Text>
              </PressableScale>
            </View>
          ) : (
            playAreaSize.width > 0 && (
              <View style={[styles.padGrid, { width: padGridSize, gap: padGap }]}>
                {PADS.map((pad) => (
                  <PressableScale
                    key={pad.id}
                    style={[
                      styles.pad,
                      { width: padSize, height: padSize, backgroundColor: pad.color },
                      activePad === pad.id && styles.padActive,
                    ]}
                    onPress={() => handlePadPress(pad.id)}
                    disabled={gameState !== "playing" || isShowingSequence}
                  >
                    <Text style={[styles.padEmoji, { fontSize: Math.round(36 * (padSize / 100)) }]}>
                      {pad.emoji}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            )
          )}
        </View>

        {gameState === "gameover" && (
          <>
            <Text style={[styles.gameOverText, { color: theme.text.primary }]}>
              You made it to round {round}! 🎉
            </Text>
            <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
              <Text style={styles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </>
        )}
      </View>
    </View>
  );
}

// --- Sniff & Seek (pet-themed Minesweeper) ---

const GRID_SIZE = 6;
const HAZARD_COUNT = 6;
const WIN_REWARD = 30;

type Cell = {
  hazard: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
};

function makeGrid(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({
      hazard: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }))
  );

  let placed = 0;
  while (placed < HAZARD_COUNT) {
    const r = Math.floor(Math.random() * GRID_SIZE);
    const c = Math.floor(Math.random() * GRID_SIZE);
    if (!grid[r][c].hazard) {
      grid[r][c].hazard = true;
      placed++;
    }
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c].hazard) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (
            nr >= 0 &&
            nr < GRID_SIZE &&
            nc >= 0 &&
            nc < GRID_SIZE &&
            grid[nr][nc].hazard
          ) {
            count++;
          }
        }
      }
      grid[r][c].adjacent = count;
    }
  }

  return grid;
}

function countSafeCells() {
  return GRID_SIZE * GRID_SIZE - HAZARD_COUNT;
}

function numberColor(n: number) {
  switch (n) {
    case 1:
      return "#3B82F6";
    case 2:
      return "#22A45D";
    case 3:
      return "#EF4444";
    case 4:
      return "#7C3AED";
    default:
      return "#B45309";
  }
}

function PetMinesweeperGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [grid, setGrid] = useState<Cell[][]>(() => makeGrid());
  const [gameState, setGameState] = useState<"playing" | "won" | "lost">(
    "playing"
  );
  const [revealedCount, setRevealedCount] = useState(0);
  // Measured size of the play area below the title/subtitle — grid cells are sized to fill it (see cellSize below) instead of the old fixed 42px cells.
  const [playAreaSize, setPlayAreaSize] = useState({ width: 0, height: 0 });

  const resetGame = () => {
    setGrid(makeGrid());
    setGameState("playing");
    setRevealedCount(0);
  };

  const revealCell = (row: number, col: number) => {
    if (gameState !== "playing") return;
    const cell = grid[row][col];
    if (cell.revealed || cell.flagged) return;

    const newGrid = grid.map((r) => r.map((c) => ({ ...c })));

    if (newGrid[row][col].hazard) {
      newGrid.forEach((r) =>
        r.forEach((c) => {
          if (c.hazard) c.revealed = true;
        })
      );
      setGrid(newGrid);
      setGameState("lost");
      return;
    }

    let newlyRevealed = 0;
    const stack: [number, number][] = [[row, col]];

    while (stack.length > 0) {
      const [r, c] = stack.pop()!;
      const current = newGrid[r][c];
      if (current.revealed || current.hazard) continue;

      current.revealed = true;
      newlyRevealed++;

      if (current.adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (
              nr >= 0 &&
              nr < GRID_SIZE &&
              nc >= 0 &&
              nc < GRID_SIZE &&
              !newGrid[nr][nc].revealed &&
              !newGrid[nr][nc].hazard
            ) {
              stack.push([nr, nc]);
            }
          }
        }
      }
    }

    setGrid(newGrid);

    const totalRevealed = revealedCount + newlyRevealed;
    setRevealedCount(totalRevealed);

    if (totalRevealed >= countSafeCells()) {
      setGameState("won");
      earnCoins(WIN_REWARD);
    }
  };

  const toggleFlag = (row: number, col: number) => {
    if (gameState !== "playing") return;
    const cell = grid[row][col];
    if (cell.revealed) return;

    const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
    newGrid[row][col].flagged = !newGrid[row][col].flagged;
    setGrid(newGrid);
  };

  // Each cell fills an equal share of the measured play area (a square inscribed in it, capped so cells don't balloon absurdly large on a big screen) instead of the old fixed 42px cells.
  const boardSize = Math.max(180, Math.min(playAreaSize.width, playAreaSize.height, 540));
  const cellSize = Math.floor(boardSize / GRID_SIZE);
  const cellFontSize = Math.max(12, Math.round(16 * (cellSize / 42)));

  return (
    <View style={[styles.gameFullScreen, { backgroundColor: theme.card.background }]}>
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
        <Text style={[styles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      <View
        style={[
          styles.gameFullScreenContent,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <Text style={[styles.gameTitle, { color: theme.text.primary }]}>🦴 Sniff & Seek</Text>
        <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
          Tap to dig. Long-press to mark a spot you think has a skunk 🦨. Clear
          every safe square to earn <CoinIcon size={13} /> {WIN_REWARD}!
        </Text>

        <View
          style={styles.gameFullScreenPlayWrap}
          onLayout={(e) => {
            const width = Math.round(e.nativeEvent.layout.width);
            const height = Math.round(e.nativeEvent.layout.height);
            setPlayAreaSize((prev) =>
              prev.width === width && prev.height === height ? prev : { width, height }
            );
          }}
        >
          {playAreaSize.width > 0 && (
            <View style={styles.mineGrid}>
              {grid.map((rowCells, r) => (
                <View key={r} style={styles.mineRow}>
                  {rowCells.map((cell, c) => {
                    let content = "";
                    let textColor = "#333";

                    if (cell.flagged && !cell.revealed) {
                      content = "🚩";
                    } else if (cell.revealed) {
                      if (cell.hazard) {
                        content = "🦨";
                      } else if (cell.adjacent > 0) {
                        content = String(cell.adjacent);
                        textColor = numberColor(cell.adjacent);
                      } else {
                        content = "";
                      }
                    }

                    return (
                      <PressableScale
                        key={c}
                        style={[
                          styles.mineCell,
                          { width: cellSize, height: cellSize },
                          cell.revealed && styles.mineCellRevealed,
                          cell.revealed && cell.hazard && styles.mineCellHazard,
                        ]}
                        onPress={() => revealCell(r, c)}
                        onLongPress={() => toggleFlag(r, c)}
                        disabled={gameState !== "playing"}
                      >
                        <Text style={[styles.mineCellText, { color: textColor, fontSize: cellFontSize }]}>
                          {content}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>

        {gameState === "won" && (
          <>
            <Text style={[styles.gameOverText, { color: theme.text.primary }]}>
              You found every bone! 🎉 +{WIN_REWARD} coins
            </Text>
            <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={resetGame}>
              <Text style={styles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </>
        )}

        {gameState === "lost" && (
          <>
            <Text style={[styles.gameOverText, { color: theme.text.primary }]}>
              Uh oh, a skunk got startled! Try again.
            </Text>
            <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={resetGame}>
              <Text style={styles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </>
        )}
      </View>
    </View>
  );
}

// --- Fetch Frenzy (catch what falls) — replaces Pup Parkour. Template built from placeholder emoji visuals (🎾🦴🪨🐕); once sprite sheets are provided, swap FF_ITEM_VISUALS' `emoji` fields and the dog's <Text> below for <Image> sources — spawn/collision/scoring/health logic is all keyed off `kind` and the numeric layout constants below, so none of that needs to change. ---

// Base/reference design size Fetch Frenzy was originally built at — kept only as the denominator for the scale factor below. The actual on-screen track now fills whatever screen it's running full-screen on (see computeFetchFrenzyLayout), not this fixed size.
const FF_TRACK_WIDTH = 280;
const FF_TRACK_HEIGHT = 400;

// The dog acts as a paddle: a falling item is "caught" when its center lands within the (screen-scaled) catch half-height of the dog's catch Y, and within half the dog's own (screen-scaled) width of its center — wider than the visual dog so catching feels fair even with a placeholder emoji that doesn't fill its box edge-to-edge. These BASE constants are the design-time sizes at FF_TRACK_WIDTH/HEIGHT; computeFetchFrenzyLayout scales them to the measured screen.
const FF_DOG_WIDTH_BASE = 64;
const FF_DOG_HEIGHT_BASE = 46;
const FF_DOG_BOTTOM_BASE = 14;
const FF_CATCH_HALF_HEIGHT_BASE = 22;

const FF_ITEM_SIZE_BASE = 30;

const FF_TICK_MS = 33;
const FF_BASE_FALL_SPEED = 140; // px / second at FF_TRACK_HEIGHT's scale — scaled by the measured track's own height at runtime (computeFetchFrenzyLayout), so items take about the same time to cross the track on any screen size.
const FF_MAX_FALL_SPEED = 320;
const FF_SPEED_RAMP_PER_POINT = 3;

const FF_BASE_SPAWN_MS = 900;
const FF_MIN_SPAWN_MS = 380;
const FF_SPAWN_RAMP_PER_POINT = 6;

const FF_MAX_HEALTH = 5;
// Fraction of spawns that are a bad item (rock) rather than a good one (ball/bone, picked 50/50 between the two the rest of the time).
const FF_ROCK_CHANCE = 0.3;
// Coins on game over = floor(finalScore / this) — same "divide the score down" shape Pup Parkour used for COINS_PER_DISTANCE.
const FF_COINS_PER_POINT = 4;

type FetchFrenzyItemKind = "ball" | "bone" | "rock";

// Placeholder visuals keyed by kind — `good: true` items add to score when caught, `good: false` (rock) costs health. Swap `emoji` for a real sprite Image source here once the sheets arrive.
const FF_ITEM_VISUALS: Record<FetchFrenzyItemKind, { emoji: string; good: boolean }> = {
  ball: { emoji: "🎾", good: true },
  bone: { emoji: "🦴", good: true },
  rock: { emoji: "🪨", good: false },
};

type FetchFrenzyItem = {
  id: number;
  kind: FetchFrenzyItemKind;
  x: number; // left position within the track
  y: number; // top position within the track
};

// Every pixel size/speed in Fetch Frenzy is derived from the actual measured play area (trackWidth/trackHeight) rather than the fixed BASE constants above, so the game genuinely fills whatever screen it's running full-screen on instead of sitting in a small fixed box. scaleX/scaleY compare the measured size against the original 280x400 design size.
function computeFetchFrenzyLayout(trackWidth: number, trackHeight: number) {
  const width = Math.max(220, trackWidth);
  const height = Math.max(280, trackHeight);
  const scaleX = width / FF_TRACK_WIDTH;
  const scaleY = height / FF_TRACK_HEIGHT;
  const dogWidth = FF_DOG_WIDTH_BASE * scaleX;
  const dogHeight = FF_DOG_HEIGHT_BASE * scaleX;
  const dogBottom = FF_DOG_BOTTOM_BASE * scaleY;
  const dogCatchY = height - dogBottom - dogHeight / 2;
  const catchHalfHeight = FF_CATCH_HALF_HEIGHT_BASE * scaleY;
  const itemSize = FF_ITEM_SIZE_BASE * scaleX;
  return { width, height, scaleX, scaleY, dogWidth, dogHeight, dogBottom, dogCatchY, catchHalfHeight, itemSize };
}

function spawnFetchFrenzyItem(id: number, trackWidth: number, itemSize: number): FetchFrenzyItem {
  const isRock = Math.random() < FF_ROCK_CHANCE;
  const kind: FetchFrenzyItemKind = isRock ? "rock" : Math.random() < 0.5 ? "ball" : "bone";
  const x = Math.random() * (trackWidth - itemSize);
  return { id, kind, x, y: -itemSize };
}

function FetchFrenzyGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">(
    "idle"
  );
  const [items, setItems] = useState<FetchFrenzyItem[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [health, setHealth] = useState(FF_MAX_HEALTH);
  const [lastCoins, setLastCoins] = useState(0);
  // Measured size of the play area below the title/score/health bar — the track is sized to fill it (see computeFetchFrenzyLayout) instead of the old fixed 280x400 box. Always mounted (even on the idle screen) so a size is already known the moment Start Game is pressed.
  const [playAreaSize, setPlayAreaSize] = useState({ width: 0, height: 0 });

  // Mutable refs mirror state above so the interval tick and pan handlers always read fresh values, not a stale closure — same pattern Pup Parkour used.
  const gameStateRef = useRef(gameState);
  const scoreRef = useRef(0);
  const healthRef = useRef(FF_MAX_HEALTH);
  const spawnTimerRef = useRef(0);
  const nextIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirrors playAreaSize into a ref so the PanResponder (created once and never recreated) and imperative functions like startGame always read the latest measured size rather than a stale closure.
  const trackSizeRef = useRef({ width: FF_TRACK_WIDTH, height: FF_TRACK_HEIGHT });
  // Dog's left position within the track — tracked in a plain ref (not React state) since it changes on every pan-move event; dogX (the Animated.Value below) drives the actual on-screen position via a native-driven transform, so dragging never triggers a re-render.
  const dogXRef = useRef(0);
  const dogDragStartXRef = useRef(0);
  const dogX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const endGame = () => {
    if (gameStateRef.current !== "playing") return;
    gameStateRef.current = "gameover";
    setGameState("gameover");

    const finalScore = scoreRef.current;
    setBest((prev) => Math.max(prev, finalScore));

    const coinsEarned = Math.floor(finalScore / FF_COINS_PER_POINT);
    if (coinsEarned > 0) earnCoins(coinsEarned);
    setLastCoins(coinsEarned);
  };

  const tick = () => {
    const layout = computeFetchFrenzyLayout(trackSizeRef.current.width, trackSizeRef.current.height);
    const dt = FF_TICK_MS / 1000;
    const speedBase = Math.min(
      FF_MAX_FALL_SPEED,
      FF_BASE_FALL_SPEED + scoreRef.current * FF_SPEED_RAMP_PER_POINT
    );
    const speed = speedBase * layout.scaleY;

    // Spawn new items on a difficulty-scaled timer.
    spawnTimerRef.current += FF_TICK_MS;
    const spawnInterval = Math.max(
      FF_MIN_SPAWN_MS,
      FF_BASE_SPAWN_MS - scoreRef.current * FF_SPAWN_RAMP_PER_POINT
    );
    let shouldSpawn = false;
    if (spawnTimerRef.current >= spawnInterval) {
      spawnTimerRef.current = 0;
      shouldSpawn = true;
    }

    setItems((prev) => {
      const moved = prev.map((it) => ({ ...it, y: it.y + speed * dt }));
      const dogCenterX = dogXRef.current + layout.dogWidth / 2;

      let scoreGained = 0;
      let healthLost = 0;
      const survivors = moved.filter((it) => {
        const itemCenterY = it.y + layout.itemSize / 2;
        const itemCenterX = it.x + layout.itemSize / 2;
        const withinCatchY = Math.abs(itemCenterY - layout.dogCatchY) <= layout.catchHalfHeight;
        const withinCatchX = Math.abs(itemCenterX - dogCenterX) <= layout.dogWidth / 2;
        if (withinCatchY && withinCatchX) {
          // Caught — good items score, the rock costs health. Either way it's removed here rather than continuing to fall.
          if (FF_ITEM_VISUALS[it.kind].good) {
            scoreGained += 1;
          } else {
            healthLost += 1;
          }
          return false;
        }
        // Not caught — keep it while it's still on-screen; anything that falls past the bottom uncaught is simply gone, good or bad, with no penalty either way.
        return it.y < layout.height + layout.itemSize;
      });

      if (scoreGained > 0) {
        scoreRef.current += scoreGained;
        setScore(scoreRef.current);
      }
      if (healthLost > 0) {
        healthRef.current = Math.max(0, healthRef.current - healthLost);
        setHealth(healthRef.current);
        if (healthRef.current <= 0) {
          // Defer to avoid updating state mid-update-of-another-state, same as Pup Parkour's hit-triggered endGame.
          setTimeout(endGame, 0);
        }
      }

      if (shouldSpawn) {
        survivors.push(spawnFetchFrenzyItem(nextIdRef.current++, layout.width, layout.itemSize));
      }

      return survivors;
    });
  };

  useEffect(() => {
    if (gameState !== "playing") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(tick, FF_TICK_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const startGame = () => {
    const layout = computeFetchFrenzyLayout(trackSizeRef.current.width, trackSizeRef.current.height);
    setItems([]);
    setScore(0);
    scoreRef.current = 0;
    setHealth(FF_MAX_HEALTH);
    healthRef.current = FF_MAX_HEALTH;
    spawnTimerRef.current = 0;
    nextIdRef.current = 0;
    dogXRef.current = (layout.width - layout.dogWidth) / 2;
    dogX.setValue(dogXRef.current);
    setGameState("playing");
    gameStateRef.current = "playing";
  };

  // Continuous 1:1 drag — the dog tracks the finger directly rather than snapping between lanes, matching "slide it across the screen" rather than Pup Parkour's discrete-lane swipe. Reads trackSizeRef (not React state) so the clamp bound always reflects the latest measured screen size even though the PanResponder itself is only ever created once.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => gameStateRef.current === "playing",
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        gameStateRef.current === "playing" && Math.abs(gesture.dx) > 2,
      onPanResponderGrant: () => {
        dogDragStartXRef.current = dogXRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        if (gameStateRef.current !== "playing") return;
        const layout = computeFetchFrenzyLayout(trackSizeRef.current.width, trackSizeRef.current.height);
        const next = Math.max(
          0,
          Math.min(layout.width - layout.dogWidth, dogDragStartXRef.current + gesture.dx)
        );
        dogXRef.current = next;
        dogX.setValue(next);
      },
    })
  ).current;

  const layout = computeFetchFrenzyLayout(
    playAreaSize.width || trackSizeRef.current.width,
    playAreaSize.height || trackSizeRef.current.height
  );

  return (
    <View style={[styles.gameFullScreen, { backgroundColor: theme.card.background }]}>
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
        <Text style={[styles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      <View
        style={[
          styles.gameFullScreenContent,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <Text style={[styles.gameTitle, { color: theme.text.primary }]}>🎾 Fetch Frenzy</Text>

        {gameState !== "idle" && (
          <>
            <View style={[styles.scoreRow, { width: layout.width }]}>
              <Text style={[styles.scoreText, { color: theme.text.primary }]}>🎾 {score}</Text>
              <Text style={[styles.bestScoreText, { color: theme.text.secondary }]}>Best {Math.max(best, score)}</Text>
            </View>

            {/* Plain placeholder health bar — restyle to match the sprite sheet's art once it's provided, same way the marking meter (TerritoryMeterScribbleTrack) later got its own hand-drawn treatment. */}
            <View style={[styles.ffHealthTrack, { width: layout.width }]}>
              <View style={[styles.ffHealthFill, { width: `${(health / FF_MAX_HEALTH) * 100}%` }]} />
            </View>
          </>
        )}

        <View
          style={styles.gameFullScreenPlayWrap}
          onLayout={(e) => {
            const width = Math.round(e.nativeEvent.layout.width);
            const height = Math.round(e.nativeEvent.layout.height);
            trackSizeRef.current = { width, height };
            setPlayAreaSize((prev) =>
              prev.width === width && prev.height === height ? prev : { width, height }
            );
          }}
        >
          {gameState === "idle" ? (
            <View style={styles.gameFullScreenIdleContent}>
              <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
                Slide your dog side to side to catch tennis balls 🎾 and bones 🦴
                as they fall — dodge the rocks 🪨, they cost you health! Fill your
                score with catches to earn <CoinIcon size={13} /> coins.
              </Text>
              <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
                <Text style={styles.primaryButtonText}>Start Game</Text>
              </PressableScale>
            </View>
          ) : (
            playAreaSize.width > 0 && (
              <View
                style={[styles.ffTrack, { width: layout.width, height: layout.height }]}
                {...panResponder.panHandlers}
              >
                {items.map((it) => (
                  <Text
                    key={it.id}
                    style={[
                      styles.ffItemEmoji,
                      {
                        left: it.x,
                        top: it.y,
                        fontSize: layout.itemSize,
                        width: layout.itemSize,
                        height: layout.itemSize,
                        lineHeight: layout.itemSize,
                      },
                    ]}
                  >
                    {FF_ITEM_VISUALS[it.kind].emoji}
                  </Text>
                ))}

                <Animated.View
                  style={[
                    styles.ffDogWrapper,
                    {
                      width: layout.dogWidth,
                      height: layout.dogHeight,
                      bottom: layout.dogBottom,
                      transform: [{ translateX: dogX }],
                    },
                  ]}
                >
                  <Text style={[styles.ffDogEmoji, { fontSize: Math.round(36 * layout.scaleX) }]}>🐕</Text>
                </Animated.View>
              </View>
            )
          )}
        </View>

        {gameState === "playing" && (
          <Text style={[styles.instructionsText, { color: theme.text.secondary }]}>
            Slide to catch · Dodge the rocks
          </Text>
        )}

        {gameState === "gameover" && (
          <>
            <Text style={[styles.gameOverText, { color: theme.text.primary }]}>
              {health <= 0 ? "Out of health! " : ""}You caught {score}! 🎉{" "}
              {lastCoins > 0 ? `+${lastCoins} coins` : "Catch a few more next time!"}
            </Text>
            <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
              <Text style={styles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </>
        )}
      </View>
    </View>
  );
}

// --- Tight Squeeze (narrow-passage navigation, one touch = game over) — Template built from a placeholder emoji dog (🐕) and SVG-drawn cave walls; once a real sprite sheet is provided, swap the dog's <Text> below for an <Image> — the wall rendering, spawn/collision logic is all driven by the numeric layout constants below and doesn't reference the dog's visuals at all. ---

// Base/reference design size Tight Squeeze was originally built at — kept only as the denominator for the scale factor below. The actual on-screen track now fills whatever screen it's running full-screen on (see computeTightSqueezeLayout), not this fixed size.
const TS_TRACK_WIDTH = 280;
const TS_TRACK_HEIGHT = 400;

// The dog sits at a fixed vertical position near the bottom of the track; the passage scrolls down past it. Collision is checked against this fixed Y every tick, interpolated between the two passage nodes bracketing it. These BASE constants are the design-time sizes at TS_TRACK_WIDTH/HEIGHT; computeTightSqueezeLayout scales them to the measured screen.
const TS_DOG_WIDTH_BASE = 28;
const TS_DOG_HEIGHT_BASE = 28;
const TS_DOG_BOTTOM_BASE = 70;
// Shrinks the dog's collision box in from its visual edges on each side, so a near-miss against the placeholder emoji (which doesn't fill its box edge-to-edge) still feels fair.
const TS_DOG_COLLISION_INSET_BASE = 5;

const TS_TICK_MS = 33;
const TS_BASE_SPEED = 100; // px / second, how fast the passage scrolls down
const TS_MAX_SPEED = 240;
const TS_SPEED_RAMP_PER_POINT = 2;

// Passage width (half-width in px either side of its center line) narrows as score climbs.
const TS_BASE_HALF_WIDTH = 60;
const TS_MIN_HALF_WIDTH = 24;
const TS_NARROW_RAMP_PER_POINT = 0.5;

// Vertical spacing between generated passage nodes, and how far the passage's center can drift left/right from one node to the next (a random walk).
const TS_NODE_SPACING = 40;
const TS_MAX_STEP = 24;

// Score ticks up with distance traveled (1 point per this many px), not per-item like Fetch Frenzy — there's nothing to catch here, just distance survived.
const TS_SCORE_DISTANCE = 30;
// Coins on game over = floor(finalScore / this) — same "divide the score down" shape the other games use.
const TS_COINS_PER_POINT = 10;

type TightSqueezeNode = {
  id: number;
  y: number; // vertical position within the track; increases as the node scrolls down
  centerX: number; // passage center line at this node
  halfWidth: number; // passage half-width at this node
};

// Full-height seed of straight, comfortably-wide nodes spanning one screen above and through the visible track, so the player isn't dropped into narrow/winding terrain immediately. Nodes stay sorted ascending by y (topmost first) for the whole game — new nodes are always prepended with a smaller y than the current topmost, and every node moves down by the same amount each tick, so relative order is preserved without ever needing to re-sort. Takes the measured/scaled track dimensions rather than the fixed module constants, so the seed fills whatever screen it's running on.
function buildTightSqueezeSeedNodes(
  trackWidth: number,
  trackHeight: number,
  nodeSpacing: number,
  halfWidth: number
): TightSqueezeNode[] {
  const nodes: TightSqueezeNode[] = [];
  let id = 0;
  for (let y = -trackHeight; y <= trackHeight + nodeSpacing; y += nodeSpacing) {
    nodes.push({ id: id++, y, centerX: trackWidth / 2, halfWidth });
  }
  return nodes;
}

// Linearly interpolates the passage's center/half-width at an arbitrary y between the two nodes bracketing it — used every tick to test the dog's fixed Y against the (scrolling) passage.
function tightSqueezeBoundsAtY(
  nodes: TightSqueezeNode[],
  y: number
): { centerX: number; halfWidth: number } | null {
  if (nodes.length === 0) return null;
  if (y <= nodes[0].y) return { centerX: nodes[0].centerX, halfWidth: nodes[0].halfWidth };
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (y >= a.y && y <= b.y) {
      const span = b.y - a.y;
      const t = span > 0 ? (y - a.y) / span : 0;
      return {
        centerX: a.centerX + (b.centerX - a.centerX) * t,
        halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t,
      };
    }
  }
  const last = nodes[nodes.length - 1];
  return { centerX: last.centerX, halfWidth: last.halfWidth };
}

// Builds one wall as a filled SVG polygon: a straight outer edge along the track's own edge, and a jagged inner edge tracing the passage boundary through every node — the gap between the two edges is what reads as "rock". Placeholder styling (flat fill); revisit once real cave/wall art is available. Takes the measured track width rather than the fixed module constant.
function buildTightSqueezeWallPath(nodes: TightSqueezeNode[], side: "left" | "right", trackWidth: number): string {
  if (nodes.length === 0) return "";
  const outerX = side === "left" ? 0 : trackWidth;
  const innerX = (n: TightSqueezeNode) =>
    side === "left" ? n.centerX - n.halfWidth : n.centerX + n.halfWidth;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  let d = `M ${outerX} ${first.y} L ${outerX} ${last.y}`;
  for (let i = nodes.length - 1; i >= 0; i--) {
    d += ` L ${innerX(nodes[i])} ${nodes[i].y}`;
  }
  d += " Z";
  return d;
}

// Every pixel size/speed in Tight Squeeze is derived from the actual measured play area (trackWidth/trackHeight) rather than the fixed BASE constants, so the game genuinely fills whatever screen it's running full-screen on instead of sitting in a small fixed box. scaleX/scaleY compare the measured size against the original 280x400 design size.
function computeTightSqueezeLayout(trackWidth: number, trackHeight: number) {
  const width = Math.max(220, trackWidth);
  const height = Math.max(280, trackHeight);
  const scaleX = width / TS_TRACK_WIDTH;
  const scaleY = height / TS_TRACK_HEIGHT;
  const dogWidth = TS_DOG_WIDTH_BASE * scaleX;
  const dogHeight = TS_DOG_HEIGHT_BASE * scaleX;
  const dogBottom = TS_DOG_BOTTOM_BASE * scaleY;
  const dogY = height - dogBottom - dogHeight / 2;
  const dogCollisionInset = TS_DOG_COLLISION_INSET_BASE * scaleX;
  const nodeSpacing = TS_NODE_SPACING * scaleY;
  const baseHalfWidth = TS_BASE_HALF_WIDTH * scaleX;
  const minHalfWidth = TS_MIN_HALF_WIDTH * scaleX;
  const narrowRampPerPoint = TS_NARROW_RAMP_PER_POINT * scaleX;
  const maxStep = TS_MAX_STEP * scaleX;
  const baseSpeed = TS_BASE_SPEED * scaleY;
  const maxSpeed = TS_MAX_SPEED * scaleY;
  const speedRampPerPoint = TS_SPEED_RAMP_PER_POINT * scaleY;
  const scoreDistance = TS_SCORE_DISTANCE * scaleY;
  return {
    width,
    height,
    scaleX,
    scaleY,
    dogWidth,
    dogHeight,
    dogBottom,
    dogY,
    dogCollisionInset,
    nodeSpacing,
    baseHalfWidth,
    minHalfWidth,
    narrowRampPerPoint,
    maxStep,
    baseSpeed,
    maxSpeed,
    speedRampPerPoint,
    scoreDistance,
  };
}

function TightSqueezeGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">(
    "idle"
  );
  const [nodes, setNodes] = useState<TightSqueezeNode[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lastCoins, setLastCoins] = useState(0);
  // Measured size of the play area below the title/score row — the passage is sized to fill it (see computeTightSqueezeLayout) instead of the old fixed 280x400 box. Always mounted (even on the idle screen) so a size is already known the moment Start Game is pressed.
  const [playAreaSize, setPlayAreaSize] = useState({ width: 0, height: 0 });

  // Mutable refs mirror state above so the interval tick and pan handlers always read fresh values, not a stale closure — same pattern as Fetch Frenzy.
  const gameStateRef = useRef(gameState);
  const scoreRef = useRef(0);
  const distanceRef = useRef(0);
  const nodesRef = useRef<TightSqueezeNode[]>([]);
  const nextNodeIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirrors playAreaSize into a ref so the PanResponder (created once and never recreated) and imperative functions like startGame always read the latest measured size rather than a stale closure.
  const trackSizeRef = useRef({ width: TS_TRACK_WIDTH, height: TS_TRACK_HEIGHT });
  // Dog's left position within the track — a plain ref (not React state) since it changes on every pan-move event; dogX (the Animated.Value below) drives the actual on-screen position via a native-driven transform, so dragging never triggers a re-render.
  const dogXRef = useRef(0);
  const dogDragStartXRef = useRef(0);
  const dogX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const endGame = () => {
    if (gameStateRef.current !== "playing") return;
    gameStateRef.current = "gameover";
    setGameState("gameover");

    const finalScore = scoreRef.current;
    setBest((prev) => Math.max(prev, finalScore));

    const coinsEarned = Math.floor(finalScore / TS_COINS_PER_POINT);
    if (coinsEarned > 0) earnCoins(coinsEarned);
    setLastCoins(coinsEarned);
  };

  const tick = () => {
    const layout = computeTightSqueezeLayout(trackSizeRef.current.width, trackSizeRef.current.height);
    const dt = TS_TICK_MS / 1000;
    const speed = Math.min(
      layout.maxSpeed,
      layout.baseSpeed + scoreRef.current * layout.speedRampPerPoint
    );

    distanceRef.current += speed * dt;
    const newScore = Math.floor(distanceRef.current / layout.scoreDistance);
    if (newScore !== scoreRef.current) {
      scoreRef.current = newScore;
      setScore(newScore);
    }

    setNodes((prev) => {
      const moved = prev.map((n) => ({ ...n, y: n.y + speed * dt }));
      // Drop nodes once they've fully scrolled past the bottom.
      const trimmed = moved.filter((n) => n.y <= layout.height + layout.nodeSpacing * 2);
      // Keep a roughly constant buffer of unseen passage above the visible track by spawning a fresh node whenever the current topmost has drifted down too far.
      const topmost = trimmed[0];
      if (topmost && topmost.y > -layout.height + layout.nodeSpacing) {
        const halfWidth = Math.max(
          layout.minHalfWidth,
          layout.baseHalfWidth - scoreRef.current * layout.narrowRampPerPoint
        );
        const rawCenter = topmost.centerX + (Math.random() * 2 - 1) * layout.maxStep;
        const centerX = Math.max(halfWidth, Math.min(layout.width - halfWidth, rawCenter));
        trimmed.unshift({
          id: nextNodeIdRef.current++,
          y: topmost.y - layout.nodeSpacing,
          centerX,
          halfWidth,
        });
      }
      nodesRef.current = trimmed;
      return trimmed;
    });

    // One touch and it's over — check the dog's fixed Y against the (scrolling) passage every tick.
    const bounds = tightSqueezeBoundsAtY(nodesRef.current, layout.dogY);
    if (bounds) {
      const dogLeft = dogXRef.current + layout.dogCollisionInset;
      const dogRight = dogXRef.current + layout.dogWidth - layout.dogCollisionInset;
      const passageLeft = bounds.centerX - bounds.halfWidth;
      const passageRight = bounds.centerX + bounds.halfWidth;
      if (dogLeft < passageLeft || dogRight > passageRight) {
        endGame();
      }
    }
  };

  useEffect(() => {
    if (gameState !== "playing") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(tick, TS_TICK_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const startGame = () => {
    const layout = computeTightSqueezeLayout(trackSizeRef.current.width, trackSizeRef.current.height);
    const seed = buildTightSqueezeSeedNodes(layout.width, layout.height, layout.nodeSpacing, layout.baseHalfWidth);
    nextNodeIdRef.current = seed.length;
    nodesRef.current = seed;
    setNodes(seed);
    setScore(0);
    scoreRef.current = 0;
    distanceRef.current = 0;
    dogXRef.current = (layout.width - layout.dogWidth) / 2;
    dogX.setValue(dogXRef.current);
    setGameState("playing");
    gameStateRef.current = "playing";
  };

  // Continuous 1:1 drag, same control scheme as Fetch Frenzy — the dog tracks the finger directly rather than snapping between lanes. Reads trackSizeRef (not React state) so the clamp bound always reflects the latest measured screen size even though the PanResponder itself is only ever created once.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => gameStateRef.current === "playing",
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        gameStateRef.current === "playing" && Math.abs(gesture.dx) > 2,
      onPanResponderGrant: () => {
        dogDragStartXRef.current = dogXRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        if (gameStateRef.current !== "playing") return;
        const layout = computeTightSqueezeLayout(trackSizeRef.current.width, trackSizeRef.current.height);
        const next = Math.max(
          0,
          Math.min(layout.width - layout.dogWidth, dogDragStartXRef.current + gesture.dx)
        );
        dogXRef.current = next;
        dogX.setValue(next);
      },
    })
  ).current;

  const layout = computeTightSqueezeLayout(
    playAreaSize.width || trackSizeRef.current.width,
    playAreaSize.height || trackSizeRef.current.height
  );

  return (
    <View style={[styles.gameFullScreen, { backgroundColor: theme.card.background }]}>
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
        <Text style={[styles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      <View
        style={[
          styles.gameFullScreenContent,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <Text style={[styles.gameTitle, { color: theme.text.primary }]}>🕳️ Tight Squeeze</Text>

        {gameState !== "idle" && (
          <View style={[styles.scoreRow, { width: layout.width }]}>
            <Text style={[styles.scoreText, { color: theme.text.primary }]}>🕳️ {score}</Text>
            <Text style={[styles.bestScoreText, { color: theme.text.secondary }]}>Best {Math.max(best, score)}</Text>
          </View>
        )}

        <View
          style={styles.gameFullScreenPlayWrap}
          onLayout={(e) => {
            const width = Math.round(e.nativeEvent.layout.width);
            const height = Math.round(e.nativeEvent.layout.height);
            trackSizeRef.current = { width, height };
            setPlayAreaSize((prev) =>
              prev.width === width && prev.height === height ? prev : { width, height }
            );
          }}
        >
          {gameState === "idle" ? (
            <View style={styles.gameFullScreenIdleContent}>
              <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
                Slide your dog through the narrow passage — the walls creep in
                tighter the further you go. One touch and it's game over, so
                steer carefully!
              </Text>
              <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
                <Text style={styles.primaryButtonText}>Start Game</Text>
              </PressableScale>
            </View>
          ) : (
            playAreaSize.width > 0 && (
              <View
                style={[styles.tsTrack, { width: layout.width, height: layout.height }]}
                {...panResponder.panHandlers}
              >
                {/* Placeholder cave walls, drawn fresh from the node list every frame — swap the flat fill for real rock art once it's available; the passage math doesn't change. */}
                <Svg width={layout.width} height={layout.height} style={StyleSheet.absoluteFill}>
                  <Path d={buildTightSqueezeWallPath(nodes, "left", layout.width)} fill="#6B4A31" />
                  <Path d={buildTightSqueezeWallPath(nodes, "right", layout.width)} fill="#6B4A31" />
                </Svg>

                <Animated.View
                  style={[
                    styles.tsDogWrapper,
                    {
                      width: layout.dogWidth,
                      height: layout.dogHeight,
                      bottom: layout.dogBottom,
                      transform: [{ translateX: dogX }],
                    },
                  ]}
                >
                  <Text style={[styles.tsDogEmoji, { fontSize: Math.round(22 * layout.scaleX) }]}>🐕</Text>
                </Animated.View>
              </View>
            )
          )}
        </View>

        {gameState === "playing" && (
          <Text style={[styles.instructionsText, { color: theme.text.secondary }]}>
            Slide to steer · One touch on a wall ends the run
          </Text>
        )}

        {gameState === "gameover" && (
          <>
            <Text style={[styles.gameOverText, { color: theme.text.primary }]}>
              Hit a wall! You made it to {score}! 🎉{" "}
              {lastCoins > 0 ? `+${lastCoins} coins` : "Squeeze a little further next time!"}
            </Text>
            <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
              <Text style={styles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </>
        )}
      </View>
    </View>
  );
}

// --- Mark Your Territory (full-screen static porch scene; old hold-to-mark mechanic pulled out — renders house art with the neighbor on the porch; gameplay to be rebuilt later) ---

// Hand-illustrated house scene; natural pixel size of the source file, needed to replicate resizeMode="cover"'s scale/crop math in JS.
const TERR_HOUSE_IMAGE = require("../../assets/images/territory-house.png");
// House art's natural pixel size (1086x2262, extended upward from 1086x1316) — anchors below are measured against this image's own pixel space and aren't portable to other art; the taller canvas keeps a near-phone aspect ratio so a height-locked fit shows nearly full width with no letterboxing on common phones.
const TERR_HOUSE_IMG_WIDTH = 1086;
const TERR_HOUSE_IMG_HEIGHT = 2262;
// TERR_HOUSE_ZOOM tradeoff: 1 fills the container height with zero top gap but crops more off the sides on narrow phones; <1 leaves a small top gap but crops less. Currently 1 per the latest request.
const TERR_HOUSE_ZOOM = 1;

// Neighbor-in-rocking-chair stages, each cropped tight to its own silhouette with its own `aspect`; three SRC_* anchors (shared by every stage) keep every stage at the same porch position/size, from newspaper fully up (oblivious) to fully down (attentive). To add a stage: crop tight, add to assets, add one {source, aspect, chairCenterFrac} entry — see chairCenterFrac's own comment below for how to measure that last one.
//
// chairCenterFrac fix (2026-09-11): the 2026-09-07 horizontal-jitter fix re-cropped every stage to a uniform 3px margin on the *character's* full bounding box (newspaper + hands + chair), which assumes that box's own center lines up with the chair's true center — true whenever the margin genuinely lands even on both sides, but stage 3's content happened to already reach x=0 pre-crop, so it only got a 3px margin on the right, none on the left. That shifted stage 3's chair a few px left of where CENTER_X-based centering (which centers the *box*, not the chair) put the others, reported live as "the chair position slightly changes" starting right at the stage-2-to-3 transition. Measured directly: isolated each stage's chair via a wood-color classifier (b<45, r<220, r>40, (r-g)>=15, g>=b on opaque pixels — tuned by sampling this art's own palette, not reused from an older threshold that turned out to also catch skin) and took its bounding box's horizontal center as a fraction of that stage's own canvas width. Stages 1/2/4/5 land within half a percent of each other (~0.505-0.506); stage 3 was a real outlier at 0.490. `chairCenterFrac` records that measured value per stage so the render math (below) can center each stage on its *chair*, not its box — a permanent, generalizable fix rather than a one-off nudge to stage 3 alone, so any future stage art that isn't perfectly margin-symmetric won't reintroduce this.
//
// Vertical size-match fix (2026-09-11, same round): same wood-classifier measurement also showed the chair's own rendered HEIGHT wasn't quite constant either — stage 1 has the most headroom above the chair in its own crop (wood occupies 82.5% of that file's height), stages 2/3/4 progressively less (83.9%/84.4%/84.8%), so at the shared fixed guyHeight the chair reads as growing larger stage-to-stage (confirmed live: "the chair gets slightly bigger every stage until stage 5"). Fixed the same way the very first size-jump fix in this file's history handled it (see the "Stage-1/2 size-jump fixed" section in the project doc): padded stages 2-5's own canvases with transparent rows at the TOP ONLY (content itself untouched, nothing cropped or moved) until each stage's own wood-occupied fraction matches stage 1's (the smallest, so every other stage only ever needs padding added, never real content cropped away) — 9px/12px/14px/6px respectively. `aspect` values below were updated to match each stage's new (padded) pixel dimensions; `chairCenterFrac` is unaffected by top-only padding (verified numerically unchanged) so those values didn't need updating.
const TERR_PORCH_GUY_STAGES = [
  {
    // All 6 poses (5 attentiveness stages + caught) come from one 3x2 reference sheet, split per-cell, seam artifact cleaned up, each trimmed tight with a 3px soft-alpha margin; verified clean via alpha connected-component check. Top-left cell = newspaper fully covering his face. Reference stage for the vertical size-match fix above — smallest wood-height fraction of the 5, so left untouched (no padding needed).
    source: require("../../assets/images/territory-porch-guy.png"),
    aspect: 425 / 497,
    chairCenterFrac: 0.50588,
  },
  {
    // Top-middle cell — newspaper lowered slightly, eyes/eyebrows visible in an annoyed glare; re-trimmed tight and even on both sides. 9px transparent padding added at the top (499 tall now, was 490) to match stage 1's chair scale.
    source: require("../../assets/images/territory-porch-guy-stage-2.png"),
    aspect: 423 / 499,
    chairCenterFrac: 0.50591,
  },
  {
    // Top-right cell — newspaper lowered further, full face visible in an annoyed glare; re-trimmed to fix an uneven right-side margin, but that recrop only had room for a 0px left margin (vs. 3px on the right) since content already reached x=0 — this is the stage whose chair sits measurably off-center; chairCenterFrac corrects it. 12px transparent padding added at the top (499 tall now, was 487) to match stage 1's chair scale.
    source: require("../../assets/images/territory-porch-guy-stage-3.png"),
    aspect: 414 / 499,
    chairCenterFrac: 0.49034,
  },
  {
    // Bottom-left cell — newspaper lowered further still, more shirt/suspenders visible below the face. 14px transparent padding added at the top (501 tall now, was 487) to match stage 1's chair scale — this stage had the largest chair-scale drift of the four, per the live "bigger every stage" report.
    source: require("../../assets/images/territory-porch-guy-stage-4.png"),
    aspect: 425 / 501,
    chairCenterFrac: 0.50471,
  },
  {
    // Bottom-middle cell — most-attentive non-caught pose, full glare, newspaper held lowest. 6px transparent padding added at the top (501 tall now, was 495) to match stage 1's chair scale.
    source: require("../../assets/images/territory-porch-guy-stage-5.png"),
    aspect: 426 / 501,
    chairCenterFrac: 0.50469,
  },
];

// "Caught you peeing" busted pose (bottom-right cell of the sheet) — red-faced, furious, shown when the stage loop reaches the last entry while still holding. Horizontal-jitter fix: re-cropped every stage's bounding box with a uniform 3px margin on all sides, since uneven left/right dead space (not the CENTER_X anchor math) was what caused the visible shift between stages.
// Size-jump fix (2026-09-11): the caught pose's own cropped aspect is 382/501 (0.7625) — genuinely narrower than the 5 attentiveness stages' (~0.830-0.855, after the vertical size-match padding above), since this pose's arms are pulled in tighter around the newspaper rather than spread on the armrests. Rendered at guyWidth = guyHeight * aspect (a fixed guyHeight, per-stage aspect), that made him visibly narrower right at the "caught" moment — confirmed by measuring the actual rendered footprint at a common simulated guyHeight, not just eyeballed. Using the attentiveness stages' own average aspect here instead (so the box width matches them) and letting the existing resizeMode="stretch" mildly widen this one image to fill it — the same accepted-stretch tradeoff already used for the ambient birds' wing-flap frames.
const TERR_PORCH_GUY_CAUGHT = {
  source: require("../../assets/images/territory-porch-guy-caught.png"),
  aspect: TERR_PORCH_GUY_STAGES.reduce((sum, s) => sum + s.aspect, 0) / TERR_PORCH_GUY_STAGES.length,
  // Measured the same way as the attentiveness stages' chairCenterFrac above — this pose came out very close to true-center (0.499) on its own, but wired through the same field for consistency.
  chairCenterFrac: 0.49869,
};
// Neighbor's horizontal position on the porch, nudged repeatedly per user feedback — currently centered on the porch per the explicit "more to the left/center" request, deliberately square in front of the window.
const TERR_PORCH_GUY_SRC_CENTER_X = 670;
// Shifted +946 to match the canvas-extension's added top margin — horizontal anchors are untouched since only rows were added, not columns.
const TERR_PORCH_GUY_SRC_FLOOR_Y = 1746;
// Scaled from the previous house art's value by the same height ratio, so the character keeps the same relative size on the new art.
const TERR_PORCH_GUY_SRC_HEIGHT = 137;
// Manual nudge on top of the measured floor-line anchor, reduced across several rounds of feedback to sit him lower on the porch; source-pixel units so it scales consistently at every screen size.
const TERR_PORCH_GUY_LIFT = -2;

// Mailbox hold-target, measured the same fixed-pixel way as the porch-guy anchors, re-measured and shifted +946 for the new/extended house art.
const TERR_MAILBOX_SRC_CENTER_X = 552;
const TERR_MAILBOX_SRC_TOP_Y = 1753;
const TERR_MAILBOX_SRC_BOTTOM_Y = 1859;

// Where the dog stands (paved road at the bottom of the art, directly under the mailbox), measured the same fixed-pixel way and shifted +946 for the canvas extension.
const TERR_DOG_SRC_Y = 2201;
// Where the dog stands while marking — beside the mailbox post rather than his resting spot on the road; Y offset is an approximation since no exact post-meets-ground pixel was measured. Nudge by eye if he doesn't land right.
const TERR_DOG_AT_MAILBOX_Y = TERR_MAILBOX_SRC_BOTTOM_Y + 130;
const TERR_DOG_AT_MAILBOX_X_OFFSET = 70;
// How long the slide to/from the mailbox takes when isHolding toggles.
const TERR_DOG_APPROACH_MS = 220;
// Emoji fallback's on-screen size, tuned proportionate to the mailbox rather than measured from art.
const TERR_DOG_SRC_HEIGHT = 127;
// Purpose-drawn dog art (standing/walking + leg-lifted marking pose), replacing the earlier player-avatar stand-in; background keyed transparent and trimmed. Source faces left, so TerritoryDog flips it to face right.
const TERR_DOG_IDLE_IMAGE = require("../../assets/images/territory-dog-idle.png");
const TERR_DOG_PEEING_IMAGE = require("../../assets/images/territory-dog-peeing.png");
// Known intrinsic aspect ratios for the two dog poses — web fallback since react-native-web's Image can't read this from the asset itself.
const TERR_DOG_IDLE_ASPECT = 1029 / 821;
const TERR_DOG_PEEING_ASPECT = 1056 / 781;
// Hand-drawn pee-stream/splash sprite sheet (6 frames, cropped to a shared bounding box so they line up); drawn top-to-bottom, so TerritoryPeeStream anchors top to the dog and bottom to the mailbox, then rotates to point between them.
const TERR_PEE_STREAM_FRAMES = [
  require("../../assets/images/territory-pee-stream-1.png"),
  require("../../assets/images/territory-pee-stream-2.png"),
  require("../../assets/images/territory-pee-stream-3.png"),
  require("../../assets/images/territory-pee-stream-4.png"),
  require("../../assets/images/territory-pee-stream-5.png"),
  require("../../assets/images/territory-pee-stream-6.png"),
];
// Measured intrinsic size of the cropped pee-stream frames — same web-fallback reasoning as the dog's aspect constants.
const TERR_PEE_STREAM_FRAME_ASPECT = 249 / 295;
const TERR_PEE_STREAM_FPS = 10;
// Fallback only, for the (currently unreachable) case TerritoryDog is used without the art above.
const TERR_DOG_EMOJI = "🐕";
const TERR_DOG_ENTRANCE_MS = 1200;
const TERR_DOG_HOP_MS = 150;

// Ambient decorative background birds — hand-drawn 6-frame wing-flap cycle, background-removed via flood-fill and verified clean. Each frame keeps its own trim so the wing motion (not a resize glitch) reads through the changing silhouette width.
const TERR_BIRD_FRAMES = [
  require("../../assets/images/territory-bird-1.png"),
  require("../../assets/images/territory-bird-2.png"),
  require("../../assets/images/territory-bird-3.png"),
  require("../../assets/images/territory-bird-4.png"),
  require("../../assets/images/territory-bird-5.png"),
  require("../../assets/images/territory-bird-6.png"),
];
// Web fallback aspects for the bird frames — same reasoning as the dog's TERR_DOG_IDLE_ASPECT. All 6 re-cropped (2026-09-11 head-bob fix) onto one shared beak-anchored 322x301 canvas, so these are now identical rather than 6 different trims.
const TERR_BIRD_FRAME_ASPECTS = [322 / 301, 322 / 301, 322 / 301, 322 / 301, 322 / 301, 322 / 301];
// Fixed on-screen box size for the bird (averaged across all 6 frames' aspects) so the box itself doesn't visibly grow/shrink through the wing-flap; each frame still renders undistorted via resizeMode="contain" inside that fixed box.
const TERR_BIRD_FIXED_ASPECT =
  TERR_BIRD_FRAME_ASPECTS.reduce((sum, a) => sum + a, 0) / TERR_BIRD_FRAME_ASPECTS.length;

// Module-level cache for Image.resolveAssetSource lookups — avoids a native-bridge round trip on every wing-flap/render tick (up to 16x/sec) for as long as this screen stays mounted (switching tabs doesn't unmount it).
const territoryAssetAspectCache = new Map<number, number>();
function resolveTerritoryAssetAspect(source: ImageSourcePropType, fallbackAspect: number): number {
  if (Platform.OS === "web" || typeof Image.resolveAssetSource !== "function") return fallbackAspect;
  if (typeof source !== "number") {
    // Not a local require() (shouldn't happen here) — fall back rather than risk caching something that could change.
    const resolved = Image.resolveAssetSource(source);
    return resolved.width / resolved.height;
  }
  const cached = territoryAssetAspectCache.get(source);
  if (cached !== undefined) return cached;
  const resolved = Image.resolveAssetSource(source);
  const aspect = resolved.width / resolved.height;
  territoryAssetAspectCache.set(source, aspect);
  return aspect;
}

const TERR_BIRD_FPS = 8;
// Bird's fixed on-screen height budget (width follows each frame's own aspect) — chosen as a fraction of container height, not tied to a house-art source-pixel anchor like the porch guy/mailbox/dog.
const TERR_BIRD_SIZE_FRACTION = 0.05;
// Each bird flies one crossing then idles off-screen for a re-rolled random wait before flying again — "fly by at random" rather than a fixed metronome, centered around ~10s average.
const TERR_BIRD_CYCLE_MIN_MS = 6000;
const TERR_BIRD_CYCLE_MAX_MS = 16000;
const TERR_BIRD_FLIGHT_MS = 4200;

// Neighbor's attentiveness stage clock: a guaranteed fixed-interval switch every TERR_STAGE_INTERVAL_MS, but every TERR_STAGE_TICK_MS a separate roll has a TERR_STAGE_EARLY_SWITCH_CHANCE probability of switching early — replaces the old min/max random-delay timer with "every 4s, but 25% chance each second to jump early" per feedback. This governs every stage EXCEPT the last one, which uses its own randomized dwell below.
const TERR_STAGE_INTERVAL_MS = 4000;
const TERR_STAGE_TICK_MS = 1000;
const TERR_STAGE_EARLY_SWITCH_CHANCE = 0.25;
// How long the neighbor lingers on his last (most-attentive) stage before looking away again — a uniformly random duration per dwell, rolled fresh each time he reaches it, rather than the fixed-interval-plus-dice-roll timing every earlier stage uses.
const TERR_STAGE_LAST_STAGE_MIN_MS = 4000;
const TERR_STAGE_LAST_STAGE_MAX_MS = 8000;

// Total holding time needed to fill the marking meter; progress persists across releases (never reset by releasing). Slowed down twice per feedback (was 7500ms, then 12000ms).
const TERR_MARK_FILL_MS = 15000;
const TERR_MARK_TICK_MS = 100;

// One-time bonus for fully completing the round — the only coin reward this game gives now (releasing safely before that used to award TERR_MARK_REWARD each time, removed per feedback so coins only come from actually completing the round), same idea as Minesweeper's WIN_REWARD.
const TERR_COMPLETE_REWARD = 20;

// Dedicated "hold to mark" button, independent of the mailbox's own position so a thumb doesn't block the view while holding; swapped from a code-drawn circle to a small pixel-art wood-sign asset, with hitSlop padding the tap target past Apple's 44pt minimum.
const TERR_MARK_BUTTON_IMAGE = require("../../assets/images/territory-mark-button.png");
const TERR_MARK_BUTTON_WIDTH = 78;
const TERR_MARK_BUTTON_ASPECT = 450 / 138;
const TERR_MARK_BUTTON_HEIGHT = TERR_MARK_BUTTON_WIDTH / TERR_MARK_BUTTON_ASPECT;

// The old pulsing-glow halo components (TerritoryPulseHalo/TerritoryMailboxHint) were removed per the user's "take the flashing away" ask — the art reads clearly enough without an animated hint.

// Pee-stream effect: cycles the 6-frame sprite stretched/rotated into a strip running from the dog's position to the mailbox, so it reads as coming out of him regardless of their relative positions; frame-cycling reuses WalkingSprite's rAF approach, reimplemented inline since its bob/sway doesn't belong on a liquid effect.
function TerritoryPeeStream({
  originX,
  originY,
  targetX,
  targetY,
}: {
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
}) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const frameDuration = 1000 / TERR_PEE_STREAM_FPS;
    let rafId: number;
    let lastTime: number | null = null;
    let stopped = false;

    const tick = (time: number) => {
      if (stopped) return;
      if (lastTime === null) lastTime = time;
      const elapsed = time - lastTime;
      if (elapsed >= frameDuration) {
        const steps = Math.floor(elapsed / frameDuration);
        lastTime += steps * frameDuration;
        setFrameIndex((prev) => (prev + steps) % TERR_PEE_STREAM_FRAMES.length);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  // Rotation that points the strip's built-in "down" axis at (dx, dy) instead of straight down: theta = atan2(-dx, dy).
  const angleDeg = (Math.atan2(-dx, dy) * 180) / Math.PI;
  const height = distance;
  const width = distance * TERR_PEE_STREAM_FRAME_ASPECT;
  const centerX = (originX + targetX) / 2;
  const centerY = (originY + targetY) / 2;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: centerX - width / 2,
        top: centerY - height / 2,
        width,
        height,
        transform: [{ rotate: `${angleDeg}deg` }],
      }}
    >
      <Image
        source={TERR_PEE_STREAM_FRAMES[frameIndex]}
        // Mirrored left-right in its own local space, independent of the outer rotate, so the flip doesn't change where the stream points.
        style={{ width: "100%", height: "100%", transform: [{ scaleX: -1 }] }}
        resizeMode="stretch"
      />
    </View>
  );
}

// One ambient background bird: cycles its wing-flap sprite on an rAF loop while crossing the sky at constant speed, then idles off-screen for a random wait before flying again; purely decorative, mounted unconditionally.
function TerritoryBird({
  containerWidth,
  y,
  size,
  direction,
  flightMs,
  minCycleMs,
  maxCycleMs,
  startDelayMs = 0,
}: {
  containerWidth: number;
  y: number;
  size: number;
  direction: "left-to-right" | "right-to-left";
  flightMs: number;
  minCycleMs: number;
  maxCycleMs: number;
  startDelayMs?: number;
}) {
  const [frameIndex, setFrameIndex] = useState(0);
  // 0->1: one single crossing, reset and re-animated per cycle via the scheduling effect below rather than Animated.loop (which can't insert an idle pause between iterations).
  const progress = useRef(new Animated.Value(0)).current;

  // size/containerWidth are frozen for the duration of one flight (re-captured only when the next flight starts, in flyOnce below) rather than read live off props every render. The parent recomputes these from `layout` on every one of its own re-renders, and even a same-flight parent re-render (e.g. the marking meter's 100ms tick) would otherwise change this bird's box size mid-air the instant it happened, on top of the layout-jitter case fixed in the parent's onLayout guard. latestPropsRef always tracks the current props (so a real resize is still picked up) — flightGeomRef only copies from it at the start of each flight.
  const latestPropsRef = useRef({ size, containerWidth });
  latestPropsRef.current = { size, containerWidth };
  const flightGeomRef = useRef({ size, containerWidth });

  // Wing-flap frame cycling is started/stopped bracketing each flight rather than running for the component's whole mounted lifetime, since the idle pause (60-75% of the cycle) was ticking invisible frames the whole time this screen stayed mounted.
  const wingRafRef = useRef<number | null>(null);
  const startWingFlap = () => {
    if (wingRafRef.current !== null) return;
    const frameDuration = 1000 / TERR_BIRD_FPS;
    let lastTime: number | null = null;
    const tick = (time: number) => {
      if (lastTime === null) lastTime = time;
      const elapsed = time - lastTime;
      if (elapsed >= frameDuration) {
        const steps = Math.floor(elapsed / frameDuration);
        lastTime += steps * frameDuration;
        setFrameIndex((prev) => (prev + steps) % TERR_BIRD_FRAMES.length);
      }
      wingRafRef.current = requestAnimationFrame(tick);
    };
    wingRafRef.current = requestAnimationFrame(tick);
  };
  const stopWingFlap = () => {
    if (wingRafRef.current !== null) {
      cancelAnimationFrame(wingRafRef.current);
      wingRafRef.current = null;
    }
  };
  // Safety net only — the flight effect below normally starts/stops this; this just guarantees no rAF survives past unmount.
  useEffect(() => stopWingFlap, []);

  // Flies once, then once actually landed off-screen rolls a fresh random wait and schedules the next flight via a recursive setTimeout chain (same pattern the neighbor's stage loop uses), since Animated.loop can't pause between iterations.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const randomPauseMs = () =>
      Math.max(0, minCycleMs + Math.random() * (maxCycleMs - minCycleMs) - flightMs);

    const flyOnce = () => {
      if (cancelled) return;
      flightGeomRef.current = latestPropsRef.current;
      progress.setValue(0);
      startWingFlap();
      Animated.timing(progress, {
        toValue: 1,
        duration: flightMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        stopWingFlap();
        if (cancelled || !finished) return;
        timeoutId = setTimeout(flyOnce, randomPauseMs());
      });
    };

    timeoutId = setTimeout(flyOnce, startDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      progress.stopAnimation();
      stopWingFlap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightMs, minCycleMs, maxCycleMs, startDelayMs]);

  const frameSource = TERR_BIRD_FRAMES[frameIndex];
  // Uses resizeMode="stretch" (not "contain") so the fixed-aspect box fills completely every frame with no letterboxing/pulsing — a prior attempt with "contain" still let both axes drift since a mismatched aspect still gets letterboxed down; frames stretch slightly off their own true aspect, an accepted tradeoff at this render size. No per-frame resolveAssetSource call needed anymore either.
  const aspect = TERR_BIRD_FIXED_ASPECT;
  // frozenSize/frozenContainerWidth (not the live size/containerWidth props) drive every dimension below, so a bird's box genuinely cannot change mid-flight for any reason — see flightGeomRef's comment above.
  const { size: frozenSize, containerWidth: frozenContainerWidth } = flightGeomRef.current;
  const width = frozenSize * aspect;

  // Off-screen at both ends regardless of container width — same -(x + size) derivation TerritoryDog's entranceStartX uses.
  const startX = direction === "left-to-right" ? -width : frozenContainerWidth + width;
  const endX = direction === "left-to-right" ? frozenContainerWidth + width : -width;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: y,
        left: 0,
        width,
        height: frozenSize,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] }) },
          // Drawn facing right in its source form — flip only when flying right-to-left so he always faces the direction he's headed.
          { scaleX: direction === "right-to-left" ? -1 : 1 },
        ],
      }}
    >
      <Image source={frameSource} style={{ width, height: frozenSize }} resizeMode="stretch" />
    </Animated.View>
  );
}

// The dog: hops in from off-screen on mount, settles at his resting spot under the mailbox, steps up beside it (swapping to the leg-lifted marking pose) while held, and steps back on release.
function TerritoryDog({
  restX,
  restY,
  atMailboxX,
  atMailboxY,
  size,
  isHolding,
  idleImage,
  peeingImage,
  idleAspect = 1,
  peeingAspect = 1,
}: {
  restX: number;
  restY: number;
  atMailboxX: number;
  atMailboxY: number;
  size: number;
  isHolding: boolean;
  idleImage?: ImageSourcePropType;
  peeingImage?: ImageSourcePropType;
  idleAspect?: number;
  peeingAspect?: number;
}) {
  // 0->1 once on mount: the entrance slide from off-screen to the resting spot, never replayed after that.
  const entrance = useRef(new Animated.Value(0)).current;
  // Small up/down bob, looped only during the entrance slide, so the approach reads as a hop/trot rather than a flat slide.
  const hop = useRef(new Animated.Value(0)).current;
  // 0->1 while isHolding (and back on release): slides him from resting spot to beside the mailbox, additively on top of the entrance/hop; can fire many times per round.
  const atMailbox = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const hopLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: TERR_DOG_HOP_MS, useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: TERR_DOG_HOP_MS, useNativeDriver: true }),
      ])
    );
    hopLoop.start();
    Animated.timing(entrance, {
      toValue: 1,
      duration: TERR_DOG_ENTRANCE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      hopLoop.stop();
      hop.setValue(0);
    });
    return () => {
      hopLoop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(atMailbox, {
      toValue: isHolding ? 1 : 0,
      duration: TERR_DOG_APPROACH_MS,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHolding]);

  // Entrance start-x derived from his own rest position and size (not container width) so he's guaranteed fully off-screen regardless of how wide the container is.
  const entranceStartX = -(restX + size);

  // Current pose, recomputed every render to track isHolding live; aspect read via the cached resolveTerritoryAssetAspect on native (avoiding a bridge call on every 100ms markProgress tick), or a known fallback aspect on web where resolveAssetSource doesn't exist.
  const poseImage = isHolding && peeingImage ? peeingImage : idleImage;
  const fallbackAspect = isHolding && peeingImage ? peeingAspect : idleAspect;
  const aspect = poseImage ? resolveTerritoryAssetAspect(poseImage, fallbackAspect) : 1;
  const width = size * aspect;

  const content = poseImage ? (
    <Image source={poseImage} style={{ width, height: size }} resizeMode="contain" />
  ) : (
    // Fallback — only reachable if TerritoryDog is ever used without the dedicated pose art above.
    <Text style={{ fontSize: size, lineHeight: size }}>{TERR_DOG_EMOJI}</Text>
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: restX - width / 2,
        top: restY - size,
        width,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        transform: [
          // World-space moves listed before the local flip below so neither is affected by it — he always enters from the left and slides the same screen-space amount regardless of which way he's facing.
          { translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [entranceStartX, 0] }) },
          { translateX: atMailbox.interpolate({ inputRange: [0, 1], outputRange: [0, atMailboxX - restX] }) },
          { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          { translateY: atMailbox.interpolate({ inputRange: [0, 1], outputRange: [0, atMailboxY - restY] }) },
          // Both the pose art and the emoji fallback face left in source form, so always flip to face right toward the mailbox.
          { scaleX: -1 },
        ],
      }}
    >
      {content}
    </Animated.View>
  );
}

// Fixed size of the marking meter's track — kept as constants (not props) since the hand-drawn wobble path and scribble strokes below are hand-tuned to this exact viewBox rather than computed generically for an arbitrary size.
const TERR_METER_TRACK_WIDTH = 110;
const TERR_METER_TRACK_HEIGHT = 11;
// Hand-jittered rounded-rect outline (replaces the old clean borderRadius+borderWidth track) so the meter's frame itself reads as drawn-by-hand, matching the rest of this scene's cartoon linework rather than a crisp UI element. Thinner than the original pass (1.0 vs 1.4) to match the cleaner pencil-sketch reference this bar's style is based on.
const TERR_METER_WOBBLE_OUTLINE_D =
  "M5.2,1.4 L29,0.7 L59,1.4 L85,0.7 L104.8,1.6 Q108.6,1.7 108.6,4.6 L108.2,6.8 Q108.7,9.5 105,9.7 L75,10.3 L45,9.6 L20,10.2 L5.4,9.5 Q1.3,9.7 1.3,6.4 L1.7,4 Q1.4,1.2 5.2,1.4 Z";
// Second, very slightly offset outline traced faintly underneath the main one — mimics the subtle hand-retrace "sketchy double line" visible along the top edge of the reference loading-bar art, without redrawing the whole shape as a second independent hand-wobble (that read as two competing outlines rather than one retraced one).
const TERR_METER_WOBBLE_OUTLINE_D_2 =
  "M5.5,1.1 L30,1.0 L60,1.1 L86,1.0 L105.1,1.3 Q108.3,1.4 108.3,4.3 L108.0,7.0 Q108.4,9.2 104.7,9.4 L74.7,10.0 L44.7,9.3 L19.7,9.9 L5.7,9.2 Q1.6,9.4 1.6,6.7 L2.0,3.8 Q1.7,1.5 5.5,1.1 Z";
// Dense zigzag "marker scribble" fill — matches the second reference image exactly: one continuous zigzag stroke whose teeth touch the top and bottom of the track, in a single solid vivid yellow (not the alternating two-tone discrete hatch lines this replaces), with thin wood-colored slivers showing through between teeth. Revealed left-to-right by progress via a clip rect, same as every earlier fill version (a fixed pattern uncovered, not a live-drawing animation). Generated with a seeded RNG (see mark-your-territory-minigame.md) for jitter that's reproducible but not visibly repetitive; spans slightly past the 0-110 track range so the pattern still fills edge to edge after clipping.
const TERR_METER_ZIGZAG_D =
  "M-8.02,9.44 L-6.3,1.6 L-4.85,9.41 L-2.95,1.36 L-1.83,9.59 L-0.22,1.89 L1.82,9.47 L2.91,1.62 L4.37,9.25 L5.87,1.56 L7.59,9.48 L9.21,1.57 L10.84,9.7 L12.38,1.49 L13.61,9.14 L15.32,1.81 L17.11,9.61 L18.08,1.85 L20.01,9.34 L21.21,1.77 L22.4,9.3 L24.47,1.37 L25.59,9.14 L27.29,1.64 L28.83,9.54 L30.46,1.37 L31.76,9.26 L33.8,1.48 L35.2,9.34 L37.11,1.36 L38.64,9.25 L40.36,1.48 L41.62,9.45 L43.32,1.52 L45.03,9.39 L46.57,1.41 L48.0,9.59 L49.09,1.74 L50.82,9.67 L52.72,1.55 L53.83,9.68 L55.61,1.45 L57.24,9.28 L58.72,1.34 L60.08,9.61 L61.54,1.85 L62.84,9.26 L64.39,1.41 L66.14,9.18 L67.79,1.89 L69.31,9.45 L70.38,1.31 L72.43,9.68 L73.76,1.59 L75.24,9.7 L76.74,1.74 L78.54,9.52 L80.3,1.51 L81.91,9.62 L83.38,1.82 L84.87,9.33 L86.45,1.35 L88.24,9.63 L89.58,1.74 L91.19,9.6 L92.73,1.32 L94.19,9.24 L95.82,1.67 L97.42,9.11 L99.1,1.42 L100.63,9.5 L102.15,1.5 L103.42,9.36 L105.45,1.83 L106.79,9.29 L108.15,1.8 L109.95,9.67 L111.14,1.57 L112.62,9.35 L114.36,1.49 L116.29,9.37 L117.2,1.82";
// Single vivid yellow sampled directly from the reference art's fill. Used to swap to a hot-orange "urgent" color once the meter was nearly full — that swap was removed per feedback, so this is now the fill's only color at every progress level.
const TERR_METER_ZIGZAG_COLOR = "#FFD200";

// Replaces the earlier discrete diagonal hatch-line fill with a single continuous zigzag stroke, styled after the reference's hand-scribbled marker fill, revealed left-to-right by progress via an SVG clip rather than an Animated width — same "no smooth animation" behavior every earlier fill version had. No percentage text anywhere here by design; the filled-in zigzag itself is the only progress readout.
function TerritoryMeterScribbleTrack({ progress }: { progress: number }) {
  const clipId = useId();
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return (
    <Svg width={TERR_METER_TRACK_WIDTH} height={TERR_METER_TRACK_HEIGHT} viewBox={`0 0 ${TERR_METER_TRACK_WIDTH} ${TERR_METER_TRACK_HEIGHT}`}>
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={0} y={0} width={TERR_METER_TRACK_WIDTH * clampedProgress} height={TERR_METER_TRACK_HEIGHT} />
        </ClipPath>
      </Defs>
      {/* No recessed-groove background fill (dropped, was rgba(43,31,25,...) in earlier versions) — the reference's unfilled track is exactly the card's own wood color with no tint, so the unfilled portion here is just the card showing through. */}
      <G clipPath={`url(#${clipId})`}>
        <Path
          d={TERR_METER_ZIGZAG_D}
          fill="none"
          stroke={TERR_METER_ZIGZAG_COLOR}
          strokeWidth={2.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
      </G>
      {/* Faint retraced outline first, then the main wobbly ink outline on top — both drawn after the fill so the hand-drawn border always reads crisply over the zigzag rather than being partly covered by it. */}
      <Path d={TERR_METER_WOBBLE_OUTLINE_D_2} fill="none" stroke="#2B1F19" strokeWidth={0.7} strokeLinejoin="round" opacity={0.4} />
      <Path d={TERR_METER_WOBBLE_OUTLINE_D} fill="none" stroke="#2B1F19" strokeWidth={1.1} strokeLinejoin="round" opacity={0.9} />
    </Svg>
  );
}

function MarkYourTerritoryGame({ onExit }: { onExit: () => void }) {
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { earnCoins } = usePets();

  // Neighbor's attentiveness stage (0 = most oblivious, rising toward most attentive); advances on its own random-interval timer independent of holding — holding only matters for what happens when he reaches the last stage.
  const [neighborStage, setNeighborStage] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isCaught, setIsCaught] = useState(false);
  // 0..1 fill level of the marking meter — accrues while held, persists across releases, resets only on Try Again / Play Again.
  const [markProgress, setMarkProgress] = useState(0);
  // Round-complete (won by filling the meter) — distinct from isCaught (lost). Both stop the neighbor's stage clock.
  const [isComplete, setIsComplete] = useState(false);
  // Whether the dog has actually finished sliding to the mailbox — separate from isHolding (which flips instantly) so the pee-stream splash doesn't appear before he's actually arrived; delayed on the way up, instant on the way down.
  const [isDogAtMailbox, setIsDogAtMailbox] = useState(false);

  // Refs mirror the state above for the setTimeout-driven loop, which reschedules itself outside React's render cycle and can't rely on a stale render closure.
  const isHoldingRef = useRef(isHolding);
  isHoldingRef.current = isHolding;
  const isCaughtRef = useRef(isCaught);
  isCaughtRef.current = isCaught;
  const neighborStageRef = useRef(neighborStage);
  neighborStageRef.current = neighborStage;
  const markProgressRef = useRef(markProgress);
  markProgressRef.current = markProgress;
  const isCompleteRef = useRef(isComplete);
  isCompleteRef.current = isComplete;

  // setInterval handle for the 1-second stage-clock tick (replaces the old setTimeout chain, since the fixed-plus-dice-roll design needs a steady per-second beat rather than a single reschedulable delay).
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ms accumulated since the neighbor's last stage switch — reset to 0 on every switch (early or on-the-dot), compared against TERR_STAGE_INTERVAL_MS (or, while on the last stage, lastStageDurationRef below) each tick to force the guaranteed switch.
  const stageElapsedRef = useRef(0);
  // This dwell's randomly rolled duration for the last stage, in ms — re-rolled every time the neighbor transitions into that stage; unused while on any other stage.
  const lastStageDurationRef = useRef(0);
  // Ticks up markProgress while the mailbox is held — started on press-in, cleared on press-out/bust/completion.
  const markIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Holds the "one second of the stage clock has passed" function in a ref since it's called both by the mount effect and externally (restartStageLoop).
  const stageLoopRef = useRef<() => void>(() => {});

  const restartStageLoop = useCallback(() => {
    if (stageIntervalRef.current) clearInterval(stageIntervalRef.current);
    neighborStageRef.current = 0;
    setNeighborStage(0);
    stageElapsedRef.current = 0;
    stageIntervalRef.current = setInterval(() => stageLoopRef.current(), TERR_STAGE_TICK_MS);
  }, []);

  useEffect(() => {
    stageLoopRef.current = () => {
      if (isCaughtRef.current || isCompleteRef.current) {
        if (stageIntervalRef.current) {
          clearInterval(stageIntervalRef.current);
          stageIntervalRef.current = null;
        }
        return;
      }
      stageElapsedRef.current += TERR_STAGE_TICK_MS;
      const onLastStage = neighborStageRef.current === TERR_PORCH_GUY_STAGES.length - 1;
      if (onLastStage) {
        // Last stage: just wait out this dwell's randomly rolled duration — no early-switch dice roll here, so how long he stays maxed-out is the only randomness in play.
        if (stageElapsedRef.current < lastStageDurationRef.current) return;
      } else {
        // Every other stage: every tick (once a second) rolls a chance to switch early; otherwise the elapsed clock keeps building toward the guaranteed TERR_STAGE_INTERVAL_MS switch.
        const rolledEarly = Math.random() < TERR_STAGE_EARLY_SWITCH_CHANCE;
        if (!rolledEarly && stageElapsedRef.current < TERR_STAGE_INTERVAL_MS) return;
      }
      stageElapsedRef.current = 0;
      const next = (neighborStageRef.current + 1) % TERR_PORCH_GUY_STAGES.length;
      neighborStageRef.current = next;
      setNeighborStage(next);
      if (next === TERR_PORCH_GUY_STAGES.length - 1) {
        // Just entered the last stage — roll how long this particular dwell lasts.
        lastStageDurationRef.current =
          TERR_STAGE_LAST_STAGE_MIN_MS + Math.random() * (TERR_STAGE_LAST_STAGE_MAX_MS - TERR_STAGE_LAST_STAGE_MIN_MS);
      }
      if (next === TERR_PORCH_GUY_STAGES.length - 1 && isHoldingRef.current) {
        // Busted: hit the most-attentive stage while still holding — stop the loop and the meter both, since bust overrides an in-progress mark.
        isCaughtRef.current = true;
        setIsCaught(true);
        isHoldingRef.current = false;
        setIsHolding(false);
        if (markIntervalRef.current) {
          clearInterval(markIntervalRef.current);
          markIntervalRef.current = null;
        }
        if (stageIntervalRef.current) {
          clearInterval(stageIntervalRef.current);
          stageIntervalRef.current = null;
        }
      }
    };
    stageIntervalRef.current = setInterval(() => stageLoopRef.current(), TERR_STAGE_TICK_MS);
    return () => {
      if (stageIntervalRef.current) clearInterval(stageIntervalRef.current);
      if (markIntervalRef.current) clearInterval(markIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drives isDogAtMailbox off isHolding: delayed on the rising edge (to match the slide animation), immediate on the falling edge; covers every path that ends a hold (release, bust, completion) in one effect.
  useEffect(() => {
    if (!isHolding) {
      setIsDogAtMailbox(false);
      return;
    }
    const t = setTimeout(() => setIsDogAtMailbox(true), TERR_DOG_APPROACH_MS);
    return () => clearTimeout(t);
  }, [isHolding]);

  const handleMailboxPressIn = () => {
    if (isCaughtRef.current || isCompleteRef.current) return;
    // Instant bust if the neighbor is already on his last stage the moment the player grabs the mailbox — the stage-loop timer alone only busts on the transition into that stage, so a hold starting while already there needed this separate check.
    if (neighborStageRef.current === TERR_PORCH_GUY_STAGES.length - 1) {
      if (stageIntervalRef.current) {
        clearInterval(stageIntervalRef.current);
        stageIntervalRef.current = null;
      }
      isCaughtRef.current = true;
      setIsCaught(true);
      return;
    }
    isHoldingRef.current = true;
    setIsHolding(true);
    // Start ticking the marking meter — progress carries over from earlier holds this round, so this just resumes.
    if (markIntervalRef.current) clearInterval(markIntervalRef.current);
    markIntervalRef.current = setInterval(() => {
      const next = Math.min(1, markProgressRef.current + TERR_MARK_TICK_MS / TERR_MARK_FILL_MS);
      markProgressRef.current = next;
      setMarkProgress(next);
      if (next >= 1) {
        // Meter filled while still safely holding — round won; stops everything the same way a bust does, via the success path.
        if (markIntervalRef.current) {
          clearInterval(markIntervalRef.current);
          markIntervalRef.current = null;
        }
        if (stageIntervalRef.current) {
          clearInterval(stageIntervalRef.current);
          stageIntervalRef.current = null;
        }
        isHoldingRef.current = false;
        setIsHolding(false);
        isCompleteRef.current = true;
        setIsComplete(true);
        earnCoins(TERR_COMPLETE_REWARD);
      }
    }, TERR_MARK_TICK_MS);
  };

  const handleMailboxPressOut = () => {
    const wasHolding = isHoldingRef.current;
    isHoldingRef.current = false;
    setIsHolding(false);
    if (markIntervalRef.current) {
      clearInterval(markIntervalRef.current);
      markIntervalRef.current = null;
    }
    if (isCaughtRef.current || isCompleteRef.current || !wasHolding) return;
    // Released safely before getting caught — no coins for this anymore (coins are only earned via TERR_COMPLETE_REWARD, on fully filling the meter). The neighbor's stage and the meter's accumulated progress are both left untouched, only their ticking stops.
  };

  const handleTryAgain = () => {
    isCaughtRef.current = false;
    setIsCaught(false);
    markProgressRef.current = 0;
    setMarkProgress(0);
    restartStageLoop();
  };

  const handlePlayAgain = () => {
    isCompleteRef.current = false;
    setIsComplete(false);
    markProgressRef.current = 0;
    setMarkProgress(0);
    restartStageLoop();
  };

  const currentNeighborStage = isCaught
    ? TERR_PORCH_GUY_CAUGHT
    : TERR_PORCH_GUY_STAGES[Math.min(neighborStage, TERR_PORCH_GUY_STAGES.length - 1)];

  // Measures the container's own rendered box via onLayout rather than trusting useWindowDimensions(), which reports the full browser viewport on Expo web even when the app is laid out in a narrower centered column.
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

  // Scale is locked to container height (never width) — now that the source art's own aspect ratio is close to a phone's, a plain height-locked fit already lands near full-width on real devices; TERR_HOUSE_ZOOM stays as a small 2% safety margin.
  const scale = layout ? (layout.height / TERR_HOUSE_IMG_HEIGHT) * TERR_HOUSE_ZOOM : 0;
  const scaledHouseWidth = TERR_HOUSE_IMG_WIDTH * scale;
  const scaledHouseHeight = TERR_HOUSE_IMG_HEIGHT * scale;
  // Positive = letterboxed (image narrower than box); negative = cropped (image wider, clipped by overflow:"hidden") — the normal case on a narrow phone.
  const houseOffsetX = layout ? (layout.width - scaledHouseWidth) / 2 : 0;
  // Pinned to the bottom, not centered — all leftover height goes above the roofline as top-only letterboxing, so there's never a gap below the road.
  const houseOffsetY = layout ? layout.height - scaledHouseHeight : 0;

  // A fixed few-pixel overscan on the rendered Image's own top/height absorbs sub-pixel layout rounding that otherwise left a faint sliver at the top; resizeMode="cover" crops the extra invisibly. Doesn't touch houseOffsetY itself, which every other anchor still keys off.
  const houseTopOverscan = 3;

  const guyHeight = TERR_PORCH_GUY_SRC_HEIGHT * scale;
  const guyWidth = guyHeight * currentNeighborStage.aspect;
  // Centers each stage on its own chairCenterFrac (the chair's measured horizontal center within that stage's own art) rather than assuming the box's own midpoint always lines up with the chair — see chairCenterFrac's comment on TERR_PORCH_GUY_STAGES for why that assumption broke for stage 3.
  const guyLeft = TERR_PORCH_GUY_SRC_CENTER_X * scale + houseOffsetX - currentNeighborStage.chairCenterFrac * guyWidth;
  const guyBottom = (TERR_PORCH_GUY_SRC_FLOOR_Y - TERR_PORCH_GUY_LIFT) * scale + houseOffsetY;
  const guyTop = guyBottom - guyHeight;

  // Mailbox on-screen position, from the fixed source-pixel anchors — same scale/offset math as the porch guy.
  const mailboxCenterX = TERR_MAILBOX_SRC_CENTER_X * scale + houseOffsetX;
  const mailboxTopY = TERR_MAILBOX_SRC_TOP_Y * scale + houseOffsetY;
  const mailboxBottomY = TERR_MAILBOX_SRC_BOTTOM_Y * scale + houseOffsetY;

  // Dog's resting position — same x column as the mailbox, standing on the road below it; size clamped so he doesn't shrink to nothing on a short/letterboxed layout.
  const dogRestY = TERR_DOG_SRC_Y * scale + houseOffsetY;
  const dogSize = Math.max(46, TERR_DOG_SRC_HEIGHT * scale);
  // Where he slides to while marking — beside the mailbox post.
  const dogAtMailboxX = mailboxCenterX + TERR_DOG_AT_MAILBOX_X_OFFSET * scale;
  const dogAtMailboxY = TERR_DOG_AT_MAILBOX_Y * scale + houseOffsetY;
  // Width of the peeing-pose art, used to offset the pee stream's origin toward the dog's rear (his left side, since he's flipped to face right) rather than his center.
  const dogPeeingWidth = dogSize * TERR_DOG_PEEING_ASPECT;

  return (
    <View
      style={styles.territoryFullScreen}
      onLayout={(e) => {
        // Round + bail on a no-op measurement: onLayout can re-fire with sub-pixel-different values (mobile browser chrome show/hide, sibling reflow from the marking meter's own live width, etc.) with no real resize behind it. Since every anchor (house, mailbox, dog, birds) derives straight from `layout` with no interpolation, an unguarded setLayout here made those pop to a new size instantly on every such re-fire — most visible on the birds since they're already moving. Skipping same-value updates keeps `layout` (and everything sized off it) stable except on an actual resize.
        const width = Math.round(e.nativeEvent.layout.width);
        const height = Math.round(e.nativeEvent.layout.height);
        setLayout((prev) =>
          prev && prev.width === width && prev.height === height ? prev : { width, height }
        );
      }}
    >
      {layout && (
        <>
          {/* Sized to the exact scaled dimensions computed above rather than filling the container, since React Native Web's Image falls back to the source asset's natural size without explicit width/height. */}
          <Image
            source={TERR_HOUSE_IMAGE}
            style={{
              position: "absolute",
              // top/height overshoot the container's real top edge by houseTopOverscan to absorb sub-pixel rounding; houseOffsetY/scaledHouseHeight themselves are untouched.
              top: houseOffsetY - houseTopOverscan,
              left: houseOffsetX,
              width: scaledHouseWidth,
              height: scaledHouseHeight + houseTopOverscan,
            }}
            resizeMode="cover"
          />

          {/* Ambient decorative sky birds, placed as a fraction of the container (not a house-art anchor) safely above the roofline; one flies each direction, each on its own randomized interval/length so they don't read as a synced pair. */}
          <TerritoryBird
            containerWidth={layout.width}
            y={layout.height * 0.2}
            size={layout.height * TERR_BIRD_SIZE_FRACTION}
            direction="left-to-right"
            flightMs={TERR_BIRD_FLIGHT_MS}
            minCycleMs={TERR_BIRD_CYCLE_MIN_MS}
            maxCycleMs={TERR_BIRD_CYCLE_MAX_MS}
            startDelayMs={0}
          />
          <TerritoryBird
            containerWidth={layout.width}
            y={layout.height * 0.28}
            size={layout.height * TERR_BIRD_SIZE_FRACTION * 0.85}
            direction="right-to-left"
            flightMs={TERR_BIRD_FLIGHT_MS * 1.15}
            minCycleMs={TERR_BIRD_CYCLE_MIN_MS * 1.1}
            maxCycleMs={TERR_BIRD_CYCLE_MAX_MS * 1.1}
            startDelayMs={3200}
          />

          <Image
            source={currentNeighborStage.source}
            style={{ position: "absolute", left: guyLeft, top: guyTop, width: guyWidth, height: guyHeight }}
            resizeMode="stretch"
          />

          <TerritoryDog
            restX={mailboxCenterX}
            restY={dogRestY}
            atMailboxX={dogAtMailboxX}
            atMailboxY={dogAtMailboxY}
            size={dogSize}
            isHolding={isHolding && !isCaught}
            idleImage={TERR_DOG_IDLE_IMAGE}
            peeingImage={TERR_DOG_PEEING_IMAGE}
            idleAspect={TERR_DOG_IDLE_ASPECT}
            peeingAspect={TERR_DOG_PEEING_ASPECT}
          />

          {isDogAtMailbox && !isCaught && !isComplete && (
            // Gated on isDogAtMailbox (not isHolding directly) so the stream doesn't mount until the dog has actually arrived. Origin is shifted toward his rear and raised to back/hip height for real fall length; target is the dog's own ground anchor (not the mailbox box) so the stream reads top-to-bottom instead of running uphill.
            <TerritoryPeeStream
              originX={dogAtMailboxX - dogPeeingWidth * 0.4}
              originY={dogAtMailboxY - dogSize * 0.4}
              targetX={mailboxCenterX + dogSize * 0.12}
              targetY={dogAtMailboxY + dogSize * 0.15}
            />
          )}
        </>
      )}

      <PressableScale
        style={[
          styles.territoryExitButton,
          {
            top: insets.top + 12,
            left: insets.left + 16,
            backgroundColor: theme.card.background,
            borderColor: theme.card.border,
          },
        ]}
        onPress={onExit}
      >
        <Text style={[styles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      {/* Marking progress meter — fills while held, never drains on release (only on Try Again), hidden once the round has ended. No numeric readout by design: the hand-scribbled fill (TerritoryMeterScribbleTrack) is the only progress indicator, styled to match this scene's hand-drawn linework rather than reading as a clean UI element. No "almost there" cue anymore either — the pulsing glow ring was removed earlier, and the fill's color-to-orange swap near completion was removed per feedback too; the fill is now one color at every progress level. */}
      {!isCaught && !isComplete && (
        <View
          pointerEvents="none"
          style={[
            styles.territoryMeterWrap,
            // Uses houseOffsetX (not just insets.left) so this lands on the house/road art rather than the letterbox background beside it on a wide/landscape viewport; max() keeps it from landing off the left edge on a real phone.
            { left: Math.max(houseOffsetX + 16, insets.left + 16), bottom: insets.bottom + 28 },
          ]}
        >
          <View style={styles.territoryMeterCard}>
            <Text style={styles.territoryMeterLabel}>Marking</Text>
            <View style={styles.territoryMeterTrackOuter}>
              <TerritoryMeterScribbleTrack progress={markProgress} />
            </View>
          </View>
        </View>
      )}

      {/* Dedicated "hold to mark" button, mirroring the meter's anchoring on the opposite side so a thumb no longer blocks the mailbox while holding; swapped from a code-drawn circle to a small pixel-art wood-sign image, wired to the same handleMailboxPressIn/Out handlers, with hitSlop padding the touch target and an opacity dip standing in for an active-state recolor. */}
      {!isCaught && !isComplete && (
        <View
          pointerEvents="box-none"
          style={[
            styles.territoryMarkButtonWrap,
            {
              width: TERR_MARK_BUTTON_WIDTH,
              right: Math.max(houseOffsetX + 16, insets.right + 16),
              bottom: insets.bottom + 28,
            },
          ]}
        >
          <PressableScale
            onPressIn={handleMailboxPressIn}
            onPressOut={handleMailboxPressOut}
            hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}
            style={[styles.territoryMarkButton, isHolding && styles.territoryMarkButtonActive]}
          >
            <Image
              source={TERR_MARK_BUTTON_IMAGE}
              style={{ width: TERR_MARK_BUTTON_WIDTH, height: TERR_MARK_BUTTON_HEIGHT }}
              resizeMode="contain"
            />
          </PressableScale>
        </View>
      )}

      {isCaught && (
        <View style={styles.territoryCaughtOverlay} pointerEvents="box-none">
          <View style={styles.territoryCaughtCard}>
            <Text style={styles.territoryCaughtTitle}>Busted! 🚨</Text>
            <Text style={styles.gameOverText}>He caught you marking his mailbox.</Text>
            <PressableScale
              style={[styles.primaryButton, { backgroundColor: accentColor }]}
              onPress={handleTryAgain}
            >
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </PressableScale>
          </View>
        </View>
      )}

      {isComplete && (
        <View style={styles.territoryCaughtOverlay} pointerEvents="box-none">
          <View style={styles.territoryCaughtCard}>
            <Text style={styles.territoryCaughtTitle}>Marked! 🐾</Text>
            <Text style={styles.gameOverText}>You fully marked his mailbox without getting caught.</Text>
            <PressableScale
              style={[styles.primaryButton, { backgroundColor: accentColor }]}
              onPress={handlePlayAgain}
            >
              <Text style={styles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </View>
        </View>
      )}
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
  },

  container: {
    flexGrow: 1,
    backgroundColor: "transparent",
    padding: 20,
    paddingTop: 80,
    alignItems: "center",
  },

  // Doubles the old text title's fontSize (32 -> 64), matching the Home tab and Login screen logo swaps.
  titleImage: {
    height: 64,
    aspectRatio: 2100 / 443,
    marginBottom: 16,
    // Same soft drop shadow the old text title had.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4, // Android equivalent — shadow* alone is iOS-only.
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
    color: "#FF8C42",
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
    color: "#8E8E93",
    marginBottom: 16,
  },

  activitiesEmptyCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  activitiesEmptyText: {
    color: "#F5F5F5",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },

  activityPetRow: {
    gap: 10,
    paddingBottom: 14,
  },

  activityPetChip: {
    backgroundColor: "#1C1C1E",
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
    backgroundColor: "#1C1C1E",
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
    color: "#F5F5F5",
    marginBottom: 2,
  },

  activityDescription: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
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
    backgroundColor: "#1C1C1E",
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
    color: "#F5F5F5",
    textAlign: "center",
    marginBottom: 4,
  },

  gameDescription: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textAlign: "center",
  },

  // Full-screen shell every game uses now (Mark Your Territory always had its own version of this; the rest used to be a small card inside a scrollable page — see styles.gameFullScreenExitButton/Content/PlayWrap below).
  gameFullScreen: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    // Same web-only fix territoryFullScreen uses: a swipeable MaterialTopTabs pager doesn't reliably propagate height through flex:1 in a browser.
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : null),
  },

  // Floats over the game instead of sitting inline above a card (no card in full-screen mode) — top/left overridden per-render with safe-area insets, same pattern as territoryExitButton.
  gameFullScreenExitButton: {
    position: "absolute",
    zIndex: 10,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
  },

  // Column that fills the screen below the floating exit button; paddingTop/paddingBottom are overridden per-render with safe-area insets.
  gameFullScreenContent: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignItems: "center",
    paddingHorizontal: 20,
  },

  // Measured via onLayout by every game to size its board/track — this is what makes the play area actually fill the screen instead of sitting in a small fixed box. Always mounted (even on the idle screen) so a size is already known the moment Start Game is pressed.
  gameFullScreenPlayWrap: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  gameFullScreenIdleContent: {
    alignItems: "center",
    paddingHorizontal: 12,
  },

  exitButtonText: {
    color: "#FF8C42",
    fontWeight: "700",
    fontSize: 13,
  },

  gameTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#F5F5F5",
    marginBottom: 10,
  },

  gameSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8E8E93",
    textAlign: "center",
    marginBottom: 20,
  },

  primaryButton: {
    backgroundColor: "#FF8C42",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 10,
  },

  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  roundText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F5F5F5",
    marginBottom: 2,
  },

  roundSubtext: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 20,
  },

  padGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 220,
    justifyContent: "space-between",
    gap: 12,
  },

  pad: {
    width: 100,
    height: 100,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.55,
  },

  padActive: {
    opacity: 1,
  },

  padEmoji: {
    fontSize: 36,
  },

  gameOverText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F5F5F5",
    textAlign: "center",
    marginTop: 18,
  },

  mineGrid: {
    marginBottom: 8,
  },

  mineRow: {
    flexDirection: "row",
  },

  mineCell: {
    width: 42,
    height: 42,
    backgroundColor: "#FFE3CC",
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  mineCellRevealed: {
    backgroundColor: "#F5F5F5",
  },

  mineCellHazard: {
    backgroundColor: "#FFD1D1",
  },

  mineCellText: {
    fontSize: 16,
    fontWeight: "800",
  },

  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: FF_TRACK_WIDTH,
    marginBottom: 10,
  },

  scoreText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F5F5F5",
  },

  bestScoreText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8E8E93",
    alignSelf: "flex-end",
  },

  // Plain placeholder health bar for Fetch Frenzy — a simple filled track, easy to reskin once the sprite sheets arrive.
  ffHealthTrack: {
    width: FF_TRACK_WIDTH,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(0,0,0,0.25)",
    overflow: "hidden",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },

  ffHealthFill: {
    height: "100%",
    backgroundColor: "#FF5A5F",
    borderRadius: 7,
  },

  ffTrack: {
    width: FF_TRACK_WIDTH,
    height: FF_TRACK_HEIGHT,
    borderRadius: 18,
    backgroundColor: "#CDEFB8",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#9BD97A",
  },

  // Falling item placeholder — a plain emoji positioned absolutely by its own x/y; swap this <Text> for an <Image> once real sprites arrive (see the comment atop the Fetch Frenzy section). fontSize/width/height/lineHeight are all overridden per-render with the screen-scaled item size (see computeFetchFrenzyLayout) — these BASE constants are just the pre-measurement fallback.
  ffItemEmoji: {
    position: "absolute",
    fontSize: FF_ITEM_SIZE_BASE,
    width: FF_ITEM_SIZE_BASE,
    height: FF_ITEM_SIZE_BASE,
    textAlign: "center",
    lineHeight: FF_ITEM_SIZE_BASE,
  },

  // bottom/width/height are all overridden per-render with the screen-scaled dog size (see computeFetchFrenzyLayout) — these BASE constants are just the pre-measurement fallback.
  ffDogWrapper: {
    position: "absolute",
    left: 0,
    bottom: FF_DOG_BOTTOM_BASE,
    width: FF_DOG_WIDTH_BASE,
    height: FF_DOG_HEIGHT_BASE,
    alignItems: "center",
    justifyContent: "center",
  },

  ffDogEmoji: {
    fontSize: 36,
  },

  // Placeholder cave-tunnel track for Tight Squeeze — walls are drawn on top via SVG (buildTightSqueezeWallPath), this is just the open-passage background color.
  tsTrack: {
    width: TS_TRACK_WIDTH,
    height: TS_TRACK_HEIGHT,
    borderRadius: 18,
    backgroundColor: "#EAD9B7",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#4A3220",
  },

  // bottom/width/height are all overridden per-render with the screen-scaled dog size (see computeTightSqueezeLayout) — these BASE constants are just the pre-measurement fallback.
  tsDogWrapper: {
    position: "absolute",
    left: 0,
    bottom: TS_DOG_BOTTOM_BASE,
    width: TS_DOG_WIDTH_BASE,
    height: TS_DOG_HEIGHT_BASE,
    alignItems: "center",
    justifyContent: "center",
  },

  tsDogEmoji: {
    fontSize: 22,
  },

  instructionsText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textAlign: "center",
  },

  // Uses 100vh on web rather than relying on flex:1, since a swipeable MaterialTopTabs pager doesn't reliably propagate height through the flex chain in a browser — flex:1 alone was resolving to 0/auto height there, shrinking the house art to its natural size in a corner.
  territoryFullScreen: {
    flex: 1,
    width: "100%",
    backgroundColor: "#BFE6FF",
    // Clips the house image's sides when the scaled image is wider than the box (tall/portrait viewports) — height is always locked to fill the box, so only the sides ever need clipping.
    overflow: "hidden",
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : null),
  },

  // Floats over the scene instead of sitting above a card (no card in full-screen mode) — top/left overridden per-render with safe-area insets.
  territoryExitButton: {
    position: "absolute",
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  // Anchored to left/bottom so it sits on the road; pulled to the left edge rather than centered, which used to sit right on top of the dog.
  territoryMeterWrap: {
    position: "absolute",
  },

  // Dark rounded panel behind the meter's label/bar so it reads clearly against the road art; sized down for mobile, recolored to match the pixel-art mark-button's sampled palette with a faked 3D bevel via RN's per-side border colors.
  territoryMeterCard: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#E4BB83",
    borderWidth: 3,
    borderColor: "#2B1F19",
    borderTopColor: "#F1D5A9",
    borderLeftColor: "#F1D5A9",
    borderRightColor: "#2B1F19",
    borderBottomColor: "#2B1F19",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  // Dark ink brown on the light tan card (was white-on-dark before the card flipped to a light wood face), for a carved-into-wood look. No live percentage readout alongside it anymore — the scribble fill below is the only progress indicator (see TerritoryMeterScribbleTrack).
  territoryMeterLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#2B1F19",
    marginBottom: 4,
    textShadowColor: "rgba(255,255,255,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },

  // Sized to match the SVG track exactly (TERR_METER_TRACK_WIDTH/HEIGHT) — the old cap-overhang reasoning for this wrapper no longer applies (the leading-edge knob was dropped along with the flat-fill design; the scribble's own ragged edge reads as the "you are here" cue now), kept as a plain sizing wrapper.
  territoryMeterTrackOuter: {
    width: TERR_METER_TRACK_WIDTH,
    height: TERR_METER_TRACK_HEIGHT,
  },

  // Dedicated mark button wrap — just a positioning box with content centered, so the glow/button stack on the same horizontal center regardless of the button's fixed size.
  territoryMarkButtonWrap: {
    position: "absolute",
    alignItems: "center",
  },

  // Just a thin frame around the pixel-art image now (was a code-drawn circle before real art existed); only exists so PressableScale has something to apply its press-squish transform to.
  territoryMarkButton: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },

  // Slight opacity dip while isHolding stands in for an active-state recolor, since the image itself can't be recolored.
  territoryMarkButtonActive: {
    opacity: 0.8,
  },

  territoryCaughtOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  territoryCaughtCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 28,
    alignItems: "center",
    maxWidth: 300,
  },

  territoryCaughtTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
});