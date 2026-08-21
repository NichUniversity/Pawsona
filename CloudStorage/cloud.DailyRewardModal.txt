import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { DAILY_REWARD_SCHEDULE } from "../../context/PetInformation";
import { useTheme, withAlpha } from "../../context/ThemeContext";
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

// Once-a-day "come back and claim your coins" popup shown from the Home tab.
export function DailyRewardModal({
  visible,
  streakDay,
  reward,
  onClaim,
  onClose,
}: Props) {
  const { theme, accentColor } = useTheme();

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
          style={[
            styles.card,
            { backgroundColor: theme.card.background, borderColor: theme.card.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: withAlpha(accentColor, 0.15) },
            ]}
          >
            <MaterialCommunityIcons name="fire" size={30} color={accentColor} />
          </View>

          <Text style={[styles.title, { color: theme.text.primary }]}>
            Day {streakDay} Streak!
          </Text>
          <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
            Come back every day to keep it going
          </Text>

          <View style={styles.rewardRow}>
            <CoinIcon size={22} />
            <Text style={[styles.rewardText, { color: accentColor }]}>
              +{reward}
            </Text>
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
                    {
                      backgroundColor: isToday
                        ? accentColor
                        : withAlpha(theme.text.primary, isPast ? 0.18 : 0.08),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scheduleDayLabel,
                      { color: isToday ? "#fff" : theme.text.secondary },
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>

          <PressableScale
            style={[styles.claimButton, { backgroundColor: accentColor }]}
            onPress={onClaim}
          >
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
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
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
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 18,
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
  },

  scheduleDayLabel: {
    fontSize: 12,
    fontWeight: "800",
  },

  claimButton: {
    width: "100%",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },

  claimButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
