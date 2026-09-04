import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
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
const TERR_HOUSE_IMG_WIDTH = 1086;
const TERR_HOUSE_IMG_HEIGHT = 1316;

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
    // Replaced (2026-09-04) with a new standalone illustration — same
    // character, an "Elmore Daily" newspaper held up covering his face,
    // seated cross-legged in a rocking chair with a curved-topper back.
    // Not part of the earlier 5-pose reference sheet (that attempt was
    // tried and fully reverted the same day — see the project doc).
    // Cropped tight to 943x1271 (aspect 0.7419); topmost visible chair
    // wood sits ~20.1% down from the top of frame, close to the old
    // (pre-session) stage-1 art's 18.3% — should read closer in size to
    // stage 2 (8.0%)/stage 3 (11.2%) at the shared render height than
    // the previous newspaper-held-fully-up attempt (~0.5%) did.
    source: require("../../assets/images/territory-porch-guy.png"),
    aspect: 943 / 1271,
  },
  {
    // Replaced (2026-09-04) with a new standalone illustration matching
    // the new stage-1 art's lineage exactly — same character, same
    // rocking chair (curved-topper back), same art style — just with
    // the newspaper lowered enough to reveal his eyes/eyebrows (annoyed
    // glare) over the top. Unlike the old stage-2 art this replaces,
    // this one's chair is the SAME chair as the new stage 1, so the
    // stage-1-to-stage-2 chair-mismatch problem that motivated the
    // (reverted) chair-transplant attempt earlier this session shouldn't
    // apply here — see the project doc for that history. Cropped tight
    // to 945x1142 (aspect 0.8275); topmost visible chair wood (the
    // topper knob beside his head — a forehead-wrinkle detail briefly
    // false-positived as "wood" during measurement and had to be
    // excluded) sits ~9.6% down from the top of frame, close to the old
    // stage 2's 8.0% and to the new stage 1's ~20.1% in the same
    // direction (increasing from stage 1 to stage 2, as expected).
    source: require("../../assets/images/territory-porch-guy-stage-2.png"),
    aspect: 945 / 1142,
  },
  {
    // Replaced (2026-09-04) with a new standalone illustration, same
    // lineage as the new stage 1/2 art (same character, same rocking
    // chair) — newspaper lowered further than stage 2, showing his full
    // face (eyes, brow, mustache) in an annoyed glare. Cropped tight to
    // 944x1137 (aspect 0.8303); topmost visible chair wood (the topper
    // knob beside his head) sits ~13.2% down from the top of frame,
    // in the same ballpark as the new stage 1 (~20.1%) and stage 2
    // (~9.6%) — all comfortably closer to old stages 2/3's 8.0%/11.2%
    // than the once-reverted stage-1 attempt's ~0.5% was.
    source: require("../../assets/images/territory-porch-guy-stage-3.png"),
    aspect: 944 / 1137,
  },
  {
    // Replaced (2026-09-04) with a new standalone illustration, same
    // lineage as the new stage 1/2/3 art (same character, same rocking
    // chair) — newspaper lowered further still, showing his full face
    // plus more of the shirt/suspenders below. Cropped tight to
    // 945x1127 (aspect 0.8385); topmost visible chair wood (the topper
    // knob beside his head) sits ~14.6% down from the top of frame,
    // in the same ballpark as the new stages 1/2/3 (~20.1%/9.6%/13.2%).
    source: require("../../assets/images/territory-porch-guy-stage-4.png"),
    aspect: 945 / 1127,
  },
  {
    // Replaced (2026-09-04) with a new standalone illustration, same
    // lineage as the new stage 1/2/3/4 art (same character, same
    // rocking chair). Visually very close to the new stage-4 art (same
    // full-face pose/expression) — the user confirmed wiring it in
    // as-is despite the similarity. Cropped tight to 945x1101 (aspect
    // 0.8583); topmost visible chair wood (the topper knob beside his
    // head) sits ~12.6% down from the top of frame, in the same
    // ballpark as the new stages 1-4 (~20.1%/9.6%/13.2%/14.6%).
    source: require("../../assets/images/territory-porch-guy-stage-5.png"),
    aspect: 945 / 1101,
  },
];

// Separate from the attentiveness sequence above — this is the "caught you
// peeing" reaction (red-faced, furious, staring straight out), shown
// (2026-09-03) when MarkYourTerritoryGame's stage loop reaches the last
// entry in TERR_PORCH_GUY_STAGES while the player is still holding the
// mailbox. Swapped in directly via `isCaught` rather than through
// neighborStage/the stages array — it's a distinct busted state, not
// another notch in the oblivious-to-attentive progression.
const TERR_PORCH_GUY_CAUGHT = {
  source: require("../../assets/images/territory-porch-guy-caught.png"),
  aspect: 988 / 1350,
};
// Re-measured (2026-09-04) against the new house art: the porch deck's
// tan/gray surface reads cleanly from source y~787 down to y~804 before
// giving way to grass, and the open stretch of blue wall clear of the
// door, front window, and both support posts sits roughly x~765-845 —
// so the chair is centered a bit left of that post to keep clearance.
const TERR_PORCH_GUY_SRC_CENTER_X = 780;
const TERR_PORCH_GUY_SRC_FLOOR_Y = 800;
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
// preserve the same lift-to-height proportion on the new art.
const TERR_PORCH_GUY_LIFT = 37;

// Mailbox hold-target, measured the same way as the porch-guy anchors
// above (fixed pixel coordinates in TERR_HOUSE_IMAGE's own 1086x1316
// space, found by color-thresholding the mailbox's box against the
// grass/sky around it) — so the touch target and the pee stream's
// endpoint stay locked to the mailbox regardless of screen size.
// Re-measured (2026-09-04) for the new house art: the mailbox box's post
// sits at source x~552, and its blue box reads from y~807 (roof edge)
// down to y~913 (where it gives way to the white post beneath).
const TERR_MAILBOX_SRC_CENTER_X = 552;
const TERR_MAILBOX_SRC_TOP_Y = 807;
const TERR_MAILBOX_SRC_BOTTOM_Y = 913;

// Where the dog character stands — the paved road at the very bottom of
// TERR_HOUSE_IMAGE (measured by color-sampling the curb/asphalt line).
// Same fixed-source-pixel anchor pattern as the porch guy/mailbox
// anchors above. Horizontally the dog rests directly under the mailbox
// (TERR_MAILBOX_SRC_CENTER_X), so the pee stream — already anchored to
// that same x — reads as coming from him.
// Re-measured (2026-09-04) for the new house art: the sidewalk gives way
// to the road at source y~1195-1200, so 1255 sits comfortably inside the
// road band below that, matching the old image's ~60px curb clearance.
const TERR_DOG_SRC_Y = 1255;
// Emoji glyphs don't have their own aspect/anchor data like the PNG
// stages, so this is just a chosen on-screen size in the same
// source-pixel scale as everything else, tuned to look proportionate
// next to the mailbox rather than measured from art. Original value (110)
// was tuned against the old mailbox's 92px-tall box; scaled up to 127 to
// match the new mailbox's ~106px-tall box at the same proportion.
const TERR_DOG_SRC_HEIGHT = 127;
const TERR_DOG_EMOJI = "🐕";
const TERR_DOG_ENTRANCE_MS = 1200;
const TERR_DOG_HOP_MS = 150;
const TERR_DOG_LEG_LIFT_MS = 160;

// How often the neighbor's attentiveness advances a stage, in ms — a
// random value in this range is rolled after every tick so the rhythm
// isn't perfectly predictable, but never so fast/slow it feels unfair.
// Slowed down overall per feedback: the floor is kept the same (still
// occasionally snappy/near-instant, especially right after a long wait —
// that contrast is the "slowly or instantly, randomly" feel that was
// asked for) but the ceiling was raised a lot, roughly tripling the
// average wait between stage changes (was ~2000ms, now ~4200ms) and
// widening the spread so the rhythm reads as genuinely unpredictable
// rather than a narrow, easy-to-learn band. Keeping the floor unchanged
// also keeps the fairness invariant on TERR_MARK_FILL_MS below intact
// with no other numbers needing to move: the guaranteed-worst-case
// time-to-bust (4 stage advances all rolling the minimum) is still
// 4 x TERR_STAGE_MIN_INTERVAL_MS = 5600ms, unchanged from before.
const TERR_STAGE_MIN_INTERVAL_MS = 1400;
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
// holds add up exactly like one long one. Kept below the *minimum*
// possible time-to-bust (4 stage advances x TERR_STAGE_MIN_INTERVAL_MS =
// 5600ms) so a player who holds continuously from a fresh round can
// always finish in time on an unlucky-fast roll; slower rolls just add
// margin. Ticks every TERR_MARK_TICK_MS while held.
const TERR_MARK_FILL_MS = 5000;
const TERR_MARK_TICK_MS = 100;

// One-time bonus for fully filling the meter (completing the round)
// instead of just banking per-release marks — bigger than TERR_MARK_REWARD
// since it's the round's actual win condition, same idea as Minesweeper's
// WIN_REWARD vs. its smaller incidental rewards.
const TERR_COMPLETE_REWARD = 20;

// A gentle pulsing ring around the mailbox while nothing else is going
// on, purely so the touch target reads as tappable at a glance. Mounted
// only while idle (not holding, not caught) — starts/stops with the
// component's own lifecycle rather than an internal isHolding check.
function TerritoryMailboxHint({ x, midY }: { x: number; midY: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x - 26,
        top: midY - 26,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: "#FFFFFF",
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.3] }),
        transform: [
          { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
        ],
      }}
    />
  );
}

// Simple placeholder "pee" stream — a thin translucent line from the
// player's implied position at the bottom of the scene up to the
// mailbox, plus a few small droplets rising along it on a staggered
// loop. Mounted only while actively holding, so its animations start
// fresh each time rather than needing an internal enabled/disabled gate.
function TerritoryPeeStream({
  x,
  bottomY,
  topY,
}: {
  x: number;
  bottomY: number;
  topY: number;
}) {
  const drop1 = useRef(new Animated.Value(0)).current;
  const drop2 = useRef(new Animated.Value(0)).current;
  const drop3 = useRef(new Animated.Value(0)).current;
  const trunkPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeDropLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const anims = [
      makeDropLoop(drop1, 0),
      makeDropLoop(drop2, 200),
      makeDropLoop(drop3, 400),
      Animated.loop(
        Animated.sequence([
          Animated.timing(trunkPulse, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(trunkPulse, { toValue: 0, duration: 350, useNativeDriver: true }),
        ])
      ),
    ];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dropStyle = (val: Animated.Value, xOffset: number) => ({
    position: "absolute" as const,
    top: 0,
    left: x + xOffset - 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F5E050",
    opacity: val.interpolate({
      inputRange: [0, 0.15, 0.85, 1],
      outputRange: [0, 1, 1, 0],
    }),
    transform: [
      {
        translateY: val.interpolate({ inputRange: [0, 1], outputRange: [bottomY, topY] }),
      },
    ],
  });

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: x - 2,
          top: topY,
          width: 4,
          height: Math.max(bottomY - topY, 0),
          borderRadius: 2,
          backgroundColor: "#F5E050",
          opacity: trunkPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.55] }),
        }}
      />
      <Animated.View pointerEvents="none" style={dropStyle(drop1, -6)} />
      <Animated.View pointerEvents="none" style={dropStyle(drop2, 0)} />
      <Animated.View pointerEvents="none" style={dropStyle(drop3, 6)} />
    </>
  );
}

// The dog itself — an emoji character (no new image asset) that hops in
// from off-screen left along the road once on mount, settles at its
// resting spot under the mailbox, and lifts a leg (a rotate+lift proxy —
// an emoji glyph can't swap poses like the drawn porch-guy stages can)
// whenever the player is holding the mailbox.
function TerritoryDog({
  x,
  y,
  size,
  isHolding,
}: {
  x: number;
  y: number;
  size: number;
  isHolding: boolean;
}) {
  // 0 -> 1 once, on mount: carries the entrance slide from off-screen left
  // to the resting spot. Never replayed after that — he's already there
  // for the rest of the round, whatever happens with holding/busts.
  const entrance = useRef(new Animated.Value(0)).current;
  // Small up/down bob, looped only while the entrance slide is playing —
  // makes the approach read as a hop/trot rather than a flat slide across
  // the screen. Stopped and zeroed once he arrives.
  const hop = useRef(new Animated.Value(0)).current;
  // 0 = standing normally, 1 = leg-lifted "marking" pose.
  const legLift = useRef(new Animated.Value(0)).current;

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
    return () => hopLoop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(legLift, {
      toValue: isHolding ? 1 : 0,
      duration: TERR_DOG_LEG_LIFT_MS,
      useNativeDriver: true,
    }).start();
  }, [isHolding, legLift]);

  // How far left (in screen px) the entrance has to start from to
  // guarantee he's actually off-screen, not just off *his resting spot* —
  // a fixed offset (the original -180) wasn't enough on a wide/letterboxed
  // layout, where the mailbox (and so his resting x) can sit hundreds of
  // px in from the real left edge. Derived from his own rest position (x)
  // and size rather than the container width: starting at -(x + size)
  // always places his right edge at x - size/2 - size, i.e. a full extra
  // half-size past the screen's x=0 with margin to spare, regardless of
  // how wide the container actually is.
  const entranceStartX = -(x + size);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size,
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        transform: [
          // World-space move across the screen for the entrance — listed
          // before the local flip/rotate below so it isn't affected by
          // them (transform functions compose local-to-world in reverse
          // list order, same as CSS): he always enters from the left
          // regardless of which way he's facing.
          { translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [entranceStartX, 0] }) },
          { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          // The raw glyph faces left; flipped so he faces right, toward
          // the mailbox he's walking up to and, later, marking.
          { scaleX: -1 },
          { rotate: legLift.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-16deg"] }) },
        ],
      }}
    >
      <Text style={{ fontSize: size, lineHeight: size }}>{TERR_DOG_EMOJI}</Text>
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

  const showMarkFeedback = (text: string) => {
    setMarkFeedback(text);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setMarkFeedback(null), 900);
  };

  const handleMailboxPressIn = () => {
    if (isCaughtRef.current || isCompleteRef.current) return;
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

  // Scale is always locked to the container's HEIGHT (never the width).
  // That guarantees the full scene — roofline all the way down to the
  // street — is always in frame, on every device: a plain resizeMode
  // "cover" fill (scale = max(width ratio, height ratio)) crops whichever
  // axis is "extra" once the other is filled, and on a wide/landscape
  // window that's the height — the roof and the street both get cut off,
  // leaving a tight, zoomed-in crop of just the porch. Locking to height
  // means the box's WIDTH is what adjusts instead: on a tall phone
  // viewport the scaled image ends up wider than the box and the sides
  // get cropped (same look as before there — phones were already
  // height-bound under plain cover); on a wide desktop window the scaled
  // image ends up narrower than the box and the leftover width is
  // letterboxed (centered, with the container's own background color
  // showing on each side) instead of ever cropping the top or bottom.
  const scale = layout ? layout.height / TERR_HOUSE_IMG_HEIGHT : 0;
  const scaledHouseWidth = TERR_HOUSE_IMG_WIDTH * scale;
  // Positive = letterboxed (image narrower than box, padded left/right).
  // Negative = cropped (image wider than box, overflow clipped left/right
  // by territoryFullScreen's own overflow:"hidden").
  const houseOffsetX = layout ? (layout.width - scaledHouseWidth) / 2 : 0;

  const guyHeight = TERR_PORCH_GUY_SRC_HEIGHT * scale;
  const guyWidth = guyHeight * currentNeighborStage.aspect;
  const guyLeft = TERR_PORCH_GUY_SRC_CENTER_X * scale + houseOffsetX - guyWidth / 2;
  // No vertical offset needed — the house image's top always sits flush
  // with the container's top (height is matched exactly), so the source
  // floor-line anchor maps straight through the scale factor.
  const guyBottom = (TERR_PORCH_GUY_SRC_FLOOR_Y - TERR_PORCH_GUY_LIFT) * scale;
  const guyTop = guyBottom - guyHeight;

  // Mailbox on-screen position, from the fixed source-pixel anchors above
  // — same scale/offset math as the porch guy, so it stays locked to the
  // mailbox art regardless of screen size.
  const mailboxCenterX = TERR_MAILBOX_SRC_CENTER_X * scale + houseOffsetX;
  const mailboxTopY = TERR_MAILBOX_SRC_TOP_Y * scale;
  const mailboxBottomY = TERR_MAILBOX_SRC_BOTTOM_Y * scale;
  const mailboxMidY = (mailboxTopY + mailboxBottomY) / 2;

  // Dog's on-screen position — same x column as the mailbox (see the
  // constant's comment above), standing on the road below it. Size is
  // clamped so he doesn't shrink to nothing on a very short/letterboxed
  // layout.
  const dogY = TERR_DOG_SRC_Y * scale;
  const dogSize = Math.max(46, TERR_DOG_SRC_HEIGHT * scale);

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
              locked to the container, width following the source aspect
              ratio) and offset by houseOffsetX, rather than filling the
              container and letting resizeMode do the fit/crop — React
              Native Web's Image, given StyleSheet.absoluteFillObject or
              any style without explicit width/height, falls back to the
              source asset's own natural pixel size instead of filling its
              parent (confirmed live via DOM inspection), so explicit
              numeric dimensions are what's needed on web regardless. Since
              width/height here already match the source aspect exactly,
              resizeMode has no extra fitting left to do. */}
          <Image
            source={TERR_HOUSE_IMAGE}
            style={{
              position: "absolute",
              top: 0,
              left: houseOffsetX,
              width: scaledHouseWidth,
              height: layout.height,
            }}
            resizeMode="cover"
          />
          <Image
            source={currentNeighborStage.source}
            style={{ position: "absolute", left: guyLeft, top: guyTop, width: guyWidth, height: guyHeight }}
            resizeMode="stretch"
          />

          <TerritoryDog x={mailboxCenterX} y={dogY} size={dogSize} isHolding={isHolding && !isCaught} />

          {isHolding && !isCaught && !isComplete && (
            <TerritoryPeeStream x={mailboxCenterX} bottomY={dogY} topY={mailboxMidY} />
          )}
          {!isHolding && !isCaught && !isComplete && (
            <TerritoryMailboxHint x={mailboxCenterX} midY={mailboxMidY} />
          )}

          {/* Fixed on-screen hit size (not scaled from the source pixels)
              so the mailbox stays comfortably tappable even when the
              scene itself renders small. */}
          <Pressable
            onPressIn={handleMailboxPressIn}
            onPressOut={handleMailboxPressOut}
            disabled={isCaught || isComplete}
            style={{
              position: "absolute",
              left: mailboxCenterX - 32,
              top: mailboxMidY - 55,
              width: 64,
              height: 110,
            }}
          />

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
          either way, since neither overlay below needs it showing through. */}
      {!isCaught && !isComplete && (
        <View pointerEvents="none" style={[styles.territoryMeterWrap, { top: insets.top + 12 }]}>
          <Text style={styles.territoryMeterLabel}>Marking progress</Text>
          <View style={styles.territoryMeterTrack}>
            <View style={[styles.territoryMeterFill, { width: `${markProgress * 100}%` }]} />
          </View>
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

  // Centered top-of-screen meter showing markProgress. left/right: 0 +
  // alignItems: "center" centers it regardless of the bar's own fixed
  // width, without needing to know the screen width up front.
  territoryMeterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },

  territoryMeterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  territoryMeterTrack: {
    width: 180,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    overflow: "hidden",
  },

  // Width is set per-render as a `${markProgress * 100}%` string rather
  // than an Animated value — ticks in fixed 100ms steps alongside the
  // markIntervalRef loop, not a smooth continuous animation, so a plain
  // state-driven width keeps the two in lockstep with no extra machinery.
  territoryMeterFill: {
    height: "100%",
    borderRadius: 7,
    backgroundColor: "#F5E050",
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