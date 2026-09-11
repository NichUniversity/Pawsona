import { useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { CoinIcon } from "../../components/ui/CoinIcon";
import { PressableScale } from "../../components/ui/PressableScale";
import { TabBackground } from "../../components/ui/TabBackground";
import { PetEntry, usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";
import { COSMETICS } from "../../data/cosmetics";
import { useTabBarClearance } from "../../hooks/useTabBarClearance";
import { getTabBarStyle } from "./_layout";

type GameId = "simon" | "minesweeper" | "parkour" | "territory";

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
    id: "parkour",
    name: "Pup Parkour",
    emoji: "🏃",
    available: true,
    description: "Jump hurdles, dodge walls!",
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
  const isTerritoryFullScreen = activeGame === "territory";

  // Same fade-the-floating-tab-bar pattern as adventure_tab.tsx: re-apply
  // getTabBarStyle rather than `undefined` when restoring it (undefined
  // drops the styling entirely instead of falling back to it — see
  // _layout.tsx's comment on getTabBarStyle).
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
      toValue: isTerritoryFullScreen ? 0 : 1,
      duration: 300,
      useNativeDriver: false, // driving a JS listener, not a native style prop
    }).start();
  }, [isTerritoryFullScreen, tabBarOpacity]);

  // Safety net: always restore the tab bar instantly when leaving this tab
  // entirely (e.g. swiping to another tab mid-game), regardless of
  // activeGame state or any in-flight fade — minigames stays mounted and
  // its state persists across tab swaps, same as adventure_tab.tsx.
  useFocusEffect(
    useCallback(() => {
      return () => {
        tabBarOpacity.stopAnimation();
        tabBarOpacity.setValue(1);
        navigation.setOptions({ tabBarStyle: restoredTabBarStyle });
      };
    }, [navigation, restoredTabBarStyle, tabBarOpacity])
  );

  // Mark Your Territory takes over the whole screen for an immersive porch
  // scene — no TabBackground/ScrollView chrome, no coin badge, just the
  // scene and the exit button. Every other game keeps the normal
  // scrollable card layout.
  if (isTerritoryFullScreen) {
    return <MarkYourTerritoryGame onExit={() => setActiveGame("menu")} />;
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

      {activeGame === "menu" && (
        <>
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
        </>
      )}

      {activeGame === "simon" && (
        <SimonSaysGame onExit={() => setActiveGame("menu")} />
      )}

      {activeGame === "minesweeper" && (
        <PetMinesweeperGame onExit={() => setActiveGame("menu")} />
      )}

      {activeGame === "parkour" && (
        <PupParkourGame onExit={() => setActiveGame("menu")} />
      )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Passive Coins (idle-clicker style activities)                       */
/*                                                                      */
/* Each activity has its own 30s cooldown per pet, a small random coin */
/* payout, and a chance to dig up a cosmetic the selected pet doesn't  */
/* already own. Cooldowns live in a ref (not state) since they don't   */
/* need to trigger a render themselves — a 1s ticker forces re-renders */
/* so the countdown text stays live and buttons re-enable on time.     */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Paw Pattern (Simon Says)                                            */
/* ------------------------------------------------------------------ */

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

  const [sequence, setSequence] = useState<number[]>([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [isShowingSequence, setIsShowingSequence] = useState(false);
  const [activePad, setActivePad] = useState<number | null>(null);
  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">(
    "idle"
  );

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

  return (
    <View
      style={[
        styles.gameBox,
        { backgroundColor: theme.card.background, borderColor: theme.card.border },
      ]}
    >
      <PressableScale
        style={[
          styles.exitButton,
          { backgroundColor: theme.card.background, borderColor: theme.card.border },
        ]}
        onPress={handleExit}
      >
        <Text style={[styles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      <Text style={[styles.gameTitle, { color: theme.text.primary }]}>🐾 Paw Pattern</Text>

      {gameState === "idle" && (
        <>
          <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
            Watch the pattern, then repeat it back. Every round earns{" "}
            <CoinIcon size={13} /> {COINS_PER_ROUND}!
          </Text>
          <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
            <Text style={styles.primaryButtonText}>Start Game</Text>
          </PressableScale>
        </>
      )}

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

          <View style={styles.padGrid}>
            {PADS.map((pad) => (
              <PressableScale
                key={pad.id}
                style={[
                  styles.pad,
                  { backgroundColor: pad.color },
                  activePad === pad.id && styles.padActive,
                ]}
                onPress={() => handlePadPress(pad.id)}
                disabled={gameState !== "playing" || isShowingSequence}
              >
                <Text style={styles.padEmoji}>{pad.emoji}</Text>
              </PressableScale>
            ))}
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
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Sniff & Seek (pet-themed Minesweeper)                               */
/* ------------------------------------------------------------------ */

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

  const [grid, setGrid] = useState<Cell[][]>(() => makeGrid());
  const [gameState, setGameState] = useState<"playing" | "won" | "lost">(
    "playing"
  );
  const [revealedCount, setRevealedCount] = useState(0);

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

  return (
    <View
      style={[
        styles.gameBox,
        { backgroundColor: theme.card.background, borderColor: theme.card.border },
      ]}
    >
      <PressableScale
        style={[
          styles.exitButton,
          { backgroundColor: theme.card.background, borderColor: theme.card.border },
        ]}
        onPress={onExit}
      >
        <Text style={[styles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      <Text style={[styles.gameTitle, { color: theme.text.primary }]}>🦴 Sniff & Seek</Text>
      <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
        Tap to dig. Long-press to mark a spot you think has a skunk 🦨. Clear
        every safe square to earn <CoinIcon size={13} /> {WIN_REWARD}!
      </Text>

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
                    cell.revealed && styles.mineCellRevealed,
                    cell.revealed && cell.hazard && styles.mineCellHazard,
                  ]}
                  onPress={() => revealCell(r, c)}
                  onLongPress={() => toggleFlag(r, c)}
                  disabled={gameState !== "playing"}
                >
                  <Text style={[styles.mineCellText, { color: textColor }]}>
                    {content}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        ))}
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
  );
}

/* ------------------------------------------------------------------ */
/* Pup Parkour (endless lane-runner)                                   */
/* ------------------------------------------------------------------ */

const LANE_COUNT = 3;
const TRACK_WIDTH = 260;
const TRACK_HEIGHT = 380;
const LANE_WIDTH = TRACK_WIDTH / LANE_COUNT;

const DOG_SIZE = 46;
const DOG_BOTTOM = 26;
const DOG_CENTER_Y = TRACK_HEIGHT - DOG_BOTTOM - DOG_SIZE / 2;
const COLLISION_HALF = 32;

const HURDLE_HEIGHT = 30;
const BARRIER_HEIGHT = 34;

const TICK_MS = 33;
const BASE_SPEED = 150; // px / second
const MAX_SPEED = 360;
const SPEED_RAMP_PER_POINT = 0.6;

const BASE_SPAWN_MS = 1300;
const MIN_SPAWN_MS = 650;
const SPAWN_RAMP_PER_POINT = 2;

const DODGE_BONUS = 15;
const JUMP_DURATION = 480;
const COINS_PER_DISTANCE = 25;

type ParkourObstacle = {
  id: number;
  type: "hurdle" | "barrier";
  lane: number; // for hurdles: the blocked lane
  safeLane: number; // for barriers: the open lane
  y: number;
  scored: boolean;
};

function laneToLeft(lane: number) {
  return lane * LANE_WIDTH + LANE_WIDTH / 2 - DOG_SIZE / 2;
}

function spawnParkourObstacle(id: number): ParkourObstacle {
  const isBarrier = Math.random() < 0.35;
  if (isBarrier) {
    const safeLane = Math.floor(Math.random() * LANE_COUNT);
    return { id, type: "barrier", lane: -1, safeLane, y: -BARRIER_HEIGHT, scored: false };
  }
  const lane = Math.floor(Math.random() * LANE_COUNT);
  return { id, type: "hurdle", lane, safeLane: -1, y: -HURDLE_HEIGHT, scored: false };
}

function PupParkourGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();

  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">(
    "idle"
  );
  const [obstacles, setObstacles] = useState<ParkourObstacle[]>([]);
  const [dogLane, setDogLane] = useState(1);
  const [isJumping, setIsJumping] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lastCoins, setLastCoins] = useState(0);

  // Mutable refs mirror the state above so the interval tick (created once
  // per "playing" session) always reads fresh values instead of a stale
  // closure from whichever render started the interval.
  const gameStateRef = useRef(gameState);
  const dogLaneRef = useRef(dogLane);
  const isJumpingRef = useRef(isJumping);
  const scoreRef = useRef(0);
  const scoreFloatRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const nextIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dogTranslateX = useRef(new Animated.Value(0)).current;
  const dogTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const setDogLaneSynced = (lane: number) => {
    setDogLane(lane);
    dogLaneRef.current = lane;
  };

  const setIsJumpingSynced = (val: boolean) => {
    setIsJumping(val);
    isJumpingRef.current = val;
  };

  const moveLane = (targetLane: number) => {
    if (gameStateRef.current !== "playing") return;
    const clamped = Math.max(0, Math.min(LANE_COUNT - 1, targetLane));
    if (clamped === dogLaneRef.current) return;
    setDogLaneSynced(clamped);
    Animated.spring(dogTranslateX, {
      toValue: laneToLeft(clamped) - laneToLeft(1),
      useNativeDriver: true,
      friction: 6,
      tension: 80,
    }).start();
  };

  const jump = () => {
    if (gameStateRef.current !== "playing" || isJumpingRef.current) return;
    setIsJumpingSynced(true);
    Animated.sequence([
      Animated.timing(dogTranslateY, {
        toValue: -56,
        duration: JUMP_DURATION * 0.42,
        useNativeDriver: true,
      }),
      Animated.timing(dogTranslateY, {
        toValue: 0,
        duration: JUMP_DURATION * 0.58,
        useNativeDriver: true,
      }),
    ]).start(() => setIsJumpingSynced(false));
  };

  const endGame = () => {
    if (gameStateRef.current !== "playing") return;
    gameStateRef.current = "gameover";
    setGameState("gameover");

    const finalScore = scoreRef.current;
    setBest((prev) => Math.max(prev, finalScore));

    const coinsEarned = Math.floor(finalScore / COINS_PER_DISTANCE);
    if (coinsEarned > 0) earnCoins(coinsEarned);
    setLastCoins(coinsEarned);
  };

  const tick = () => {
    const dt = TICK_MS / 1000;
    const speed = Math.min(
      MAX_SPEED,
      BASE_SPEED + scoreRef.current * SPEED_RAMP_PER_POINT
    );

    // Advance the distance score.
    scoreFloatRef.current += speed * dt * 0.1;
    scoreRef.current = Math.floor(scoreFloatRef.current);
    setScore(scoreRef.current);

    // Spawn new obstacles on a difficulty-scaled timer.
    spawnTimerRef.current += TICK_MS;
    const spawnInterval = Math.max(
      MIN_SPAWN_MS,
      BASE_SPAWN_MS - scoreRef.current * SPAWN_RAMP_PER_POINT
    );
    let shouldSpawn = false;
    if (spawnTimerRef.current >= spawnInterval) {
      spawnTimerRef.current = 0;
      shouldSpawn = true;
    }

    setObstacles((prev) => {
      let hit = false;
      const moved = prev.map((o) => ({ ...o, y: o.y + speed * dt }));

      for (const o of moved) {
        if (o.scored) continue;
        const height = o.type === "hurdle" ? HURDLE_HEIGHT : BARRIER_HEIGHT;
        const centerY = o.y + height / 2;
        if (Math.abs(centerY - DOG_CENTER_Y) <= COLLISION_HALF) {
          o.scored = true;
          const collided =
            o.type === "hurdle"
              ? o.lane === dogLaneRef.current && !isJumpingRef.current
              : dogLaneRef.current !== o.safeLane;

          if (collided) {
            hit = true;
          } else {
            scoreFloatRef.current += DODGE_BONUS;
            scoreRef.current = Math.floor(scoreFloatRef.current);
          }
        }
      }

      const next = moved.filter((o) => o.y < TRACK_HEIGHT + 60);

      if (shouldSpawn) {
        next.push(spawnParkourObstacle(nextIdRef.current++));
      }

      if (hit) {
        // Defer to avoid updating state mid-update-of-another-state.
        setTimeout(endGame, 0);
      }

      return next;
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
    intervalRef.current = setInterval(tick, TICK_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const startGame = () => {
    setObstacles([]);
    setDogLaneSynced(1);
    setIsJumpingSynced(false);
    setScore(0);
    scoreRef.current = 0;
    scoreFloatRef.current = 0;
    spawnTimerRef.current = 0;
    nextIdRef.current = 0;
    dogTranslateX.setValue(0);
    dogTranslateY.setValue(0);
    setGameState("playing");
    gameStateRef.current = "playing";
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => gameStateRef.current === "playing",
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        gameStateRef.current === "playing" &&
        (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8),
      onPanResponderRelease: (_evt, gesture) => {
        if (gameStateRef.current !== "playing") return;
        const { dx, dy } = gesture;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
          jump();
        } else if (dx > 24) {
          moveLane(dogLaneRef.current + 1);
        } else if (dx < -24) {
          moveLane(dogLaneRef.current - 1);
        }
      },
    })
  ).current;

  return (
    <View
      style={[
        styles.gameBox,
        { backgroundColor: theme.card.background, borderColor: theme.card.border },
      ]}
    >
      <PressableScale
        style={[
          styles.exitButton,
          { backgroundColor: theme.card.background, borderColor: theme.card.border },
        ]}
        onPress={onExit}
      >
        <Text style={[styles.exitButtonText, { color: accentColor }]}>← Back to Games</Text>
      </PressableScale>

      <Text style={[styles.gameTitle, { color: theme.text.primary }]}>🏃 Pup Parkour</Text>

      {gameState === "idle" && (
        <>
          <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
            Tap to jump over logs 🪵. Swipe left or right to slip through
            gaps in the walls 🧱. Every bit of distance earns coins —{" "}
            <CoinIcon size={13} /> 1 per {COINS_PER_DISTANCE} distance!
          </Text>
          <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
            <Text style={styles.primaryButtonText}>Start Run</Text>
          </PressableScale>
        </>
      )}

      {gameState !== "idle" && (
        <>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreText, { color: theme.text.primary }]}>🐾 {score}</Text>
            <Text style={[styles.bestScoreText, { color: theme.text.secondary }]}>Best {Math.max(best, score)}</Text>
          </View>

          <View
            style={styles.parkourTrack}
            {...panResponder.panHandlers}
          >
            <View style={styles.parkourLaneDivider1} />
            <View style={styles.parkourLaneDivider2} />

            {obstacles.map((o) =>
              o.type === "hurdle" ? (
                <View
                  key={o.id}
                  style={[
                    styles.hurdleBlock,
                    { left: o.lane * LANE_WIDTH + 6, top: o.y },
                  ]}
                >
                  <Text style={styles.hurdleEmoji}>🪵</Text>
                </View>
              ) : (
                <View key={o.id} style={[styles.barrierRow, { top: o.y }]}>
                  {Array.from({ length: LANE_COUNT }).map((_, laneIdx) =>
                    laneIdx === o.safeLane ? (
                      <View key={laneIdx} style={styles.barrierGap} />
                    ) : (
                      <View key={laneIdx} style={styles.wallCell}>
                        <Text style={styles.wallEmoji}>🧱</Text>
                      </View>
                    )
                  )}
                </View>
              )
            )}

            <View style={styles.dogShadow} />
            <Animated.View
              style={[
                styles.dogWrapper,
                {
                  transform: [
                    { translateX: dogTranslateX },
                    { translateY: dogTranslateY },
                  ],
                },
              ]}
            >
              <Text style={styles.dogEmoji}>🐕</Text>
            </Animated.View>
          </View>

          {gameState === "playing" && (
            <Text style={[styles.instructionsText, { color: theme.text.secondary }]}>
              Tap to jump · Swipe to dodge
            </Text>
          )}

          {gameState === "gameover" && (
            <>
              <Text style={[styles.gameOverText, { color: theme.text.primary }]}>
                You made it {score}m! 🎉{" "}
                {lastCoins > 0 ? `+${lastCoins} coins` : "Go a bit further next time!"}
              </Text>
              <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
                <Text style={styles.primaryButtonText}>Run Again</Text>
              </PressableScale>
            </>
          )}
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Mark Your Territory (full-screen static porch scene — gameplay      */
/* reworked later)                                                     */
/*                                                                      */
/* The old hold-to-mark-the-mailbox mechanic (Marked meter, neighbor    */
/* safe/tell/danger phases, busted state, mailbox/hydrant targets, coin */
/* payout) has been pulled out. This now just renders the block, full-  */
/* bleed across the whole screen (Minigames swaps to this instead of    */
/* its normal ScrollView layout, and fades the floating tab bar out —   */
/* see isTerritoryFullScreen above): the house art (TERR_HOUSE_IMAGE)   */
/* with the neighbor sitting on the porch reading the paper             */
/* (TERR_PORCH_GUY_IMAGE). Gameplay gets rebuilt on top of this scene    */
/* later.                                                                */
/* ------------------------------------------------------------------ */

// Hand-illustrated house scene (porch, mailbox, picket-fenced yard).
// Natural pixel size of the source file — needed below to replicate
// resizeMode="cover"'s scale/crop math in JS.
const TERR_HOUSE_IMAGE = require("../../assets/images/territory-house.png");
// Swapped (2026-09-04) for a new hand-drawn blue two-story house. Natural
// pixel size of THIS file — every anchor below was re-measured against
// this image's own 1086x1316 pixel space by color-sampling the art
// (porch-deck tan vs. grass green, mailbox blue vs. its surroundings,
// sidewalk vs. road asphalt), the same method used for the original
// house image. They are not portable to any other house art.
//
// Canvas extended upward (2026-09-07) from 1086x1316 to 1086x2262 — 946px
// of plain background added above the original art, matching its own
// near-white/cream color and faint paper-grain texture (sampled from a
// clean corner patch, not tiled from real rows, since the top rows
// turned out to contain part of the roofline's decorative pendant and a
// first attempt at tiling them produced an obviously repeated diamond
// pattern climbing the extension — caught by looking at the result
// before shipping it, not assumed clean). This is the actual fix for the
// phone-screen tradeoff described in the TERR_HOUSE_ZOOM/scale comments
// below: rather than mathematically shrinking the whole scene to force
// more width into frame (which was always going to cost either a top
// gap or a side crop, see the history there), the image's OWN aspect
// ratio is now close to a typical phone's (1086/2262 ≈ 0.48, vs. common
// phones' ~0.45-0.56), so a plain height-locked fit shows nearly the
// full width — including the fence — AND fills the full height with
// zero gap, on most real phone sizes, without needing to trade one for
// the other anymore. Checked against several common device sizes'
// logical points (iPhone SE 375x667 through iPhone 14 Pro Max 430x932)
// before shipping: 94-100% of the width shows uncropped on every one of
// them, zero top/bottom letterboxing on all of them.
const TERR_HOUSE_IMG_WIDTH = 1086;
const TERR_HOUSE_IMG_HEIGHT = 2262;
// This is a genuine two-way tradeoff between 1 and anything less than 1,
// not a bug to keep chasing — bounced between both values once already
// (2026-09-07): at 1, the house exactly fills the container height with
// zero top gap, at the cost of cropping proportionally more off both
// sides on narrower phones (reported as "zoomed it in too far"); at
// 0.98, the sides crop a little less, at the cost of a small gap
// showing only at the top (house is bottom-anchored, so any shrink here
// shows up above it and nowhere else — reported as "the top of the
// screen is showing again"). Currently 1 (zero top gap) per the most
// recent request — if the side crop becomes the bigger complaint again,
// the real fix is extending TERR_HOUSE_IMG_HEIGHT further (bringing the
// image's own aspect ratio even closer to a phone's) rather than
// continuing to toggle this value back and forth.
const TERR_HOUSE_ZOOM = 1;

// Neighbor in a rocking chair reading the paper — each stage below is
// cropped tight to his silhouette (transparent PNG, no padding). Each
// stage carries its own `aspect` (that file's own width/height) so we
// can compute an exact on-screen width from a chosen height with no
// letterboxing/stretching, even though separately-generated stage
// images won't come out pixel-identical in canvas size or crop margins
// to one another. The three SRC_* constants below (shared by every
// stage) are anchor points measured against TERR_HOUSE_IMAGE's own real
// pixel space instead — the porch's own fixed floor line and the
// chair's horizontal position on it — so every stage renders at the
// same spot and the same on-screen size on the porch regardless of
// device, independent of any one stage image's own resolution.
//
// "Attentiveness" stages: same neighbor, same chair — only the
// newspaper's position changes, from fully up (not paying attention)
// down to not held up at all (looking straight at the player).
//
// To add a stage once its PNG is ready: crop it tight to the character
// silhouette (matching how the existing ones are cropped), drop the
// file in assets/images/, add one { source, aspect } entry to this
// array (most-oblivious first, most-attentive last — aspect = that
// file's own pixel width / height), and neighborStage below picks
// which one renders — nothing else needs to change.
const TERR_PORCH_GUY_STAGES = [
  {
    // Full replacement (2026-09-07) — all 6 poses (stages 1-5 + caught)
    // now come from a single 3x2 reference sheet the user supplied, one
    // generation pass, same character/chair/art-style drawn consistently
    // across every cell (top-left through bottom-right = most-oblivious
    // to busted). Background was already transparent in the source; each
    // cell was split at its nominal 512x512 grid boundary, a ~1px stray
    // seam artifact at the stage-2/stage-3 boundary (a duplicated sliver
    // of outline-colored pixels sitting exactly on the cut line, present
    // in both neighboring cells) was zeroed out, then each cell was
    // trimmed tight to its own opaque content with a 3px soft-alpha
    // margin. Verified clean: alpha-channel connected-component check
    // found exactly one main silhouette per cell (no stray dots/holes),
    // and the mid-alpha (anti-aliased edge) pixels average near-black,
    // not near-white — i.e. real edge softening, not a white-background
    // halo. Supersedes the 2026-09-04/2026-09-07 standalone-illustration
    // art and its padding-based size-jump fix below — this new sheet's
    // poses render at consistent chair/character scale at a shared fixed
    // height without needing any top-padding (confirmed by resizing all
    // 6 trimmed images to one common height and compositing them
    // side-by-side: chair size and seat height line up across every
    // stage). Top-left cell = newspaper fully covering his face, seated
    // in the rocking chair. Re-trimmed (2026-09-07, see the
    // horizontal-jitter note on TERR_PORCH_GUY_CAUGHT below) to 425x497 —
    // this stage's own left/right margins were already close to even, so
    // barely changed size.
    source: require("../../assets/images/territory-porch-guy.png"),
    aspect: 425 / 497,
  },
  {
    // From the same 3x2 sheet (top-middle cell) — newspaper lowered
    // slightly, eyes/eyebrows visible over the top in an annoyed glare.
    // Re-trimmed (2026-09-07) from 493x494 to 423x490 — had 68px of dead
    // transparent margin on the right vs 8px on the left (see the note
    // below), now trimmed tight and even on both sides.
    source: require("../../assets/images/territory-porch-guy-stage-2.png"),
    aspect: 423 / 490,
  },
  {
    // From the same 3x2 sheet (top-right cell) — newspaper lowered
    // further, full face visible (eyes, brow, mustache) in an annoyed
    // glare. Re-trimmed (2026-09-07) from 489x491 to 414x487 — had 78px
    // of dead margin on the right vs 0px on the left, the worst offender
    // of the six (see the note below).
    source: require("../../assets/images/territory-porch-guy-stage-3.png"),
    aspect: 414 / 487,
  },
  {
    // From the same 3x2 sheet (bottom-left cell) — newspaper lowered
    // further still, more shirt/suspenders visible below the face.
    // Re-trimmed (2026-09-07) to 425x487 — like stage 1, this one's
    // margins were already close to even.
    source: require("../../assets/images/territory-porch-guy-stage-4.png"),
    aspect: 425 / 487,
  },
  {
    // From the same 3x2 sheet (bottom-middle cell) — most-attentive
    // non-caught pose, full glare, newspaper held lowest of the five.
    // Re-trimmed (2026-09-07) from 449x501 to 426x495 — had 23px of dead
    // margin on the right vs 6px on the left.
    source: require("../../assets/images/territory-porch-guy-stage-5.png"),
    aspect: 426 / 495,
  },
];

// Separate from the attentiveness sequence above — this is the "caught you
// peeing" reaction (red-faced, furious, staring straight out), shown
// (2026-09-03) when MarkYourTerritoryGame's stage loop reaches the last
// entry in TERR_PORCH_GUY_STAGES while the player is still holding the
// mailbox. Swapped in directly via `isCaught` rather than through
// neighborStage/the stages array — it's a distinct busted state, not
// another notch in the oblivious-to-attentive progression. Replaced
// (2026-09-07) along with the 5 stages above, from the same 3x2 reference
// sheet's bottom-right cell — red/flushed face, furious glare, same
// processing (seam-artifact cleanup, tight trim). Re-trimmed again later
// the same day (see note below) from 461x504 to 382x501 — had 54px of
// dead margin on the right vs 31px on the left.
//
// Horizontal-jitter fix (2026-09-07, applies to all 6 files above and
// this one): user reported the character visibly shifts left/right at
// every stage transition, even though CENTER_X/guyLeft math centers each
// stage's BOUNDING BOX at the exact same screen x regardless of its own
// width (guyLeft = CENTER_X*scale + houseOffsetX - guyWidth/2, so the box
// center is provably fixed). Root cause was upstream of that math: when
// the 3x2 sheet was originally split and each cell trimmed to its own
// tight bounding box, the vertical (top/bottom) trim came out tight and
// consistent (3-7px margin) on every stage, but the horizontal trim did
// not — measured directly, several stages had wildly uneven left/right
// margins (e.g. stage 3: 0px left vs 78px right; caught: 31px left vs
// 54px right; stage 1/4 were fine, ~5-6px both sides). Since the box
// CENTER is what's pinned to CENTER_X, not the visible content, a big gap
// of dead transparent space on one side of a stage's own file pushes that
// stage's actual drawn character off from the box's true center — and
// that offset differs stage to stage, reading as a left/right jitter on
// every transition even though the anchor math itself was already
// correct. Fixed by re-measuring each file's real content bounding box
// (alpha>15 threshold, same as every other cleanup pass in this doc) and
// re-cropping tight with a uniform 3px margin on all four sides —
// verified after the fact by resizing all 6 to a common height and
// drawing each one's own box-center line over it: the chair/character
// silhouette now lines up under that line consistently across every
// stage, where before the fix stage 2/3 in particular sat visibly left
// of it. No code changes needed beyond the `aspect` value each file's own
// section records above (and this one, just below) — CENTER_X/LIFT and
// the render math are untouched.
const TERR_PORCH_GUY_CAUGHT = {
  source: require("../../assets/images/territory-porch-guy-caught.png"),
  aspect: 382 / 501,
};
// Re-measured (2026-09-04) against the new house art: the porch deck's
// tan/gray surface reads cleanly from source y~787 down to y~804 before
// giving way to grass, and the open stretch of blue wall clear of the
// door, front window, and both support posts sits roughly x~765-845 —
// so the chair is centered a bit left of that post to keep clearance.
// Nudged further left in small steps (2026-09-07, per user feedback) from
// 780 down to 726 — 765, 758, 748, 736, 726. Then the user asked for him
// centered on the porch instead ("i want him to be in the middle so to
// the left alot more"), a much bigger jump than the small steps before
// it: set to 555, roughly the midpoint of the porch's full open floor
// (door-side post ~235 to corner post ~858). This deliberately puts him
// square in front of the window rather than beside it — the window-
// overlap concern flagged at 758+ (see the earlier history this replaces)
// is no longer a nudge-by-nudge accident at this point, it's the explicit
// ask, so not re-flagging it the same way going forward unless it reads
// wrong live. One more small nudge left after that, to 540 — then a
// nudge back the other way, to 560, after the user clarified they'd
// actually meant right — then set directly to 600, then 650, then 670,
// per successive requests.
const TERR_PORCH_GUY_SRC_CENTER_X = 670;
// Shifted from 800 to 1746 (2026-09-07) — the +946 the canvas-extension
// section above added to the top of the image moved every existing
// y-anchor down by that same amount, since none of the real content
// moved, only the blank space above it grew. Horizontal anchors (CENTER_X
// above) are untouched — the extension only added rows, not columns.
const TERR_PORCH_GUY_SRC_FLOOR_Y = 1746;
// Scaled from the previous house's 125 by the same ratio as the two
// images' heights (1316/1198) so the character keeps the same visual
// size relative to the porch rather than shrinking/growing with the
// new art's own resolution.
const TERR_PORCH_GUY_SRC_HEIGHT = 137;
// Manual nudge on top of the measured floor-line anchor above — per user
// feedback he still read as sitting a touch low/forward on the porch.
// Source-pixel units (like the anchors above), so it scales consistently
// with everything else instead of drifting at different screen sizes.
// Scaled from 34 by the same 1316/1198 ratio as the height above, to
// preserve the same lift-to-height proportion on the new art. Reduced
// (2026-09-07) from 37 to 20, then to 8, then to 3, then to -2, across
// four rounds of user feedback to nudge him further down — less lift
// means guyBottom (= (FLOOR_Y - LIFT) * scale) grows, which moves him
// further down toward the floor line. Negative is fine here — it's just
// added back to FLOOR_Y rather than subtracted, nudging him slightly
// past the originally-measured floor line rather than up off of it.
const TERR_PORCH_GUY_LIFT = -2;

// Mailbox hold-target, measured the same way as the porch-guy anchors
// above (fixed pixel coordinates in TERR_HOUSE_IMAGE's own 1086x1316
// space, found by color-thresholding the mailbox's box against the
// grass/sky around it) — so the touch target and the pee stream's
// endpoint stay locked to the mailbox regardless of screen size.
// Re-measured (2026-09-04) for the new house art: the mailbox box's post
// sits at source x~552, and its blue box reads from y~807 (roof edge)
// down to y~913 (where it gives way to the white post beneath). Both Y
// values shifted by +946 (2026-09-07, same canvas-extension shift as
// TERR_PORCH_GUY_SRC_FLOOR_Y above — see that comment).
const TERR_MAILBOX_SRC_CENTER_X = 552;
const TERR_MAILBOX_SRC_TOP_Y = 1753;
const TERR_MAILBOX_SRC_BOTTOM_Y = 1859;

// Where the dog character stands — the paved road at the very bottom of
// TERR_HOUSE_IMAGE (measured by color-sampling the curb/asphalt line).
// Same fixed-source-pixel anchor pattern as the porch guy/mailbox
// anchors above. Horizontally the dog rests directly under the mailbox
// (TERR_MAILBOX_SRC_CENTER_X), so the pee stream — already anchored to
// that same x — reads as coming from him.
// Re-measured (2026-09-04) for the new house art: the sidewalk gives way
// to the road at source y~1195-1200, so 1255 sits comfortably inside the
// road band below that, matching the old image's ~60px curb clearance.
// Shifted by +946 (2026-09-07, same canvas-extension shift as the other
// Y anchors above).
const TERR_DOG_SRC_Y = 2201;
// Where the dog stands while actively marking (isHolding is true) —
// beside the mailbox post itself rather than his far-away resting spot
// on the road, so the peeing pose reads as him actually marking the
// mailbox instead of aiming a long stream at it from the street.
// TERR_MAILBOX_SRC_BOTTOM_Y is only where the visible blue box gives way
// to the post beneath it, not where the post meets the ground — no exact
// "post meets lawn" pixel has been measured for this art, so the Y offset
// below is an approximation. The X offset stands him to the mailbox's
// right rather than directly in front of the post, so both stay visible.
// Nudge either by eye if he doesn't land right at the post's base.
const TERR_DOG_AT_MAILBOX_Y = TERR_MAILBOX_SRC_BOTTOM_Y + 130;
const TERR_DOG_AT_MAILBOX_X_OFFSET = 70;
// How long the slide to/from the mailbox takes when isHolding toggles.
const TERR_DOG_APPROACH_MS = 220;
// Emoji glyphs don't have their own aspect/anchor data like the PNG
// stages, so this is just a chosen on-screen size in the same
// source-pixel scale as everything else, tuned to look proportionate
// next to the mailbox rather than measured from art. Original value (110)
// was tuned against the old mailbox's 92px-tall box; scaled up to 127 to
// match the new mailbox's ~106px-tall box at the same proportion.
const TERR_DOG_SRC_HEIGHT = 127;
// Purpose-drawn art for this scene's dog (2026-09-07), replacing the
// earlier approach of borrowing the player's own pet's avatar/walk-cycle
// art as a stand-in — this pair was hand-drawn specifically as this dog's
// two states: standing/walking, and the leg-lifted "marking" pose used at
// the mailbox. Background was keyed out to transparent and each image
// trimmed to its own content, same treatment as the porch-guy stage art
// above. Source art faces left (nose toward the left edge of the frame),
// so TerritoryDog flips it horizontally to face right toward the mailbox,
// same as the emoji fallback below always needed.
const TERR_DOG_IDLE_IMAGE = require("../../assets/images/territory-dog-idle.png");
const TERR_DOG_PEEING_IMAGE = require("../../assets/images/territory-dog-peeing.png");
// Known intrinsic aspect ratios (width / height) for the two pose images,
// measured from the source PNGs. Used as the web fallback below since
// react-native-web's Image has no resolveAssetSource to read this from the
// asset itself — native keeps reading the exact value from the asset.
const TERR_DOG_IDLE_ASPECT = 1029 / 821;
const TERR_DOG_PEEING_ASPECT = 1056 / 781;
// Hand-drawn pee-stream + splash animation (user-provided sprite sheet,
// 2026-09-08): 6 frames, each de-keyed to a transparent background and
// cropped to a shared union bounding box so every frame lines up exactly
// the same way (same treatment as the porch-guy/dog art above — no
// per-frame jitter from mismatched crops). Drawn top-to-bottom (stream
// falling from the top of the frame into a splash at the bottom), which
// is why TerritoryPeeStream below anchors the top of this art to the dog
// and the bottom to the mailbox, then rotates the whole strip to point
// between wherever those two things actually are on screen.
const TERR_PEE_STREAM_FRAMES = [
  require("../../assets/images/territory-pee-stream-1.png"),
  require("../../assets/images/territory-pee-stream-2.png"),
  require("../../assets/images/territory-pee-stream-3.png"),
  require("../../assets/images/territory-pee-stream-4.png"),
  require("../../assets/images/territory-pee-stream-5.png"),
  require("../../assets/images/territory-pee-stream-6.png"),
];
// Measured intrinsic size of the cropped frames above (width / height) —
// same web-fallback reasoning as TERR_DOG_IDLE_ASPECT: react-native-web
// has no resolveAssetSource, so the aspect is hardcoded here instead of
// read from the asset at runtime.
const TERR_PEE_STREAM_FRAME_ASPECT = 249 / 295;
const TERR_PEE_STREAM_FPS = 10;
// Fallback only, for the (currently unreachable) case TerritoryDog is ever
// used without the art above — kept as a cheap safety net rather than
// deleted outright.
const TERR_DOG_EMOJI = "🐕";
const TERR_DOG_ENTRANCE_MS = 1200;
const TERR_DOG_HOP_MS = 150;

// Ambient background birds (2026-09-10), purely decorative — no gameplay
// tie-in, just life in the sky above the roofline. Hand-drawn 6-frame
// wing-flap cycle (user-provided sheet, same 3x2-grid-of-poses shape as
// the neighbor reference sheet was), each frame background-removed via
// flood-fill from the border inward (threshold 30 against white) rather
// than a global brightness cutoff — same reasoning as the dog-art cleanup
// above, though this source had no enclosed light-colored content to
// protect either way. Verified clean (one connected component per frame,
// no cross-cell seam artifacts, no white halo on a sky-blue or dark
// composite) before wiring in. Unlike the pee-stream frames (cropped to a
// shared union bbox so that strip never changes size), each bird frame
// keeps its OWN tight trim — the wings genuinely take up a different
// silhouette width open vs. tucked, so letting width follow each frame's
// own aspect at a fixed render height (same pattern TERR_PORCH_GUY_STAGES
// and the dog's idle/peeing poses already use) reads as the wing motion
// itself rather than a resize glitch.
const TERR_BIRD_FRAMES = [
  require("../../assets/images/territory-bird-1.png"),
  require("../../assets/images/territory-bird-2.png"),
  require("../../assets/images/territory-bird-3.png"),
  require("../../assets/images/territory-bird-4.png"),
  require("../../assets/images/territory-bird-5.png"),
  require("../../assets/images/territory-bird-6.png"),
];
// Web fallback aspects (width/height), measured from the trimmed source
// files — same reasoning as TERR_DOG_IDLE_ASPECT above: react-native-web
// has no resolveAssetSource, so native reads the exact value from the
// asset at runtime and web falls back to this hardcoded table instead.
const TERR_BIRD_FRAME_ASPECTS = [320 / 261, 320 / 196, 320 / 187, 320 / 230, 320 / 205, 320 / 249];
// A single fixed aspect used for the bird's on-screen BOX size (2026-09-10,
// added after the user reported the bird visibly growing/shrinking through
// its own wing-flap — sizing the box off each frame's own trim, as the
// render originally did, means a wings-spread frame (aspect ~1.71) and a
// wings-tucked one (~1.23) produce boxes ~40% apart in width at the same
// fixed height, which reads as pulsing rather than flapping. Averaging all
// 6 frames' aspects gives one representative box size that stays constant
// for the whole animation; each frame's own true proportions still render
// correctly and without distortion inside that fixed box via the Image's
// existing resizeMode="contain" (letterboxed within the box rather than
// stretched to fill it) — so the wing motion itself is unaffected, only
// the surrounding box stops resizing frame to frame.
const TERR_BIRD_FIXED_ASPECT =
  TERR_BIRD_FRAME_ASPECTS.reduce((sum, a) => sum + a, 0) / TERR_BIRD_FRAME_ASPECTS.length;

// Module-level cache for Image.resolveAssetSource(...).width/height lookups
// (2026-09-10, added while chasing a "things go invisible/flashy after the
// minigame screen's been open a while" report). TerritoryBird and
// TerritoryDog both called resolveAssetSource fresh on every render to read
// each pose/frame's exact aspect ratio — cheap-looking, but a real native
// bridge round trip each time, and TerritoryBird's wing-flap cycling alone
// was doing that up to 16x/second (2 birds x up to 8fps) for as long as
// this screen stayed mounted, which — since switching to another bottom tab
// doesn't actually unmount it (the tab navigator keeps inactive tab screens
// alive) — could be far longer than the visible play time suggests. A
// local require() resolves to a stable numeric module id on native, so it's
// a safe cache key; on web (no resolveAssetSource at all) this is never
// consulted, same as before. Caching removes the repeated bridge calls
// without changing any visible sizing — same numbers, just computed once
// per asset instead of every render/frame.
const territoryAssetAspectCache = new Map<number, number>();
function resolveTerritoryAssetAspect(source: ImageSourcePropType, fallbackAspect: number): number {
  if (Platform.OS === "web" || typeof Image.resolveAssetSource !== "function") return fallbackAspect;
  if (typeof source !== "number") {
    // Not a local require() (shouldn't happen for this file's own art, but
    // fall back rather than risk caching something that could change).
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
// On-screen size (the fixed HEIGHT budget — width follows each frame's own
// aspect, see above), in the same everything-scales-with-screen-height
// spirit as the dog/porch-guy, but not tied to any TERR_HOUSE_IMAGE source
// pixel anchor the way those are — birds are free-floating sky decoration,
// not registered against a specific spot in the art, so this is chosen
// directly as a fraction of the container height in the render below
// rather than scaled from a source-pixel constant.
const TERR_BIRD_SIZE_FRACTION = 0.05;
// Each bird flies a single crossing (TERR_BIRD_FLIGHT_MS-ish, tuned per
// instance below) and then sits idle off-screen before flying again. The
// idle wait is re-rolled fresh after every flight to a random value in
// [_MIN_CYCLE_MS, _MAX_CYCLE_MS] — "fly by at random" (per the user's ask)
// rather than a fixed ~10s metronome — same random-interval-per-tick
// pattern TERR_STAGE_MIN/MAX_INTERVAL_MS already uses for the neighbor's
// attentiveness clock. The range is centered around the original ~10s ask
// (average wait ≈ 11s) so it still feels like "about every 10 seconds,"
// just not mechanically so.
const TERR_BIRD_CYCLE_MIN_MS = 6000;
const TERR_BIRD_CYCLE_MAX_MS = 16000;
const TERR_BIRD_FLIGHT_MS = 4200;

// How often the neighbor's attentiveness advances a stage, in ms — a
// random value in this range is rolled after every tick so the rhythm
// isn't perfectly predictable, but never so fast/slow it feels unfair.
// Slowed down overall per feedback: the floor is kept the same (still
// occasionally snappy/near-instant, especially right after a long wait —
// that contrast is the "slowly or instantly, randomly" feel that was
// asked for) but the ceiling was raised a lot, roughly tripling the
// average wait between stage changes (was ~2000ms, now ~4200ms) and
// widening the spread so the rhythm reads as genuinely unpredictable
// rather than a narrow, easy-to-learn band.
// Floor raised again (2026-09-08) alongside TERR_MARK_FILL_MS below going
// up, to preserve the same fairness invariant that constant's comment
// describes: the guaranteed-worst-case time-to-bust (4 stage advances all
// rolling the minimum) is 4 x TERR_STAGE_MIN_INTERVAL_MS = 8000ms, kept
// comfortably above the new, longer fill time so holding continuously
// from a fresh round can still always finish even on the unluckiest roll.
const TERR_STAGE_MIN_INTERVAL_MS = 2000;
const TERR_STAGE_MAX_INTERVAL_MS = 7000;

// Coins for releasing safely before he reaches the last (most-attentive)
// stage — same ballpark as Paw Pattern's per-round reward, since this is
// also a quick, repeatable round rather than a one-time win.
const TERR_MARK_REWARD = 5;

// Total accumulated holding time (ms) needed to fill the "Marking"
// progress meter all the way and complete the round. Progress only
// accrues while the mailbox is actively held, but is never reset by
// releasing — same no-arbitrary-resets philosophy as the neighbor's
// attentiveness clock (see the fix-round note above) — so several short
// holds add up exactly like one long one. Raised from 5000 (2026-09-08,
// per feedback) to make marking take noticeably longer — still kept below
// the *minimum* possible time-to-bust (4 stage advances x
// TERR_STAGE_MIN_INTERVAL_MS = 8000ms, see that constant's comment, which
// was raised alongside this one) so a player who holds continuously from
// a fresh round can always finish in time on an unlucky-fast roll; slower
// rolls just add margin. Ticks every TERR_MARK_TICK_MS while held.
const TERR_MARK_FILL_MS = 7500;
const TERR_MARK_TICK_MS = 100;

// One-time bonus for fully filling the meter (completing the round)
// instead of just banking per-release marks — bigger than TERR_MARK_REWARD
// since it's the round's actual win condition, same idea as Minesweeper's
// WIN_REWARD vs. its smaller incidental rewards.
const TERR_COMPLETE_REWARD = 20;

// Marking-meter redesign (2026-09-10): once markProgress crosses this
// fraction, the meter card gets a pulsing amber glow — a visual "almost
// there" urgency cue, the win-side counterpart to the neighbor's own
// approaching-bust tension (there's still no equivalent cue for THAT risk,
// see the open-follow-ups note elsewhere in the project doc — this only
// covers the meter).
const TERR_METER_URGENT_THRESHOLD = 0.85;

// Dedicated on-screen "hold to mark" button (2026-09-10) — sits on the
// right side of the screen, independent of the mailbox's own on-screen
// position, so a player's thumb no longer has to rest directly over the
// mailbox art (and its pee-stream/dog animation) to mark it. Originally a
// code-drawn circle; swapped for the user-supplied pixel-art wood-sign
// asset (2026-09-10 follow-up) and sized small per that request — a real
// tap target this size would be too cramped on its own, so hitSlop at the
// call site pads the actual touchable area back out past Apple's 44pt
// minimum without changing how big the art reads on screen.
// TERR_MARK_BUTTON_ASPECT is the source PNG's own width/height (450x138)
// so the on-screen size always keeps its proportions no matter what width
// is picked here.
const TERR_MARK_BUTTON_IMAGE = require("../../assets/images/territory-mark-button.png");
const TERR_MARK_BUTTON_WIDTH = 78;
const TERR_MARK_BUTTON_ASPECT = 450 / 138;
const TERR_MARK_BUTTON_HEIGHT = TERR_MARK_BUTTON_WIDTH / TERR_MARK_BUTTON_ASPECT;

// Both TerritoryPulseHalo (the shared pulsing-glow component) and
// TerritoryMailboxHint (its thin wrapper around the mailbox itself) were
// removed here (2026-09-11, per the user's "take the flashing away from
// behind the mark button and take the flashing away on the mailbox" ask)
// — neither HUD element flashes anymore. The wood-sign button art and the
// mailbox's own on-screen position already read clearly enough without an
// animated hint.

// The pee-stream effect: cycles through the hand-drawn 6-frame sprite
// (TERR_PEE_STREAM_FRAMES) stretched and rotated into a strip that runs
// from the dog's actual current position to the mailbox, so it reads as
// coming out of him rather than a line drawn from a fixed screen spot.
// The art is drawn top-to-bottom (stream at top, splash at bottom), so
// `origin` (the dog) anchors the top of the strip and `target` (the
// mailbox) anchors the bottom; the strip is then rotated around its own
// center so that top-to-bottom axis points exactly from origin to target,
// covering every relative position the two could be in (left/right of
// each other, closer/farther) without needing a separate mirrored asset.
// Frame-cycling reuses the same rAF-driven, drift-free approach as
// WalkingSprite, reimplemented inline rather than wrapping that component
// directly since its built-in bob/sway gait motion doesn't belong on a
// liquid effect. Mounted only while actively holding, so playback starts
// fresh each time rather than needing an internal enabled/disabled gate.
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
  // Rotation (degrees, clockwise per RN/CSS convention) that points the
  // strip's built-in top-to-bottom ("down") axis at (dx, dy) instead of
  // straight down — see the derivation in the component doc comment above:
  // rotating (0, 1) clockwise by theta gives (-sin theta, cos theta), so
  // matching that to (dx, dy) needs theta = atan2(-dx, dy).
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
        // Mirrored left-right in its own local space — independent of the
        // outer View's rotate above, which only orients the strip toward
        // the target, so this flip doesn't change where the stream points.
        style={{ width: "100%", height: "100%", transform: [{ scaleX: -1 }] }}
        resizeMode="stretch"
      />
    </View>
  );
}

// One ambient background bird: cycles the 6-frame wing-flap sprite on an
// rAF loop (same drift-free approach as TerritoryPeeStream's frame-cycling
// above) while making a single crossing of the sky at constant speed
// (Easing.linear), then sits idle off-screen for a randomized wait before
// flying again — "fly by at random" (per the user's ask), rather than
// either an endless back-to-back stream or a metronomic fixed interval.
// `direction` controls both which edge he starts/ends at and whether the
// art (drawn facing right in its source form, same orientation as every
// other character in this file) gets flipped to face left. Purely
// decorative — no gameplay tie-in, mounted unconditionally alongside the
// rest of the scene once it's laid out.
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
  // 0 -> 1: one single crossing (see the scheduling useEffect below, which
  // resets this to 0 and re-animates it up to 1 once per cycle rather than
  // using Animated.loop — a loop can't insert an idle pause between
  // iterations the way a manual setTimeout-driven repeat can).
  const progress = useRef(new Animated.Value(0)).current;

  // Wing-flap frame cycling — started/stopped by the flight-scheduling
  // effect below, exactly bracketing each flight, rather than running for
  // this component's entire mounted lifetime (2026-09-10, changed while
  // chasing a "screen glitches/things go invisible after a while" report).
  // The bird sits fully off-screen (see startX/endX below — progress is 0
  // or 1 the whole time it isn't mid-flight) for the idle pause between
  // flights, which with the random 6-17.6s cycle against a ~4.2-5.5s
  // flight is 60-75% of the time — ticking invisible wing frames through
  // that whole stretch, forever, for as long as this screen stays mounted
  // (switching to another bottom tab doesn't unmount it — see the
  // project doc), was pure wasted work: a React state update plus an
  // aspect-ratio lookup up to 8x/second per bird, with nothing on screen
  // to show for most of it.
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
  // Safety net only — the flight effect below is what normally starts/stops
  // this; this just guarantees no rAF survives past unmount.
  useEffect(() => stopWingFlap, []);

  // Flies once (0 -> 1 over flightMs), then — once actually landed off the
  // far edge, not just "duration elapsed" (the `finished` check skips
  // rescheduling if this effect got torn down/re-run mid-flight) — rolls a
  // fresh random wait in [minCycleMs, maxCycleMs] (re-rolled every time,
  // same pattern as the neighbor's own randomStageDelay()) and schedules
  // the next flight after it. A recursive setTimeout chain (same pattern
  // the neighbor's stageLoopRef uses elsewhere in this file) rather than
  // Animated.loop, since a loop has no built-in way to pause between
  // iterations, let alone a randomized one.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const randomPauseMs = () =>
      Math.max(0, minCycleMs + Math.random() * (maxCycleMs - minCycleMs) - flightMs);

    const flyOnce = () => {
      if (cancelled) return;
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
  // Box size is fixed across every frame (TERR_BIRD_FIXED_ASPECT, see its
  // own comment above) rather than each frame's own trimmed aspect. This
  // alone turned out NOT to be enough (2026-09-10, second pass at this same
  // bug): with resizeMode="contain", a frame whose own aspect doesn't
  // exactly match the fixed box's aspect still gets letterboxed DOWN within
  // it — contain preserves the image's true proportions by shrinking
  // whichever axis doesn't fit, so the visible bird still grew/shrank
  // frame to frame even though the invisible bounding box no longer did
  // (worse in one respect than before this fix: previously at least the
  // height was rock-solid and only width varied; a fixed-aspect box with
  // contain let BOTH axes drift depending on which side of the average a
  // given frame's aspect fell on). Switched to resizeMode="stretch" so the
  // artwork fills the fixed box completely on every frame, full stop — no
  // letterboxing, no shrink-to-fit, so the box size IS the visible size,
  // every frame. This does mean each frame is stretched slightly off its
  // own true aspect (±~16% at the extremes vs. the 1.468 average) rather
  // than rendered pixel-perfect, but at this art's actual on-screen size
  // (a few dozen px tall) that's the same tradeoff already accepted
  // elsewhere in this file (the neighbor's own Image also uses
  // resizeMode="stretch") and reads as far less wrong than a visibly
  // pulsing bird. No per-frame Image.resolveAssetSource call is needed
  // here at all anymore either way — one less native-bridge round trip per
  // frame step on top of the wing-flap-only-while-flying fix from the
  // round before.
  const aspect = TERR_BIRD_FIXED_ASPECT;
  const width = size * aspect;

  // Off-screen at both ends regardless of container width — same
  // -(x + size)-style derivation TerritoryDog's entranceStartX uses for
  // its own off-screen guarantee, just for both edges here since this
  // loops continuously instead of arriving once.
  const startX = direction === "left-to-right" ? -width : containerWidth + width;
  const endX = direction === "left-to-right" ? containerWidth + width : -width;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: y,
        left: 0,
        width,
        height: size,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] }) },
          // Drawn facing right in its source form — flip only when flying
          // right-to-left so he always faces the direction he's headed.
          { scaleX: direction === "right-to-left" ? -1 : 1 },
        ],
      }}
    >
      <Image source={frameSource} style={{ width, height: size }} resizeMode="stretch" />
    </Animated.View>
  );
}

// The dog itself — hops in from off-screen left along the road once on
// mount, settles at its resting spot under the mailbox, then steps up
// right next to the mailbox post (and swaps to the leg-lifted "marking"
// pose image, TERR_DOG_PEEING_IMAGE) whenever the player is holding the
// mailbox, so marking reads as him actually at the mailbox rather than
// aiming a stream at it from the street — and steps back to his resting
// spot on release.
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
  // 0 -> 1 once, on mount: carries the entrance slide from off-screen left
  // to the resting spot. Never replayed after that — he's already there
  // for the rest of the round, whatever happens with holding/busts.
  const entrance = useRef(new Animated.Value(0)).current;
  // Small up/down bob, looped only while the entrance slide is playing —
  // makes the approach read as a hop/trot rather than a flat slide across
  // the screen. Stopped and zeroed once he arrives.
  const hop = useRef(new Animated.Value(0)).current;
  // 0 -> 1 while isHolding is true (and back on release): slides him from
  // his resting spot up to right beside the mailbox post, additively on
  // top of the entrance/hop above. Independent of those — can fire many
  // times per round as the player presses in/out, unlike the one-shot
  // entrance.
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

  // How far left (in screen px) the entrance has to start from to
  // guarantee he's actually off-screen, not just off *his resting spot* —
  // a fixed offset (the original -180) wasn't enough on a wide/letterboxed
  // layout, where the mailbox (and so his resting x) can sit hundreds of
  // px in from the real left edge. Derived from his own rest position
  // (restX) and size rather than the container width: starting at
  // -(restX + size) always places his right edge at restX - size/2 - size,
  // i.e. a full extra half-size past the screen's x=0 with margin to
  // spare, regardless of how wide the container actually is.
  const entranceStartX = -(restX + size);

  // Which pose is showing right now. Recomputed every render (not cached)
  // so it tracks isHolding live, same as the porch guy swapping stage
  // images. Each pose is its own trimmed art with its own aspect ratio
  // (the peeing pose's raised leg makes it wider/shorter than idle), read
  // via Image.resolveAssetSource (synchronous for a local require(), no
  // network/async involved) on native, through the same module-level cache
  // TerritoryBird uses (resolveTerritoryAssetAspect, see its comment above)
  // rather than a fresh native-bridge call every render — this component
  // re-renders on every markProgress tick (every 100ms) while the mailbox
  // is held, so uncached this was a real, avoidable, frequent cost, same
  // class of issue as the bird's wing-flap loop. react-native-web doesn't
  // implement resolveAssetSource at all (it throws "is not a function"),
  // so on web we fall back to the pose's known intrinsic aspect ratio
  // instead — `size` continues to mean the on-screen HEIGHT budget; width
  // follows from that + aspect.
  const poseImage = isHolding && peeingImage ? peeingImage : idleImage;
  const fallbackAspect = isHolding && peeingImage ? peeingAspect : idleAspect;
  const aspect = poseImage ? resolveTerritoryAssetAspect(poseImage, fallbackAspect) : 1;
  const width = size * aspect;

  const content = poseImage ? (
    <Image source={poseImage} style={{ width, height: size }} resizeMode="contain" />
  ) : (
    // Fallback — only reachable if TerritoryDog is ever used without the
    // dedicated pose art above.
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
          // World-space moves across the screen — both listed before the
          // local flip below so neither is affected by it (transform
          // functions compose local-to-world in reverse list order, same
          // as CSS): he always enters from the left regardless of which
          // way he's facing, and slides the same screen-space amount to
          // reach the mailbox regardless of facing too.
          { translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [entranceStartX, 0] }) },
          { translateX: atMailbox.interpolate({ inputRange: [0, 1], outputRange: [0, atMailboxX - restX] }) },
          { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          { translateY: atMailbox.interpolate({ inputRange: [0, 1], outputRange: [0, atMailboxY - restY] }) },
          // Both the pose art and the emoji fallback face left in their
          // source form, so always flip to face right toward the mailbox.
          { scaleX: -1 },
        ],
      }}
    >
      {content}
    </Animated.View>
  );
}

function MarkYourTerritoryGame({ onExit }: { onExit: () => void }) {
  const { accentColor, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { earnCoins } = usePets();

  // Which "attentiveness" stage the neighbor is showing — 0 is the most
  // oblivious (paper fully up), rising toward the last entry in
  // TERR_PORCH_GUY_STAGES (looking straight at the player). Advances on
  // its own random-interval timer below (see the mount effect that owns
  // `stageLoopRef`/`stageTimeoutRef`), independent of whether the player
  // is currently holding — holding only matters for what happens *when*
  // he reaches the last stage.
  const [neighborStage, setNeighborStage] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isCaught, setIsCaught] = useState(false);
  const [markFeedback, setMarkFeedback] = useState<string | null>(null);
  // 0..1 fill level of the "Marking" progress meter — accrues while held,
  // persists across releases, resets only on Try Again / Play Again. See
  // TERR_MARK_FILL_MS above.
  const [markProgress, setMarkProgress] = useState(0);
  // Round-complete (won by fully filling the meter) — distinct from
  // isCaught (lost). Both stop the neighbor's stage clock.
  const [isComplete, setIsComplete] = useState(false);
  // Whether the dog has actually finished sliding up beside the mailbox —
  // deliberately separate from isHolding. TerritoryDog's own on-screen
  // position takes TERR_DOG_APPROACH_MS to animate from his resting spot
  // to atMailboxX/Y (see its `atMailbox` Animated.Value), but isHolding
  // itself flips true the instant the mailbox is pressed. The pee stream
  // below is anchored to the dog's *final* at-mailbox coordinates, so
  // gating it on isHolding directly made the splash appear at that spot
  // immediately — before he'd actually slid there — reading as the pee
  // starting before the dog reached the mailbox. Mirrors isHolding but
  // delayed on the way up (matching the slide-in duration) and instant on
  // the way down, so the stream disappears the moment the player releases.
  const [isDogAtMailbox, setIsDogAtMailbox] = useState(false);

  // Refs mirror the state above for the setTimeout-driven loop below to
  // read at fire time — its callback is scheduled outside of React's
  // render cycle (it reschedules itself from inside its own timeout
  // callback), so it can't rely on values captured in a render's closure
  // without risking stale reads.
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

  const stageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ticks up markProgress while the mailbox is held — started on press-in,
  // cleared on press-out/bust/completion (see handlers below).
  const markIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Holds the "advance one stage, then either bust or reschedule itself"
  // function — set once by the mount effect below, but also called from
  // outside it (restartStageLoop, on a safe release or Try Again), so it
  // lives in a ref rather than a local closure.
  const stageLoopRef = useRef<() => void>(() => {});

  const randomStageDelay = () =>
    TERR_STAGE_MIN_INTERVAL_MS +
    Math.random() * (TERR_STAGE_MAX_INTERVAL_MS - TERR_STAGE_MIN_INTERVAL_MS);

  const restartStageLoop = useCallback(() => {
    if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current);
    neighborStageRef.current = 0;
    setNeighborStage(0);
    stageTimeoutRef.current = setTimeout(() => stageLoopRef.current(), randomStageDelay());
  }, []);

  useEffect(() => {
    stageLoopRef.current = () => {
      if (isCaughtRef.current || isCompleteRef.current) return;
      const next = (neighborStageRef.current + 1) % TERR_PORCH_GUY_STAGES.length;
      neighborStageRef.current = next;
      setNeighborStage(next);
      if (next === TERR_PORCH_GUY_STAGES.length - 1 && isHoldingRef.current) {
        // Busted: he hit the most-attentive stage while the player was
        // still holding. Stop the loop instead of scheduling another tick,
        // and stop the meter from ticking further too — bust overrides an
        // in-progress mark, it doesn't race it.
        isCaughtRef.current = true;
        setIsCaught(true);
        isHoldingRef.current = false;
        setIsHolding(false);
        if (markIntervalRef.current) {
          clearInterval(markIntervalRef.current);
          markIntervalRef.current = null;
        }
        return;
      }
      stageTimeoutRef.current = setTimeout(() => stageLoopRef.current(), randomStageDelay());
    };
    stageTimeoutRef.current = setTimeout(() => stageLoopRef.current(), randomStageDelay());
    return () => {
      if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      if (markIntervalRef.current) clearInterval(markIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drives isDogAtMailbox off isHolding: delayed by TERR_DOG_APPROACH_MS on
  // the rising edge (so it flips true right as TerritoryDog's own slide
  // animation finishes), immediate on the falling edge. isHolding is set
  // false on every path that ends a hold — release, bust, and meter
  // completion (see handleMailboxPressOut and the two branches below) — so
  // this single effect covers all of them without needing to duplicate the
  // reset in each spot.
  useEffect(() => {
    if (!isHolding) {
      setIsDogAtMailbox(false);
      return;
    }
    const t = setTimeout(() => setIsDogAtMailbox(true), TERR_DOG_APPROACH_MS);
    return () => clearTimeout(t);
  }, [isHolding]);

  // Drives the marking-meter's "almost there" glow pulse (part of the
  // 2026-09-10 meter redesign — see the meter's own render/style comments
  // below). A single Animated.Value looped opacity, mounted only while
  // genuinely urgent (progress past the threshold and the round still
  // live) rather than always-looping-but-invisible, so there's no pulsing
  // animation quietly ticking in the background for the entire rest of a
  // round that already finished or busted.
  const meterGlow = useRef(new Animated.Value(0)).current;
  const isMeterUrgent = markProgress >= TERR_METER_URGENT_THRESHOLD && !isCaught && !isComplete;
  useEffect(() => {
    if (!isMeterUrgent) {
      meterGlow.setValue(0);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(meterGlow, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(meterGlow, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
      meterGlow.setValue(0);
    };
  }, [isMeterUrgent, meterGlow]);

  const showMarkFeedback = (text: string) => {
    setMarkFeedback(text);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setMarkFeedback(null), 900);
  };

  const handleMailboxPressIn = () => {
    if (isCaughtRef.current || isCompleteRef.current) return;
    // Instant bust if he's already sitting on his most-attentive last
    // stage the moment the player grabs the mailbox (2026-09-11 fix). The
    // stageLoopRef timer below only busts on the *transition into* the
    // last stage while holding (see its own `next === length-1 &&
    // isHoldingRef.current` check) — it never re-fires just because a new
    // hold starts while he's already there, and the next scheduled tick
    // wraps him back to stage 0 rather than re-checking the same stage.
    // That let a hold started during his last stage slip through with no
    // catch at all. Checking here closes that gap: any hold that begins
    // while he's already on the last stage is caught immediately, exactly
    // like the user asked ("if the user holds the mark at all he should
    // be caught").
    if (neighborStageRef.current === TERR_PORCH_GUY_STAGES.length - 1) {
      if (stageTimeoutRef.current) {
        clearTimeout(stageTimeoutRef.current);
        stageTimeoutRef.current = null;
      }
      isCaughtRef.current = true;
      setIsCaught(true);
      return;
    }
    isHoldingRef.current = true;
    setIsHolding(true);
    // Start ticking the marking meter. Progress carries over from any
    // earlier holds this round (see markProgressRef — never reset here),
    // so this just resumes accruing where it left off.
    if (markIntervalRef.current) clearInterval(markIntervalRef.current);
    markIntervalRef.current = setInterval(() => {
      const next = Math.min(1, markProgressRef.current + TERR_MARK_TICK_MS / TERR_MARK_FILL_MS);
      markProgressRef.current = next;
      setMarkProgress(next);
      if (next >= 1) {
        // Meter filled while still safely holding — round won. Stop
        // everything else (neighbor clock, holding) the same way a bust
        // does, just via the success path instead.
        if (markIntervalRef.current) {
          clearInterval(markIntervalRef.current);
          markIntervalRef.current = null;
        }
        if (stageTimeoutRef.current) clearTimeout(stageTimeoutRef.current);
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
    // Released safely before he caught on — award the mark. His stage
    // keeps advancing on its own ambient clock either way (it's never
    // paused or reset by holding/releasing — only a bust or Try Again
    // resets it), so nothing here touches neighborStage. The marking
    // meter's progress is left exactly where it was too — only the
    // interval that was ticking it stops; the accumulated fill stays.
    earnCoins(TERR_MARK_REWARD);
    showMarkFeedback(`+${TERR_MARK_REWARD}`);
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

  // Measure the container's own rendered box instead of trusting
  // useWindowDimensions(). On native those two normally match, but on
  // Expo web the app can be laid out inside a narrower centered column
  // than the actual browser window — useWindowDimensions() there reports
  // the full (wider) browser viewport, so the fit math below would size
  // the scene for a box bigger than what's really on screen and the
  // porch guy would land off in the extra space beside it, not on the
  // house. onLayout always reports what this View actually rendered at,
  // on every platform.
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

  // Scale is locked to the container's HEIGHT (never the width) — see the
  // long history in the TERR_HOUSE_IMG_WIDTH/_HEIGHT comment above for
  // how this stopped being a real width-vs-height tradeoff once the
  // canvas itself was extended to a phone-like aspect ratio: two earlier
  // 2026-09-07 attempts (a straight zoom-out, then a never-crop "contain"
  // fit) both fought the SAME underlying mismatch — this art's original
  // 1086x1316 proportions vs. a phone screen's — by shrinking/reflowing
  // the rendered scene at runtime, which unavoidably traded one visible
  // gap (top letterbox) against another (side crop, hiding the fence).
  // Fixing the source image's own aspect ratio instead means a plain
  // height-locked fit already lands close to full-width on real phone
  // sizes, so this is back to the simple original formula — just against
  // a taller TERR_HOUSE_IMG_HEIGHT now. TERR_HOUSE_ZOOM stays as a small
  // (2%) safety margin, not a load-bearing part of the fix anymore.
  const scale = layout ? (layout.height / TERR_HOUSE_IMG_HEIGHT) * TERR_HOUSE_ZOOM : 0;
  const scaledHouseWidth = TERR_HOUSE_IMG_WIDTH * scale;
  const scaledHouseHeight = TERR_HOUSE_IMG_HEIGHT * scale;
  // Positive = letterboxed (image narrower than box, padded left/right).
  // Negative = cropped (image wider than box, overflow clipped left/right
  // by territoryFullScreen's own overflow:"hidden") — the normal case on
  // a narrow phone screen, per the tradeoff explained above.
  const houseOffsetX = layout ? (layout.width - scaledHouseWidth) / 2 : 0;
  // Vertically, though, NOT centered — pinned to the BOTTOM instead (all
  // the leftover height goes above the roofline as top-only letterboxing,
  // none below the street) per user feedback that centering it left a
  // visible gap of the screen's own background peeking out beneath the
  // road. The full gap (layout.height - scaledHouseHeight) sits above the
  // house; the house's own bottom edge (the street) then lands exactly on
  // the container's bottom edge, same as the original always-flush-top
  // height-locked behavior did on wide screens, just flipped to flush-
  // bottom so the letterboxing (when there is any) reads as "sky/margin
  // above the roof" instead of "gap below the road."
  const houseOffsetY = layout ? layout.height - scaledHouseHeight : 0;

  // At TERR_HOUSE_ZOOM=1, scaledHouseHeight is algebraically identical to
  // layout.height (TERR_HOUSE_IMG_HEIGHT * (layout.height /
  // TERR_HOUSE_IMG_HEIGHT) === layout.height) so houseOffsetY should be
  // exactly 0 — but the user still reported a faint blue sliver at the
  // top on real mobile viewports even with that. Not the same tradeoff
  // as before: this is float/sub-pixel rounding (the container and the
  // absolutely-positioned image can each round their computed height to
  // the nearest device pixel independently, e.g. web `vh` units and RN's
  // own layout rounding don't always agree to the sub-pixel), not a
  // deliberate percentage-of-height shrink like TERR_HOUSE_ZOOM was. A
  // fixed few-pixel overscan applied only to the rendered <Image>'s own
  // top/height (not to houseOffsetY itself, which every other anchor
  // — porch guy, mailbox, dog — still keys off) guarantees the image
  // always overshoots the container's top edge by a hair regardless of
  // rounding, and resizeMode="cover" just crops that sliver of extra
  // content off invisibly rather than stretching anything.
  const houseTopOverscan = 3;

  const guyHeight = TERR_PORCH_GUY_SRC_HEIGHT * scale;
  const guyWidth = guyHeight * currentNeighborStage.aspect;
  const guyLeft = TERR_PORCH_GUY_SRC_CENTER_X * scale + houseOffsetX - guyWidth / 2;
  const guyBottom = (TERR_PORCH_GUY_SRC_FLOOR_Y - TERR_PORCH_GUY_LIFT) * scale + houseOffsetY;
  const guyTop = guyBottom - guyHeight;

  // Mailbox on-screen position, from the fixed source-pixel anchors above
  // — same scale/offset math as the porch guy, so it stays locked to the
  // mailbox art regardless of screen size.
  const mailboxCenterX = TERR_MAILBOX_SRC_CENTER_X * scale + houseOffsetX;
  const mailboxTopY = TERR_MAILBOX_SRC_TOP_Y * scale + houseOffsetY;
  const mailboxBottomY = TERR_MAILBOX_SRC_BOTTOM_Y * scale + houseOffsetY;

  // Dog's resting on-screen position — same x column as the mailbox (see
  // the constant's comment above), standing on the road below it. Size is
  // clamped so he doesn't shrink to nothing on a very short/letterboxed
  // layout.
  const dogRestY = TERR_DOG_SRC_Y * scale + houseOffsetY;
  const dogSize = Math.max(46, TERR_DOG_SRC_HEIGHT * scale);
  // Where he slides to while actively marking — right beside the mailbox
  // post (see TERR_DOG_AT_MAILBOX_Y/X_OFFSET above).
  const dogAtMailboxX = mailboxCenterX + TERR_DOG_AT_MAILBOX_X_OFFSET * scale;
  const dogAtMailboxY = TERR_DOG_AT_MAILBOX_Y * scale + houseOffsetY;
  // Width of the peeing-pose art at its current on-screen size, used below
  // to offset the pee stream's origin toward the dog's rear rather than
  // his horizontal center. He's flipped to face right (see TerritoryDog's
  // scaleX: -1), so his rear/tail sits on the LEFT side of his own
  // bounding box — conveniently the side closer to the mailbox already.
  const dogPeeingWidth = dogSize * TERR_DOG_PEEING_ASPECT;

  return (
    <View
      style={styles.territoryFullScreen}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayout({ width, height });
      }}
    >
      {layout && (
        <>
          {/* Sized to the exact scaled dimensions computed above (height
              locked to the container, times TERR_HOUSE_ZOOM, width
              following the source aspect ratio) and offset by
              houseOffsetX/houseOffsetY (bottom-anchored vertically,
              centered horizontally), rather than filling the container
              and letting resizeMode do the fit/crop — React Native Web's
              Image, given StyleSheet.absoluteFillObject or any style
              without explicit width/height, falls back to the source
              asset's own natural pixel size instead of filling its parent
              (confirmed live via DOM inspection), so explicit numeric
              dimensions are what's needed on web regardless. Since
              width/height here already match the source aspect exactly,
              resizeMode has no extra fitting left to do. */}
          <Image
            source={TERR_HOUSE_IMAGE}
            style={{
              position: "absolute",
              // top/height overshoot the container's real top edge by
              // houseTopOverscan (see that constant's comment above) to
              // absorb sub-pixel rounding — houseOffsetY/scaledHouseHeight
              // themselves (used by every other anchor) are untouched.
              top: houseOffsetY - houseTopOverscan,
              left: houseOffsetX,
              width: scaledHouseWidth,
              height: scaledHouseHeight + houseTopOverscan,
            }}
            resizeMode="cover"
          />

          {/* Ambient sky birds — purely decorative, not registered against
              any TERR_HOUSE_IMAGE source-pixel anchor the way the porch
              guy/mailbox/dog are (see TERR_BIRD_SIZE_FRACTION's comment),
              just placed as a fraction of the container itself. Both
              y-fractions (0.20, 0.28 — lowered 2026-09-11 per the user's
              "lower the birds" ask, up from 0.08/0.16) still sit safely
              above where the roofline lands (~42% down the container at
              every screen size, per the house-canvas-extension section in
              the project doc, since TERR_HOUSE_ZOOM=1 makes scale purely
              height-locked) so they never visually cross in front of the
              house art. One flies
              left-to-right, one right-to-left, per the user's ask; each
              also flies by at a random interval (TERR_BIRD_CYCLE_MIN/_MAX)
              rather than a fixed cadence, re-rolled after every flight —
              with a slightly different flight length/range/start-delay
              on each so they don't read as a mirrored, synced pair even
              when their random waits happen to land close together. */}
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
            // Gated on isDogAtMailbox rather than isHolding directly — see
            // that state's own comment above — so the stream doesn't mount
            // until TerritoryDog has actually finished sliding up next to
            // the mailbox; otherwise it was drawn at his at-mailbox
            // coordinates for the ~TERR_DOG_APPROACH_MS he was still
            // visibly mid-slide, reading as the pee starting before he got
            // there. Origin is shifted toward the dog's rear (left, toward
            // the mailbox, since he faces right) rather than his horizontal
            // center, and raised to roughly back/hip height — high enough
            // above the ground to give the stream real length to fall
            // through. Target is TERR_DOG_AT_MAILBOX_Y (the same
            // approximate "post meets ground" anchor the dog himself
            // stands on) rather than mailboxBottomY (where the visible box
            // meets the post): that point sits well ABOVE the dog, which
            // made the stream visibly run uphill from him to the mailbox.
            // Keeping the target at ground level — below the raised origin
            // — keeps the flow reading top-to-bottom like actual falling
            // liquid, landing at the base of the mailbox post.
            <TerritoryPeeStream
              originX={dogAtMailboxX - dogPeeingWidth * 0.4}
              originY={dogAtMailboxY - dogSize * 0.4}
              targetX={mailboxCenterX + dogSize * 0.12}
              targetY={dogAtMailboxY + dogSize * 0.15}
            />
          )}
          {markFeedback && (
            <Text
              pointerEvents="none"
              style={[
                styles.territoryMarkFeedback,
                { left: mailboxCenterX - 30, top: mailboxTopY - 36 },
              ]}
            >
              {markFeedback} <CoinIcon size={13} />
            </Text>
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

      {/* Marking progress meter — fills while the mailbox is held (see
          handleMailboxPressIn) and never drains on release, only on Try
          Again / Play Again. Hidden once the round has already ended
          either way, since neither overlay below needs it showing through.
          Moved down onto the road (2026-09-08, was pinned under the top
          safe-area inset alongside the exit button); redesigned again
          (2026-09-10, per the user's "redesign the marking progress meter"
          ask) — same dark HUD-card anchoring as before, but the bar itself
          is now a two-tone pill with a leading-edge cap (like a slider
          thumb, so the current fill point reads clearly rather than just
          "the bar is this long"), a live percentage readout next to the
          label, and a pulsing amber glow around the whole card once
          progress crosses TERR_METER_URGENT_THRESHOLD — an "almost
          marked" tension cue, the win-side counterpart the project doc had
          flagged as missing (that doc's note was about the neighbor's
          approaching-bust risk specifically; this covers the meter's own
          approaching-win side, not that one). */}
      {!isCaught && !isComplete && (
        <View
          pointerEvents="none"
          style={[
            styles.territoryMeterWrap,
            // houseOffsetX (not just insets.left) so this lands on the
            // actual house/road art rather than the blue letterbox
            // background beside it — houseOffsetX is 0-or-negative on a
            // real phone (the art is scaled to overflow width, no
            // letterbox), where insets.left alone is already correct, but
            // goes positive on a wide/landscape viewport (like a desktop
            // browser during `expo start --web` testing), where the art
            // is narrower than the screen and sits inset from the edges —
            // exactly the case that was putting this outside the picture.
            // The max() keeps it from ever landing off the left edge of
            // the screen itself on the no-letterbox phone case.
            { left: Math.max(houseOffsetX + 16, insets.left + 16), bottom: insets.bottom + 28 },
          ]}
        >
          {/* Glow ring: sits behind the card, same rounded footprint but
              slightly larger via a negative inset, opacity driven straight
              off meterGlow (0 whenever not urgent, per that effect's own
              comment, so this is inert — no always-on loop — for nearly
              the whole round). */}
          <Animated.View
            style={[
              styles.territoryMeterGlow,
              { opacity: meterGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) },
            ]}
          />
          <View style={styles.territoryMeterCard}>
            <View style={styles.territoryMeterHeaderRow}>
              <Text style={styles.territoryMeterLabel}>Marking</Text>
              <Text style={styles.territoryMeterPercent}>{Math.round(markProgress * 100)}%</Text>
            </View>
            {/* Outer wrapper has no overflow clipping (unlike the track
                below it) so the leading-edge cap can sit right on the fill
                boundary, including hanging slightly past 0%/100%, without
                being cut off — only the fill bar itself needs the pill
                clip. */}
            <View style={styles.territoryMeterTrackOuter}>
              <View style={styles.territoryMeterTrack}>
                <View style={[styles.territoryMeterFillBase, { width: `${markProgress * 100}%` }]}>
                  {/* Lighter top band for a glossy-pill look, plus the
                      thin brighter shine strip right at its own top edge —
                      two stacked layers standing in for a real gradient
                      (no gradient library in this project — see the
                      house-art/porch-guy sections of the project doc for
                      the same reasoning applied to image assets). */}
                  <View style={styles.territoryMeterFillShineBand} />
                  <View style={styles.territoryMeterFillShineLine} />
                </View>
              </View>
              {/* Leading-edge cap — a small round marker at the current
                  fill point. `left` is the percentage string, and the
                  circle is centered on that point via a fixed negative
                  margin (half its own size) baked into the style below —
                  RN doesn't support percentage-based transforms on
                  native, so this is the portable way to center a
                  fixed-size dot on a percent-based position, rather than
                  `transform: [{ translateX: '-50%' }]`. Reads as "you are
                  here" rather than just the bar's own end. */}
              <View
                style={[
                  styles.territoryMeterCap,
                  { left: `${markProgress * 100}%` },
                  isMeterUrgent && styles.territoryMeterCapUrgent,
                ]}
              />
            </View>
          </View>
        </View>
      )}

      {/* Dedicated "hold to mark" button (2026-09-10) — mirrors the
          meter's left-side anchoring (same houseOffsetX/insets max, same
          bottom offset) but on the right, so the two HUD elements read as
          a matching pair. Replaces the old Pressable that used to sit
          directly on top of the mailbox art: holding that one meant a
          thumb was resting right over the mailbox (and the pee-stream/dog
          animation next to it) for the whole hold, blocking the view of
          the very thing the player was marking. The mailbox itself is
          still the visual target — this button is just where the
          touch/hold gesture now happens, wired to the exact same
          handleMailboxPressIn/Out handlers as before.
          Swapped from a code-drawn circle to the user-supplied pixel-art
          wood-sign image (2026-09-10 follow-up), sized small per that
          request — the "Hold to Mark"/"Marking…" text label under it was
          dropped since the art itself now reads as the button (it's a
          wooden sign that already says "Mark"), and hitSlop pads the real
          touch target back out past the small art's own bounds so it's
          still comfortable to hold. A slight opacity dip while isHolding
          stands in for the old active-state recolor, since this is now a
          single flat image rather than a style-able shape. The pulsing
          glow halo behind it, and the matching one that used to sit on
          the mailbox itself (TerritoryMailboxHint/TerritoryPulseHalo),
          were both removed (2026-09-11, per the user's "take the
          flashing away" ask) — the wood-sign art and the mailbox's own
          position already read clearly enough without an animated
          hint. */}
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

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

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

  // Doubles the old text title's fontSize (32 -> 64), same convention as
  // the Home tab and Login screen logo swaps.
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

  gameBox: {
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  exitButton: {
    alignSelf: "flex-start",
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    width: TRACK_WIDTH,
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

  parkourTrack: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: 18,
    backgroundColor: "#CDEFB8",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#9BD97A",
  },

  parkourLaneDivider1: {
    position: "absolute",
    left: LANE_WIDTH,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
  },

  parkourLaneDivider2: {
    position: "absolute",
    left: LANE_WIDTH * 2,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
  },

  hurdleBlock: {
    position: "absolute",
    width: LANE_WIDTH - 12,
    height: HURDLE_HEIGHT,
    backgroundColor: "#B5794A",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  hurdleEmoji: {
    fontSize: 16,
  },

  barrierRow: {
    position: "absolute",
    left: 0,
    width: TRACK_WIDTH,
    height: BARRIER_HEIGHT,
    flexDirection: "row",
  },

  wallCell: {
    width: LANE_WIDTH,
    height: BARRIER_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },

  wallEmoji: {
    fontSize: 20,
  },

  barrierGap: {
    width: LANE_WIDTH,
    height: BARRIER_HEIGHT,
  },

  dogShadow: {
    position: "absolute",
    left: laneToLeft(1) + DOG_SIZE / 2 - 16,
    bottom: DOG_BOTTOM - 10,
    width: 32,
    height: 10,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.18)",
  },

  dogWrapper: {
    position: "absolute",
    left: laneToLeft(1),
    bottom: DOG_BOTTOM,
    width: DOG_SIZE,
    height: DOG_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },

  dogEmoji: {
    fontSize: 36,
  },

  instructionsText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E93",
    textAlign: "center",
  },

  // Edge-to-edge container for the full-screen porch scene — no card
  // background needed since TERR_HOUSE_IMAGE covers the whole screen.
  // `flex:1` alone is enough on native (RN always gives every screen a
  // real pixel height), but on web this View sits inside a swipeable
  // MaterialTopTabs pager, and that pager's own height doesn't reliably
  // propagate down through the flex chain in a browser the way RN's own
  // layout engine guarantees on native — when it doesn't, `flex:1` here
  // resolves to 0/auto height, and an absolutely-positioned child with no
  // definite containing-block height falls back to sizing itself off its
  // own intrinsic size instead of covering the box (this is what was
  // showing the house at its native portrait aspect ratio in a corner
  // instead of filling the screen, with the porch guy — positioned by JS
  // math keyed to whatever tiny/wrong box `onLayout` measured — stranded
  // out in the leftover space). `100vh` sidesteps all of that by tying
  // this box directly to the actual browser viewport height, independent
  // of whatever height the pager did or didn't hand it.
  territoryFullScreen: {
    flex: 1,
    width: "100%",
    backgroundColor: "#BFE6FF",
    // Clips the house image's sides when the scaled image ends up wider
    // than the box (tall/portrait viewports) — height is always locked to
    // fill the box exactly (see MarkYourTerritoryGame), so only the sides
    // ever need clipping, never the top or bottom.
    overflow: "hidden",
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : null),
  },

  // Floats over the scene instead of sitting inline above a card (there's
  // no card in full-screen mode) — top/left are overridden per-render with
  // safe-area insets so it clears the notch/status bar on every device.
  territoryExitButton: {
    position: "absolute",
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  // "+5" popup that floats above the mailbox on a safe release, fading
  // out on its own via the markFeedback timeout rather than an animation.
  territoryMarkFeedback: {
    position: "absolute",
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Anchored to `left`/`bottom` offsets (see the inline style at the call
  // site) so it sits down on the road instead of the top-of-screen spot it
  // used to occupy. Pulled over to the left edge (2026-09-08) rather than
  // centered — centered put it right on top of the dog at his on-screen
  // position. No `right`/alignItems centering needed: with only `left` set
  // the box is exactly as wide as its card content.
  territoryMeterWrap: {
    position: "absolute",
  },

  // Soft amber halo behind the card, negative-inset so it peeks out past
  // the card's own rounded corners. Opacity is driven entirely off
  // meterGlow at the call site (0 whenever not urgent), so this box is
  // visually inert — fully transparent, no perceptible cost — for nearly
  // the whole round; it only becomes visible in the last stretch before
  // completion.
  territoryMeterGlow: {
    position: "absolute",
    top: -7,
    left: -7,
    right: -7,
    bottom: -7,
    borderRadius: 18,
    backgroundColor: "#FFA500",
  },

  // Dark rounded panel behind the label + bar — added when the meter moved
  // down onto the road art, so it reads clearly against whatever happens
  // to be behind it there instead of relying on plain sky. Sized down
  // (2026-09-08) for mobile screens — this card sits off to the left at a
  // fixed size regardless of screen width, so on a phone-width viewport
  // the original size read as oversized/hard to keep track of at a glance.
  // No `alignItems: "center"` anymore (2026-09-10 redesign) — the header
  // row and track now stretch to the card's own content width instead of
  // centering, so the live percentage can sit flush to the right edge.
  // Recolored again (2026-09-10 follow-up) to match the exact palette of
  // the new pixel-art mark-button image, sampled directly from that PNG
  // rather than eyeballed: #F1D5A9 top highlight, #E4BB83 main face,
  // #C29C6E side bevel, #987656 shadow bevel, #2B1F19 outline/ink. Faked
  // 3D bevel via RN's independent border-side colors (no gradient library
  // in this project) — light top/left, dark bottom/right, like the sign's
  // own beveled edge, so the two HUD elements now read as literally the
  // same material instead of just a matching color family.
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

  // Label + live percentage side by side above the bar (2026-09-10
  // redesign — previously just the label, centered, with no readout).
  territoryMeterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },

  // Dark ink brown on the light tan card now (was white-on-dark before
  // the card itself flipped to a light wood face) with a faint light
  // shadow instead of a dark one, for a carved-into-wood look rather than
  // text floating over a photo.
  territoryMeterLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#2B1F19",
    textShadowColor: "rgba(255,255,255,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },

  territoryMeterPercent: {
    fontSize: 9,
    fontWeight: "700",
    color: "#5A3F2B",
    marginLeft: 8,
    textShadowColor: "rgba(255,255,255,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },

  // Un-clipped wrapper around the track, sized to match it exactly, so the
  // leading-edge cap (a sibling of the track, not a child) can sit right on
  // the fill boundary — including hanging slightly past either end — without
  // being cut off by the track's own `overflow: "hidden"` pill clip.
  territoryMeterTrackOuter: {
    width: 110,
    justifyContent: "center",
  },

  territoryMeterTrack: {
    width: 110,
    height: 11,
    borderRadius: 6,
    // Recessed groove look (2026-09-10 follow-up, see territoryMeterCard's
    // comment for the sampled palette) — dark ink fill with the bevel
    // flipped relative to the card around it (dark top/left, light
    // bottom/right) so the track reads as pressed IN rather than raised,
    // the way an actual carved groove in a wood sign would.
    backgroundColor: "rgba(43,31,25,0.4)",
    borderWidth: 2,
    borderColor: "#F1D5A9",
    borderTopColor: "#987656",
    borderLeftColor: "#987656",
    overflow: "hidden",
  },

  // Width is set per-render as a `${markProgress * 100}%` string rather
  // than an Animated value — ticks in fixed 100ms steps alongside the
  // markIntervalRef loop, not a smooth continuous animation, so a plain
  // state-driven width keeps the two in lockstep with no extra machinery.
  // Renamed from territoryMeterFill (2026-09-10) now that it hosts two
  // shine layers instead of one, for the two-tone glossy-pill look.
  territoryMeterFillBase: {
    height: "100%",
    borderRadius: 6,
    backgroundColor: "#F5E050",
    overflow: "hidden",
  },

  // Wider, softer top band — the bulk of the glossy-pill look, standing in
  // for a real gradient (no gradient library in this project — see the
  // house-art/porch-guy sections of the project doc for the same reasoning
  // applied to image assets).
  territoryMeterFillShineBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
  },

  // Thin brighter strip right at the fill's own top edge, layered over the
  // band above for a sharper highlight — this is the old territoryMeterFillShine,
  // renamed and kept as-is (2026-09-10) alongside the new band.
  territoryMeterFillShineLine: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.6)",
  },

  // Leading-edge "you are here" marker (2026-09-10 redesign). Fixed 14px
  // circle; `left` is set per-render as the same percentage string as the
  // fill, and the -7 top/left margins (half the circle's own size) recenter
  // it on that point — see the JSX comment at the call site for why this is
  // a margin rather than a percentage transform.
  territoryMeterCap: {
    position: "absolute",
    top: "50%",
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: -7,
    marginLeft: -7,
    // Light bevel-highlight fill + dark ink border (2026-09-10 follow-up,
    // see territoryMeterCard's comment for the sampled palette) so the
    // cap reads as a small brass/wood knob pulled from the same sign
    // material as the rest of the redesigned card.
    backgroundColor: "#F1D5A9",
    borderWidth: 2,
    borderColor: "#2B1F19",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },

  // Swapped colors once markProgress crosses TERR_METER_URGENT_THRESHOLD —
  // paired with the pulsing territoryMeterGlow behind the whole card for the
  // "almost marked" tension cue.
  territoryMeterCapUrgent: {
    backgroundColor: "#FFD400",
    borderColor: "#FF7A00",
    shadowColor: "#FF7A00",
    shadowOpacity: 0.85,
    shadowRadius: 4,
  },

  // Dedicated mark button (2026-09-10) — see the render-site comment for
  // why this exists. Wrap is just a positioning box (width pinned to
  // TERR_MARK_BUTTON_WIDTH per-render, see the call site) with its content
  // centered, so the glow halo/button stack on the same horizontal center
  // regardless of the button's own fixed size.
  territoryMarkButtonWrap: {
    position: "absolute",
    alignItems: "center",
  },

  // Now just a thin frame around the pixel-art image itself (2026-09-10
  // follow-up — was a code-drawn wood-brown circle before the user
  // supplied real art for this button). No background/border of its own
  // anymore since the image already has its own beveled wood-sign edge;
  // this only exists so PressableScale has something to apply its
  // press-squish transform to.
  territoryMarkButton: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },

  // Swapped in while isHolding — the image itself can't be recolored, so
  // a slight opacity dip stands in for the old active-state recolor, on
  // top of PressableScale's own per-tap squish feedback.
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