import { StyleSheet } from "react-native";

// Style keys shared by two or more of the split-out minigame files: the exit-button
// text style used by both MinigameShell and Mark Your Territory's own custom exit
// button, plus the small set of idle-screen / game-over / scoreboard styles that
// Paw Pattern, Sniff & Seek, Fetch Frenzy, and Tight Squeeze all share.
export const sharedGameStyles = StyleSheet.create({
  exitButtonText: {
    fontWeight: "700",
    fontSize: 13,
  },

  gameSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
  },

  primaryButton: {
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

  gameOverText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F5F5F5",
    textAlign: "center",
    marginTop: 18,
  },

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

  // width is set inline at both usage sites ([styles.scoreRow, { width: layout.width }]
  // in Fetch Frenzy and Tight Squeeze), so no static width is defined here.
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  scoreText: {
    fontSize: 16,
    fontWeight: "800",
  },

  bestScoreText: {
    fontSize: 13,
    fontWeight: "700",
    alignSelf: "flex-end",
  },

  instructionsText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
