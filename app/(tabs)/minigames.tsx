import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { CoinIcon } from "../../components/ui/CoinIcon";
import { PressableScale } from "../../components/ui/PressableScale";
import { TabBackground } from "../../components/ui/TabBackground";
import { PetEntry, usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";
import { COSMETICS } from "../../data/cosmetics";
import { useTabBarClearance } from "../../hooks/useTabBarClearance";

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
    description: "Sneak a pee before the neighbor spots you!",
  },
];

export default function Minigames() {
  const { coins } = usePets();
  const { accentColor, theme } = useTheme();
  const [activeGame, setActiveGame] = useState<GameId | "menu">("menu");
  const tabBarClearance = useTabBarClearance();

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

      {activeGame === "territory" && (
        <MarkYourTerritoryGame onExit={() => setActiveGame("menu")} />
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
/* Mark Your Territory (hold-to-mark house-to-house minigame)          */
/*                                                                      */
/* Walk the block, marking one yard fixture per house (mailbox or fire */
/* hydrant) by holding down on it. A neighbor cycles between "safe"    */
/* (not looking), "tell" (a peek warning — window glows, 👀 fades in)  */
/* and "danger" (actively looking) on a randomized, house-scaled       */
/* timer. Holding through safe fills the Marked meter; still holding   */
/* when danger hits gets the dog busted and ends the run. Release      */
/* during the tell window, wait danger out, then resume.               */
/* ------------------------------------------------------------------ */

type TerritoryTarget = "mailbox" | "hydrant";
type NeighborPhase = "safe" | "tell" | "danger";

const TERR_TRACK_WIDTH = TRACK_WIDTH; // reuse Pup Parkour's card width
const TERR_TRACK_HEIGHT = 320;
const TERR_HOUSE_WIDTH = 170;
const TERR_HOUSE_HEIGHT = 120;
const TERR_WINDOW_WIDTH = 80;
const TERR_WINDOW_HEIGHT = 54;

const TERR_METER_MAX = 100;
const TERR_FILL_PER_SEC = 42; // ~2.4s of continuous holding to fill from empty

const TERR_SAFE_MIN_BASE = 1500;
const TERR_SAFE_MAX_BASE = 2600;
const TERR_SAFE_MIN_FLOOR = 550;
const TERR_SAFE_MAX_FLOOR = 950;
const TERR_SAFE_RAMP_PER_HOUSE = 90;

const TERR_TELL_MS_BASE = 600;
const TERR_TELL_MS_FLOOR = 260;
const TERR_TELL_RAMP_PER_HOUSE = 22;

const TERR_DANGER_MS = 700;

const TERR_COINS_PER_HOUSE = 8;
const TERR_BUSTED_FLASH_MS = 700;

const TERR_HOUSE_COLORS = ["#E8C99B", "#CFE3D6", "#DCCBEA", "#F2CFC9"];

function territorySafeWindow(houseIndex: number) {
  const shrink = Math.min(
    houseIndex * TERR_SAFE_RAMP_PER_HOUSE,
    TERR_SAFE_MIN_BASE - TERR_SAFE_MIN_FLOOR
  );
  const min = Math.max(TERR_SAFE_MIN_FLOOR, TERR_SAFE_MIN_BASE - shrink);
  const max = Math.max(TERR_SAFE_MAX_FLOOR, TERR_SAFE_MAX_BASE - shrink);
  return min + Math.random() * (max - min);
}

function territoryTellWindow(houseIndex: number) {
  return Math.max(
    TERR_TELL_MS_FLOOR,
    TERR_TELL_MS_BASE - houseIndex * TERR_TELL_RAMP_PER_HOUSE
  );
}

function pickTerritoryTarget(prev: TerritoryTarget | null): TerritoryTarget {
  const next: TerritoryTarget = Math.random() < 0.5 ? "mailbox" : "hydrant";
  if (next === prev && Math.random() < 0.6) {
    return next === "mailbox" ? "hydrant" : "mailbox";
  }
  return next;
}

function MarkYourTerritoryGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();

  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">(
    "idle"
  );
  const [houseIndex, setHouseIndex] = useState(0);
  const [housesMarked, setHousesMarked] = useState(0);
  const [best, setBest] = useState(0);
  const [target, setTarget] = useState<TerritoryTarget>("mailbox");
  const [meter, setMeter] = useState(0);
  const [neighborPhase, setNeighborPhase] = useState<NeighborPhase>("safe");
  const [isHolding, setIsHolding] = useState(false);
  const [busted, setBusted] = useState(false);
  const [lastCoins, setLastCoins] = useState(0);

  const gameStateRef = useRef(gameState);
  const houseIndexRef = useRef(0);
  const housesMarkedRef = useRef(0);
  const targetRef = useRef<TerritoryTarget>("mailbox");
  const meterRef = useRef(0);
  const neighborPhaseRef = useRef<NeighborPhase>("safe");
  const neighborTimerRef = useRef(0);
  const safeDurationRef = useRef(territorySafeWindow(0));
  const tellDurationRef = useRef(territoryTellWindow(0));
  const isHoldingRef = useRef(false);
  const bustedRef = useRef(false);
  const runCoinsRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bustedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const holdScale = useRef(new Animated.Value(1)).current;
  const holdLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const setIsHoldingSynced = (val: boolean) => {
    setIsHolding(val);
    isHoldingRef.current = val;
  };

  const startHold = () => {
    if (gameStateRef.current !== "playing" || bustedRef.current) return;
    setIsHoldingSynced(true);
  };

  const stopHold = () => {
    setIsHoldingSynced(false);
  };

  // Little "straining" pulse on the dog/target while actively holding —
  // purely cosmetic feedback that the hold is registering.
  useEffect(() => {
    if (isHolding && gameState === "playing") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(holdScale, {
            toValue: 1.08,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(holdScale, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ])
      );
      holdLoopRef.current = loop;
      loop.start();
      return () => {
        loop.stop();
        holdLoopRef.current = null;
      };
    }
    holdScale.setValue(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHolding, gameState]);

  const endGame = () => {
    gameStateRef.current = "gameover";
    setGameState("gameover");
    setBest((prev) => Math.max(prev, housesMarkedRef.current));
    setLastCoins(runCoinsRef.current);
    bustedRef.current = false;
    setBusted(false);
  };

  const triggerCaught = () => {
    bustedRef.current = true;
    setBusted(true);
    setIsHoldingSynced(false);
    bustedTimeoutRef.current = setTimeout(endGame, TERR_BUSTED_FLASH_MS);
  };

  const advanceHouse = () => {
    earnCoins(TERR_COINS_PER_HOUSE);
    runCoinsRef.current += TERR_COINS_PER_HOUSE;

    housesMarkedRef.current += 1;
    setHousesMarked(housesMarkedRef.current);

    houseIndexRef.current += 1;
    setHouseIndex(houseIndexRef.current);

    meterRef.current = 0;
    setMeter(0);

    targetRef.current = pickTerritoryTarget(targetRef.current);
    setTarget(targetRef.current);

    neighborPhaseRef.current = "safe";
    setNeighborPhase("safe");
    neighborTimerRef.current = 0;
    safeDurationRef.current = territorySafeWindow(houseIndexRef.current);
    tellDurationRef.current = territoryTellWindow(houseIndexRef.current);
  };

  const tick = () => {
    if (bustedRef.current) return;

    const dt = TICK_MS / 1000;
    neighborTimerRef.current += TICK_MS;

    if (neighborPhaseRef.current === "safe") {
      if (neighborTimerRef.current >= safeDurationRef.current) {
        neighborPhaseRef.current = "tell";
        neighborTimerRef.current = 0;
        setNeighborPhase("tell");
      }
    } else if (neighborPhaseRef.current === "tell") {
      if (neighborTimerRef.current >= tellDurationRef.current) {
        neighborPhaseRef.current = "danger";
        neighborTimerRef.current = 0;
        setNeighborPhase("danger");
        if (isHoldingRef.current) {
          triggerCaught();
          return;
        }
      }
    } else if (neighborPhaseRef.current === "danger") {
      if (isHoldingRef.current) {
        triggerCaught();
        return;
      }
      if (neighborTimerRef.current >= TERR_DANGER_MS) {
        neighborPhaseRef.current = "safe";
        neighborTimerRef.current = 0;
        safeDurationRef.current = territorySafeWindow(houseIndexRef.current);
        setNeighborPhase("safe");
      }
    }

    if (isHoldingRef.current) {
      meterRef.current = Math.min(
        TERR_METER_MAX,
        meterRef.current + TERR_FILL_PER_SEC * dt
      );
      setMeter(meterRef.current);
      if (meterRef.current >= TERR_METER_MAX) {
        advanceHouse();
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
    intervalRef.current = setInterval(tick, TICK_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  useEffect(() => {
    return () => {
      if (bustedTimeoutRef.current) clearTimeout(bustedTimeoutRef.current);
    };
  }, []);

  const startGame = () => {
    if (bustedTimeoutRef.current) clearTimeout(bustedTimeoutRef.current);

    houseIndexRef.current = 0;
    setHouseIndex(0);
    housesMarkedRef.current = 0;
    setHousesMarked(0);
    runCoinsRef.current = 0;

    targetRef.current = pickTerritoryTarget(null);
    setTarget(targetRef.current);

    meterRef.current = 0;
    setMeter(0);

    neighborPhaseRef.current = "safe";
    setNeighborPhase("safe");
    neighborTimerRef.current = 0;
    safeDurationRef.current = territorySafeWindow(0);
    tellDurationRef.current = territoryTellWindow(0);

    bustedRef.current = false;
    setBusted(false);
    setIsHoldingSynced(false);
    holdScale.setValue(1);

    setGameState("playing");
    gameStateRef.current = "playing";
  };

  const houseColor = TERR_HOUSE_COLORS[houseIndex % TERR_HOUSE_COLORS.length];
  const meterPct = Math.round((meter / TERR_METER_MAX) * 100);
  const eyeOpacity =
    neighborPhase === "danger" ? 1 : neighborPhase === "tell" ? 0.55 : 0;
  const windowColor =
    neighborPhase === "danger"
      ? "#7A2E2E"
      : neighborPhase === "tell"
      ? "#6B5B3A"
      : "#3A3A3C";

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

      <Text style={[styles.gameTitle, { color: theme.text.primary }]}>🚩 Mark Your Territory</Text>

      {gameState === "idle" && (
        <>
          <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
            Hold down on the mailbox or hydrant to mark it. Watch the
            window — when the neighbor peeks, let go! Get caught mid-mark
            and the walk ends. Every house marked earns{" "}
            <CoinIcon size={13} /> {TERR_COINS_PER_HOUSE}.
          </Text>
          <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
            <Text style={styles.primaryButtonText}>Start Walk</Text>
          </PressableScale>
        </>
      )}

      {gameState !== "idle" && (
        <>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreText, { color: theme.text.primary }]}>🏠 {housesMarked}</Text>
            <Text style={[styles.bestScoreText, { color: theme.text.secondary }]}>Best {Math.max(best, housesMarked)}</Text>
          </View>

          <View style={styles.territoryScene}>
            <View style={styles.territorySky} />
            <View style={styles.territoryGround} />

            <View style={[styles.territoryHouse, { backgroundColor: houseColor }]}>
              <View style={styles.territoryRoof} />
              <View style={[styles.territoryWindow, { backgroundColor: windowColor }]}>
                <Text style={[styles.territoryEyes, { opacity: eyeOpacity }]}>👀</Text>
              </View>
            </View>

            <View style={styles.territoryYard}>
              <PressableScale
                scaleTo={0.97}
                style={styles.territoryTargetWrapper}
                onPressIn={startHold}
                onPressOut={stopHold}
                disabled={gameState !== "playing" || busted}
              >
                <Animated.View style={{ transform: [{ scale: holdScale }] }}>
                  {target === "mailbox" ? (
                    <View style={styles.territoryMailbox}>
                      <Text style={styles.territoryMailboxEmoji}>📫</Text>
                      <View style={styles.territoryMailboxPost} />
                    </View>
                  ) : (
                    <View style={styles.territoryHydrant}>
                      <View style={styles.territoryHydrantCap} />
                      <View style={styles.territoryHydrantBody}>
                        <View style={[styles.territoryHydrantBolt, styles.territoryHydrantBoltLeft]} />
                        <View style={[styles.territoryHydrantBolt, styles.territoryHydrantBoltRight]} />
                      </View>
                      <View style={styles.territoryHydrantBase} />
                    </View>
                  )}
                </Animated.View>

                {isHolding && <Text style={styles.territoryDrip}>💦</Text>}
              </PressableScale>

              <Text style={styles.territoryDogEmoji}>🐕</Text>
            </View>

            {busted && (
              <View style={styles.territoryBustedOverlay}>
                <Text style={styles.territoryBustedText}>🚨 BUSTED! 🚨</Text>
              </View>
            )}
          </View>

          <Text style={[styles.territoryMeterLabel, { color: theme.text.secondary }]}>
            Marked {meterPct}%
          </Text>
          <View style={styles.territoryMeterTrack}>
            <View
              style={[
                styles.territoryMeterFill,
                { width: `${meterPct}%`, backgroundColor: accentColor },
              ]}
            />
          </View>

          {gameState === "playing" && (
            <Text style={[styles.instructionsText, { color: theme.text.secondary }]}>
              Hold to mark · Let go when he looks!
            </Text>
          )}

          {gameState === "gameover" && (
            <>
              <Text style={[styles.gameOverText, { color: theme.text.primary }]}>
                Busted after {housesMarked} house{housesMarked === 1 ? "" : "s"}! 🚨{" "}
                {lastCoins > 0 ? `+${lastCoins} coins` : "Try to mark at least one next time!"}
              </Text>
              <PressableScale style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
                <Text style={styles.primaryButtonText}>Walk Again</Text>
              </PressableScale>
            </>
          )}
        </>
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

  territoryScene: {
    width: TERR_TRACK_WIDTH,
    height: TERR_TRACK_HEIGHT,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#6FA84F",
    backgroundColor: "#BFE6FF",
  },

  territorySky: {
    position: "absolute",
    left: 0,
    top: 0,
    width: TERR_TRACK_WIDTH,
    height: 120,
    backgroundColor: "#BFE6FF",
  },

  territoryGround: {
    position: "absolute",
    left: 0,
    top: 120,
    width: TERR_TRACK_WIDTH,
    height: TERR_TRACK_HEIGHT - 120,
    backgroundColor: "#8FCB6B",
  },

  territoryHouse: {
    position: "absolute",
    left: (TERR_TRACK_WIDTH - TERR_HOUSE_WIDTH) / 2,
    top: 26,
    width: TERR_HOUSE_WIDTH,
    height: TERR_HOUSE_HEIGHT,
    borderRadius: 10,
    alignItems: "center",
  },

  territoryRoof: {
    position: "absolute",
    top: -16,
    left: -6,
    width: TERR_HOUSE_WIDTH + 12,
    height: 24,
    backgroundColor: "#6B4A32",
    borderRadius: 6,
  },

  territoryWindow: {
    position: "absolute",
    top: 34,
    left: (TERR_HOUSE_WIDTH - TERR_WINDOW_WIDTH) / 2,
    width: TERR_WINDOW_WIDTH,
    height: TERR_WINDOW_HEIGHT,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.25)",
  },

  territoryEyes: {
    fontSize: 26,
  },

  territoryYard: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: "center",
  },

  territoryTargetWrapper: {
    width: 70,
    height: 92,
    alignItems: "center",
    justifyContent: "flex-end",
  },

  territoryMailbox: {
    alignItems: "center",
  },

  territoryMailboxEmoji: {
    fontSize: 34,
  },

  territoryMailboxPost: {
    width: 6,
    height: 26,
    backgroundColor: "#8B5E34",
    borderRadius: 2,
    marginTop: -4,
  },

  territoryHydrant: {
    alignItems: "center",
  },

  territoryHydrantCap: {
    width: 20,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D64545",
  },

  territoryHydrantBody: {
    width: 24,
    height: 32,
    borderRadius: 7,
    backgroundColor: "#E14B4B",
    marginTop: -2,
    alignItems: "center",
    justifyContent: "center",
  },

  territoryHydrantBolt: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#B23636",
    top: 10,
  },

  territoryHydrantBoltLeft: {
    left: -4,
  },

  territoryHydrantBoltRight: {
    right: -4,
  },

  territoryHydrantBase: {
    width: 28,
    height: 7,
    borderRadius: 3,
    backgroundColor: "#B23636",
    marginTop: -2,
  },

  territoryDrip: {
    position: "absolute",
    bottom: -2,
    fontSize: 16,
  },

  territoryDogEmoji: {
    fontSize: 32,
    marginTop: 6,
  },

  territoryBustedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(122,20,20,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  territoryBustedText: {
    fontSize: 20,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
  },

  territoryMeterLabel: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
  },

  territoryMeterTrack: {
    width: TERR_TRACK_WIDTH,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(0,0,0,0.12)",
    overflow: "hidden",
    marginTop: 6,
  },

  territoryMeterFill: {
    height: 14,
    borderRadius: 7,
  },
});