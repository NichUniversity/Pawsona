import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CoinIcon } from "../ui/CoinIcon";
import { PressableScale } from "../ui/PressableScale";
import { usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";

import { MinigameShell } from "./MinigameShell";
import { sharedGameStyles } from "./sharedGameStyles";

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

export function PetMinesweeperGame({ onExit }: { onExit: () => void }) {
  const { earnCoins } = usePets();
  const { accentColor, theme } = useTheme();

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
    <MinigameShell title="🦴 Sniff & Seek" onExit={onExit}>
        <Text style={[sharedGameStyles.gameSubtitle, { color: theme.text.secondary }]}>
          Tap to dig. Long-press to mark a spot you think has a skunk 🦨. Clear
          every safe square to earn <CoinIcon size={13} /> {WIN_REWARD}!
        </Text>

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
            <Text style={[sharedGameStyles.gameOverText, { color: theme.text.primary }]}>
              You found every bone! 🎉 +{WIN_REWARD} coins
            </Text>
            <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={resetGame}>
              <Text style={sharedGameStyles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </>
        )}

        {gameState === "lost" && (
          <>
            <Text style={[sharedGameStyles.gameOverText, { color: theme.text.primary }]}>
              Uh oh, a skunk got startled! Try again.
            </Text>
            <PressableScale style={[sharedGameStyles.primaryButton, { backgroundColor: accentColor }]} onPress={resetGame}>
              <Text style={sharedGameStyles.primaryButtonText}>Play Again</Text>
            </PressableScale>
          </>
        )}
    </MinigameShell>
  );
}

const styles = StyleSheet.create({
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
});
