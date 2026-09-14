import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CoinIcon } from "../ui/CoinIcon";
import { PressableScale } from "../ui/PressableScale";
import { usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";

import { MinigameShell } from "./MinigameShell";
import { sharedGameStyles } from "./sharedGameStyles";

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

export function SimonSaysGame({ onExit }: { onExit: () => void }) {
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
    <MinigameShell title="🐾 Paw Pattern" onExit={handleExit}>

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
          style={sharedGameStyles.gameFullScreenPlayWrap}
          onLayout={(e) => {
            const width = Math.round(e.nativeEvent.layout.width);
            const height = Math.round(e.nativeEvent.layout.height);
            setPlayAreaSize((prev) =>
              prev.width === width && prev.height === height ? prev : { width, height }
            );
          }}
        >
          {gameState === "idle" ? (
            <View style={sharedGameStyles.gameFullScreenIdleContent}>
              <Text style={[sharedGameStyles.gameSubtitle, { color: theme.text.secondary }]}>
                Watch the pattern, then repeat it back. Every round earns{" "}
                <CoinIcon size={13} /> {COINS_PER_ROUND}!
              </Text>
              <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={startGame}>
                <Text style={sharedGameStyles.primaryButtonText}>Start Game</Text>
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
            <Text style={[sharedGameStyles.gameOverText, { color: theme.text.primary }]}>
              You made it to round {round}! 🎉
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
  roundText: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },

  roundSubtext: {
    fontSize: 13,
    fontWeight: "600",
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
});
