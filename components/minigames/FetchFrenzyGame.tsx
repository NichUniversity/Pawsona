import { useEffect, useRef, useState } from "react";
import { Animated, Image, PanResponder, StyleSheet, Text, View } from "react-native";

import { CoinIcon } from "../ui/CoinIcon";
import { PressableScale } from "../ui/PressableScale";
import { usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";

import { MinigameShell } from "./MinigameShell";
import { sharedGameStyles } from "./sharedGameStyles";

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

export function FetchFrenzyGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();

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
    <MinigameShell title="🎾 Fetch Frenzy" onExit={onExit}>

        {gameState !== "idle" && (
          <>
            <View style={[sharedGameStyles.scoreRow, { width: layout.width }]}>
              <Text style={[sharedGameStyles.scoreText, { color: theme.text.primary }]}>🎾 {score}</Text>
              <Text style={[sharedGameStyles.bestScoreText, { color: theme.text.secondary }]}>Best {Math.max(best, score)}</Text>
            </View>

            {/* Plain placeholder health bar — restyle to match the sprite sheet's art once it's provided, same way the marking meter (TerritoryMeterScribbleTrack) later got its own hand-drawn treatment. */}
            <View style={[styles.ffHealthTrack, { width: layout.width }]}>
              <View style={[styles.ffHealthFill, { width: `${(health / FF_MAX_HEALTH) * 100}%` }]} />
            </View>
          </>
        )}

        <View
          style={sharedGameStyles.gameFullScreenPlayWrap}
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
            <View style={sharedGameStyles.gameFullScreenIdleContent}>
              <Text style={[sharedGameStyles.gameSubtitle, { color: theme.text.secondary }]}>
                Slide your dog side to side to catch tennis balls 🎾 and bones 🦴
                as they fall — dodge the rocks 🪨, they cost you health! Fill your
                score with catches to earn <CoinIcon size={13} /> coins.
              </Text>
              <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
                <Text style={sharedGameStyles.primaryButtonText}>Start Game</Text>
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
          <Text style={[sharedGameStyles.instructionsText, { color: theme.text.secondary }]}>
            Slide to catch · Dodge the rocks
          </Text>
        )}

        {gameState === "gameover" && (
          <>
            <Text style={[sharedGameStyles.gameOverText, { color: theme.text.primary }]}>
              {health <= 0 ? "Out of health! " : ""}You caught {score}! 🎉{" "}
              {lastCoins > 0 ? `+${lastCoins} coins` : "Catch a few more next time!"}
            </Text>
            <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
              <Text style={sharedGameStyles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </>
        )}
    </MinigameShell>
  );
}

const styles = StyleSheet.create({
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

  ffItemEmoji: {
    position: "absolute",
    fontSize: FF_ITEM_SIZE_BASE,
    width: FF_ITEM_SIZE_BASE,
    height: FF_ITEM_SIZE_BASE,
    textAlign: "center",
    lineHeight: FF_ITEM_SIZE_BASE,
  },

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
});
