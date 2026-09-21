import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { GOLD, PARCHMENT, WOOD_DARK, WOOD_MID } from "../../constants/backyard-theme";
import { DAILY_REWARD_SCHEDULE } from "../../context/PetInformation";
import { CoinIcon } from "./CoinIcon";
import { PressableScale } from "./PressableScale";

type Props = {
  visible: boolean;
  /** The streak day claiming right now will land on (e.g. 3 for "Day 3"). */
  streakDay: number;
  /** Coins that streak day awards. */
  reward: number;
  onClaim: () => void;
  onClose: () => void;
};

// Deeper brass than GOLD, for the big reward number so it still reads on the parchment card.
const BRASS_DARK = "#A9701A";

// Once-a-day "come back and claim your coins" popup shown from the Home tab. Styled as a
// parchment notice in a wooden frame to match the Home tab's backyard signs (see
// constants/backyard-theme.ts) rather than a theme-colored card.
export function DailyRewardModal({
  visible,
  streakDay,
  reward,
  onClaim,
  onClose,
}: Props) {
  // Slot in the repeating reward schedule to highlight in the strip below.
  const cycleDay = ((streakDay - 1) % DAILY_REWARD_SCHEDULE.length) + 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.iconBadge}>
            <MaterialCommunityIcons name="fire" size={30} color={GOLD} />
          </View>

          <Text style={styles.title}>Day {streakDay} Streak!</Text>
          <Text style={styles.subtitle}>Come back every day to keep it going</Text>

          <View style={styles.rewardRow}>
            <CoinIcon size={22} />
            <Text style={styles.rewardText}>+{reward}</Text>
          </View>

          <View style={styles.scheduleRow}>
            {DAILY_REWARD_SCHEDULE.map((amount, i) => {
              const day = i + 1;
              const isToday = day === cycleDay;
              const isPast = day < cycleDay;
              return (
                <View
                  key={day}
                  style={[
                    styles.scheduleDay,
                    isPast && styles.scheduleDayPast,
                    isToday && styles.scheduleDayToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.scheduleDayLabel,
                      isPast && { color: PARCHMENT },
                      isToday && { color: WOOD_DARK },
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>

          <PressableScale style={styles.claimButton} onPress={onClaim}>
            <Text style={styles.claimButtonText}>Claim +{reward} coins</Text>
          </PressableScale>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 10, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: PARCHMENT,
    borderRadius: 22,
    borderWidth: 5,
    borderColor: WOOD_MID,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
  },

  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    backgroundColor: WOOD_MID,
    borderWidth: 3,
    borderColor: GOLD,
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
    color: WOOD_DARK,
  },

  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 18,
    color: WOOD_MID,
  },

  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 18,
  },

  rewardText: {
    fontSize: 28,
    fontWeight: "800",
    color: BRASS_DARK,
  },

  scheduleRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 22,
  },

  scheduleDay: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(107, 74, 40, 0.12)",
    borderWidth: 2,
    borderColor: "transparent",
  },

  scheduleDayPast: {
    backgroundColor: "rgba(107, 74, 40, 0.5)",
  },

  scheduleDayToday: {
    backgroundColor: GOLD,
    borderColor: WOOD_DARK,
  },

  scheduleDayLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: WOOD_MID,
  },

  claimButton: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: GOLD,
    borderWidth: 3,
    borderColor: WOOD_DARK,
  },

  claimButtonText: {
    color: WOOD_DARK,
    fontSize: 15,
    fontWeight: "800",
  },
});
