import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, withAlpha } from "../../context/ThemeContext";

type Step = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: "paw",
    title: "Welcome to Pawsona!",
    body: "Let's get you set up in just a few quick steps.",
  },
  {
    icon: "camera-plus",
    title: "Upload Your Pet",
    body: "Head to the Home tab and tap the photo box to upload a picture of your pet and bring them to life.",
  },
  {
    icon: "gesture-swipe-horizontal",
    title: "Explore the Tabs",
    body: "Use the bar at the bottom to check out your Daily Paw Log, Mini Games, Pet Store, and Adventures.",
  },
  {
    icon: "check-circle",
    title: "You're All Set!",
    body: "Have fun getting to know your new companion.",
  },
];

type Props = {
  visible: boolean;
  onFinish: () => void;
};

// First-launch walkthrough shown once (tracked via AsyncStorage in the
// tabs layout) — a simple sequence of overlay cards, not tied to real
// component positions, so it stays lightweight and doesn't need to
// measure the actual upload box or tab bar.
export function OnboardingTutorial({ visible, onFinish }: Props) {
  const { accentColor } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);

  if (!visible) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const finish = () => {
    onFinish();
    setStepIndex(0);
  };

  const handleNext = () => {
    if (isLast) {
      finish();
    } else {
      setStepIndex((prev) => prev + 1);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconBadge, { backgroundColor: withAlpha(accentColor, 0.15) }]}>
            <MaterialCommunityIcons name={step.icon} size={30} color={accentColor} />
          </View>

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.dotsRow}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === stepIndex && { backgroundColor: accentColor, width: 18 },
                ]}
              />
            ))}
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={handleNext}
          >
            <Text style={styles.primaryButtonText}>{isLast ? "Let's Go!" : "Next"}</Text>
          </Pressable>

          {!isLast && (
            <Pressable style={styles.skipButton} onPress={finish}>
              <Text style={styles.skipButtonText}>Skip</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },

  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#1C1C1E",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,140,66,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F5F5F5",
    textAlign: "center",
    marginBottom: 10,
  },

  body: {
    fontSize: 15,
    color: "#8E8E93",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 22,
  },

  dotsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 22,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  dotActive: {
    backgroundColor: "#FF8C42",
    width: 18,
  },

  primaryButton: {
    backgroundColor: "#FF8C42",
    borderRadius: 16,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
  },

  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },

  skipButton: {
    marginTop: 14,
  },

  skipButtonText: {
    color: "#8E8E93",
    fontWeight: "600",
    fontSize: 14,
  },
});
