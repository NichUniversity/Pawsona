import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CoinIcon } from "../../components/ui/CoinIcon";
import { PressableScale } from "../../components/ui/PressableScale";
import { ScrollingLayer } from "../../components/ui/ScrollingLayer";
import { TabBackground } from "../../components/ui/TabBackground";
import { usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";
import { useTabBarClearance } from "../../hooks/useTabBarClearance";

type GameId = "simon" | "minesweeper" | "parkour" | "parkourFP";

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
    id: "parkourFP",
    name: "Dog's-Eye Dash",
    emoji: "👀",
    available: true,
    description: "Same run, pup's POV!",
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
      <Text style={[styles.title, { color: theme.text.primary }]}>Mini Games</Text>

      <View style={styles.coinBadge}>
        <CoinIcon size={16} />
        <Text style={[styles.coinText, { color: accentColor }]}> {coins}</Text>
      </View>

      {activeGame === "menu" && (
        <View style={styles.grid}>
          {GAMES.map((game) => (
            <PressableScale
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
              <Text style={[styles.gameDescription, { color: theme.text.secondary }]}>{game.description}</Text>
            </PressableScale>
          ))}
        </View>
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

      {activeGame === "parkourFP" && (
        <PupParkourFPGame onExit={() => setActiveGame("menu")} />
      )}
      </ScrollView>
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
/* Dog's-Eye Dash (first-person version of Pup Parkour)                */
/*                                                                      */
/* Same hurdle/wall lane logic as Pup Parkour, but rendered as a road  */
/* receding toward a vanishing point instead of top-down. Obstacles    */
/* carry a "p" progress value (0 = just spawned at the horizon, 1 =    */
/* reaches the camera) and get projected to a screen x/y/scale each    */
/* frame — classic cheap fake-3D-road trick, no 3D/canvas lib needed.  */
/* ------------------------------------------------------------------ */

const FP_TRACK_WIDTH = 280;
const FP_TRACK_HEIGHT = 300;
const FP_HORIZON_Y = 46;
const FP_COLLISION_Y = FP_TRACK_HEIGHT - 30;
const FP_VANISH_X = FP_TRACK_WIDTH / 2;
const FP_LANE_WIDTH = FP_TRACK_WIDTH / LANE_COUNT;

const FP_MIN_SCALE = 0.12;
const FP_MAX_SCALE = 1.05;
const FP_EASE_POWER = 2.1;
const FP_COLLISION_P = 0.92;

const FP_BASE_RATE = 0.5; // progress / second (0 -> 1 is one full approach)
const FP_MAX_RATE = 1.15;
const FP_RATE_RAMP_PER_POINT = 0.003;
const FP_SCORE_PER_PROGRESS = 30;

// Parallax scenery layers — aspect ratio matches the generated PNGs
// (far_treeline.png is 512x110, near_bushes.png is 384x74).
const FP_FAR_LAYER_HEIGHT = Math.round(FP_TRACK_WIDTH * (110 / 512));
const FP_NEAR_LAYER_HEIGHT = Math.round(FP_TRACK_WIDTH * (74 / 384));

type FPObstacle = {
  id: number;
  type: "hurdle" | "barrier";
  lane: number;
  safeLane: number;
  p: number;
  scored: boolean;
};

function spawnFPObstacle(id: number): FPObstacle {
  const isBarrier = Math.random() < 0.35;
  if (isBarrier) {
    const safeLane = Math.floor(Math.random() * LANE_COUNT);
    return { id, type: "barrier", lane: -1, safeLane, p: 0, scored: false };
  }
  const lane = Math.floor(Math.random() * LANE_COUNT);
  return { id, type: "hurdle", lane, safeLane: -1, p: 0, scored: false };
}

function fpProject(lane: number, p: number) {
  const ease = Math.min(1, p) ** FP_EASE_POWER;
  const nearX = lane * FP_LANE_WIDTH + FP_LANE_WIDTH / 2;
  const x = FP_VANISH_X + (nearX - FP_VANISH_X) * ease;
  const y = FP_HORIZON_Y + (FP_COLLISION_Y - FP_HORIZON_Y) * ease;
  const scale = FP_MIN_SCALE + (FP_MAX_SCALE - FP_MIN_SCALE) * ease;
  const opacity = 0.22 + 0.78 * ease;
  return { x, y, scale, opacity };
}

// Positions an absolutely-placed line between two points by rotating around
// its own left edge (the standard RN "line between two points" trick).
function lineBetween(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
  color: string
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    position: "absolute" as const,
    left: x1,
    top: y1 - thickness / 2,
    width: length,
    height: thickness,
    backgroundColor: color,
    transform: [
      { translateX: length / 2 },
      { rotate: `${angleDeg}deg` },
      { translateX: -length / 2 },
    ],
  };
}

function PupParkourFPGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();

  const [gameState, setGameState] = useState<"idle" | "playing" | "gameover">(
    "idle"
  );
  const [obstacles, setObstacles] = useState<FPObstacle[]>([]);
  const [dogLane, setDogLane] = useState(1);
  const [isJumping, setIsJumping] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lastCoins, setLastCoins] = useState(0);

  const gameStateRef = useRef(gameState);
  const dogLaneRef = useRef(dogLane);
  const isJumpingRef = useRef(isJumping);
  const scoreRef = useRef(0);
  const scoreFloatRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const nextIdRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bobLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const pawsTranslateX = useRef(new Animated.Value(0)).current;
  const pawsTranslateY = useRef(new Animated.Value(0)).current;
  const bobAnim = useRef(new Animated.Value(0)).current;

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
    Animated.spring(pawsTranslateX, {
      toValue: (clamped - 1) * 20,
      useNativeDriver: true,
      friction: 6,
      tension: 80,
    }).start();
  };

  const jump = () => {
    if (gameStateRef.current !== "playing" || isJumpingRef.current) return;
    setIsJumpingSynced(true);
    Animated.sequence([
      Animated.timing(pawsTranslateY, {
        toValue: -24,
        duration: JUMP_DURATION * 0.42,
        useNativeDriver: true,
      }),
      Animated.timing(pawsTranslateY, {
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
    const rate = Math.min(
      FP_MAX_RATE,
      FP_BASE_RATE + scoreRef.current * FP_RATE_RAMP_PER_POINT
    );

    scoreFloatRef.current += rate * dt * FP_SCORE_PER_PROGRESS;
    scoreRef.current = Math.floor(scoreFloatRef.current);
    setScore(scoreRef.current);

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
      const moved = prev.map((o) => ({ ...o, p: o.p + rate * dt }));

      for (const o of moved) {
        if (o.scored) continue;
        if (o.p >= FP_COLLISION_P) {
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

      const next = moved.filter((o) => o.p < 1.2);

      if (shouldSpawn) {
        next.push(spawnFPObstacle(nextIdRef.current++));
      }

      if (hit) {
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
      if (bobLoopRef.current) {
        bobLoopRef.current.stop();
        bobLoopRef.current = null;
      }
      bobAnim.setValue(0);
      return;
    }

    intervalRef.current = setInterval(tick, TICK_MS);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ])
    );
    bobLoopRef.current = loop;
    loop.start();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      loop.stop();
      bobLoopRef.current = null;
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
    pawsTranslateX.setValue(0);
    pawsTranslateY.setValue(0);
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

  const laneBoundary1X = FP_LANE_WIDTH;
  const laneBoundary2X = FP_LANE_WIDTH * 2;

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

      <Text style={[styles.gameTitle, { color: theme.text.primary }]}>👀 Dog&apos;s-Eye Dash</Text>

      {gameState === "idle" && (
        <>
          <Text style={[styles.gameSubtitle, { color: theme.text.secondary }]}>
            Same course as Pup Parkour, seen through your pup&apos;s eyes! Tap to
            hop over logs 🪵, swipe to duck through wall gaps 🧱.{" "}
            <CoinIcon size={13} /> 1 per {COINS_PER_DISTANCE} distance.
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

          <View style={styles.fpScene} {...panResponder.panHandlers}>
            <Animated.View
              style={[
                styles.fpWorld,
                {
                  transform: [
                    {
                      translateY: bobAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -4],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.fpSky}>
                <Text style={styles.fpSun}>☀️</Text>
              </View>
              <View style={styles.fpGround} />
              <View style={styles.fpFogFar} />
              <View style={styles.fpFogNear} />
              <View style={styles.fpHorizonLine} />

              <View style={styles.fpFarLayer}>
                <ScrollingLayer
                  source={require("../../assets/backgrounds/far_treeline.png")}
                  width={FP_TRACK_WIDTH}
                  height={FP_FAR_LAYER_HEIGHT}
                  speed={18}
                  running={gameState === "playing"}
                />
              </View>

              <View style={styles.fpNearLayer}>
                <ScrollingLayer
                  source={require("../../assets/backgrounds/near_bushes.png")}
                  width={FP_TRACK_WIDTH}
                  height={FP_NEAR_LAYER_HEIGHT}
                  speed={52}
                  running={gameState === "playing"}
                />
              </View>

              <View
                style={lineBetween(
                  FP_VANISH_X,
                  FP_HORIZON_Y,
                  0,
                  FP_TRACK_HEIGHT,
                  2,
                  "rgba(255,255,255,0.55)"
                )}
              />
              <View
                style={lineBetween(
                  FP_VANISH_X,
                  FP_HORIZON_Y,
                  laneBoundary1X,
                  FP_TRACK_HEIGHT,
                  2,
                  "rgba(255,255,255,0.4)"
                )}
              />
              <View
                style={lineBetween(
                  FP_VANISH_X,
                  FP_HORIZON_Y,
                  laneBoundary2X,
                  FP_TRACK_HEIGHT,
                  2,
                  "rgba(255,255,255,0.4)"
                )}
              />
              <View
                style={lineBetween(
                  FP_VANISH_X,
                  FP_HORIZON_Y,
                  FP_TRACK_WIDTH,
                  FP_TRACK_HEIGHT,
                  2,
                  "rgba(255,255,255,0.55)"
                )}
              />

              {obstacles.map((o) => {
                if (o.type === "hurdle") {
                  const { x, y, scale, opacity } = fpProject(o.lane, o.p);
                  const w = 60;
                  const h = 34;
                  return (
                    <View
                      key={o.id}
                      style={[
                        styles.fpHurdle,
                        {
                          left: x - w / 2,
                          top: y - h / 2,
                          width: w,
                          height: h,
                          opacity,
                          transform: [{ scale }],
                        },
                      ]}
                    >
                      <Text style={styles.hurdleEmoji}>🪵</Text>
                    </View>
                  );
                }

                return (
                  <React.Fragment key={o.id}>
                    {Array.from({ length: LANE_COUNT }).map((_, laneIdx) => {
                      const { x, y, scale, opacity } = fpProject(laneIdx, o.p);
                      const isGap = laneIdx === o.safeLane;
                      const w = FP_LANE_WIDTH - 8;
                      const h = 44;
                      return (
                        <View
                          key={laneIdx}
                          style={[
                            isGap ? styles.fpGapMarker : styles.fpWallCell,
                            {
                              left: x - w / 2,
                              top: y - h / 2,
                              width: w,
                              height: h,
                              opacity: isGap ? opacity * 0.5 : opacity,
                              transform: [{ scale }],
                            },
                          ]}
                        >
                          {!isGap && <Text style={styles.wallEmoji}>🧱</Text>}
                        </View>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </Animated.View>
          </View>

          <View style={styles.fpPawsStrip}>
            <Animated.Text
              style={[
                styles.fpPawsEmoji,
                {
                  transform: [
                    { translateX: pawsTranslateX },
                    { translateY: pawsTranslateY },
                  ],
                },
              ]}
            >
              🐾  🐾
            </Animated.Text>
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

  title: {
    fontFamily: "Fredoka_700Bold",
    fontSize: 32,
    color: "#fff",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.15)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
    textAlign: "center",
    marginBottom: 16,
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

  fpScene: {
    width: FP_TRACK_WIDTH,
    height: FP_TRACK_HEIGHT,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#6FA84F",
    backgroundColor: "#BFE6FF",
  },

  fpWorld: {
    width: FP_TRACK_WIDTH,
    height: FP_TRACK_HEIGHT,
  },

  fpSky: {
    position: "absolute",
    left: 0,
    top: 0,
    width: FP_TRACK_WIDTH,
    height: FP_HORIZON_Y,
    backgroundColor: "#BFE6FF",
  },

  fpSun: {
    position: "absolute",
    right: 14,
    top: 8,
    fontSize: 18,
  },

  fpGround: {
    position: "absolute",
    left: 0,
    top: FP_HORIZON_Y,
    width: FP_TRACK_WIDTH,
    height: FP_TRACK_HEIGHT - FP_HORIZON_Y,
    backgroundColor: "#8FCB6B",
  },

  fpFogFar: {
    position: "absolute",
    left: 0,
    top: FP_HORIZON_Y,
    width: FP_TRACK_WIDTH,
    height: 90,
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  fpFogNear: {
    position: "absolute",
    left: 0,
    top: FP_HORIZON_Y,
    width: FP_TRACK_WIDTH,
    height: 44,
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  fpHorizonLine: {
    position: "absolute",
    left: 0,
    top: FP_HORIZON_Y - 1,
    width: FP_TRACK_WIDTH,
    height: 2,
    backgroundColor: "#5C9A45",
  },

  fpFarLayer: {
    position: "absolute",
    left: 0,
    top: FP_HORIZON_Y - FP_FAR_LAYER_HEIGHT * 0.6,
  },

  fpNearLayer: {
    position: "absolute",
    left: 0,
    top: FP_HORIZON_Y + 30,
  },

  fpHurdle: {
    position: "absolute",
    backgroundColor: "#B5794A",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  fpWallCell: {
    position: "absolute",
    backgroundColor: "rgba(160,90,60,0.92)",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },

  fpGapMarker: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 4,
  },

  fpPawsStrip: {
    width: FP_TRACK_WIDTH,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },

  fpPawsEmoji: {
    fontSize: 26,
  },
});