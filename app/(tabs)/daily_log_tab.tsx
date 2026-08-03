import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AvatarDisplay } from "../../components/ui/AvatarDisplay";
import { PetEntry, usePets } from "../../context/PetInformation";

type Activity = {
  name: string;
  emoji: string;
  attribute:
    | "speed"
    | "intelligence"
    | "mischief"
    | "strength"
    | "energy";
};

const ACTIVITIES: Activity[] = [
  {
    name: "Walk",
    emoji: "🚶",
    attribute: "speed",
  },
  {
    name: "Training",
    emoji: "🧠",
    attribute: "intelligence",
  },
  {
    name: "Play Time",
    emoji: "🎾",
    attribute: "energy",
  },
  {
    name: "Tug of War",
    emoji: "🪢",
    attribute: "strength",
  },
  {
    name: "Chew Toy",
    emoji: "🦴",
    attribute: "mischief",
  },
];

const VALID_ATTRIBUTES: Activity["attribute"][] = [
  "speed",
  "intelligence",
  "mischief",
  "strength",
  "energy",
];

// Set this to your deployed server's URL for native (iOS/Android) builds,
// e.g. via an EXPO_PUBLIC_API_BASE_URL env var. It can stay empty for web-only
// testing, where a relative path works fine.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

export default function DailyPawLog() {
  const { pets, setPets, coins, earnCoins, hasStorybook } = usePets();

  const [selectedPet, setSelectedPet] = useState<PetEntry | null>(null);

  const [logText, setLogText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleActivity = (activity: Activity) => {
    if (!selectedPet) return;

    setPets((currentPets) =>
      currentPets.map((pet) => {
        if (pet.id !== selectedPet.id) return pet;

        return {
          ...pet,
          ratings: {
            ...pet.ratings,
            [activity.attribute]: Math.min(
              pet.ratings[activity.attribute] + 1,
              5
            ),
          },
          logs: [
            ...pet.logs,
            {
              id: Date.now().toString(),
              event: activity.name,
              date: new Date().toLocaleDateString(),
            },
          ],
        };
      })
    );

    earnCoins(5);

    console.log(
      `${selectedPet.name} gained +1 ${activity.attribute} and 5 coins`
    );
  };

  const handleAiSubmit = async () => {
    if (!selectedPet || !logText.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    setAiError(null);

    const trimmedLog = logText.trim();

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petName: selectedPet.name || "your pet",
          logText: trimmedLog,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      const changes: Partial<Record<Activity["attribute"], number>> =
        data.attributeChanges ?? {};

      let totalIncrease = 0;

      setPets((currentPets) =>
        currentPets.map((pet) => {
          if (pet.id !== selectedPet.id) return pet;

          const newRatings = { ...pet.ratings };

          VALID_ATTRIBUTES.forEach((key) => {
            const delta = changes[key] ?? 0;
            if (delta > 0) {
              newRatings[key] = Math.min(newRatings[key] + delta, 5);
              totalIncrease += delta;
            }
          });

          return {
            ...pet,
            ratings: newRatings,
            logs: [
              ...pet.logs,
              {
                id: Date.now().toString(),
                event: trimmedLog,
                date: new Date().toLocaleDateString(),
              },
            ],
          };
        })
      );

      if (totalIncrease > 0) {
        earnCoins(totalIncrease * 5);
      }

      setAiFeedback(
        typeof data.summary === "string" ? data.summary : "Great job today!"
      );
      setLogText("");
    } catch (err) {
      console.error("AI log analysis failed:", err);
      setAiError("Couldn't reach the pet coach right now. Try again in a bit.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const changePet = (pet: PetEntry | null) => {
    setSelectedPet(pet);
    setLogText("");
    setAiFeedback(null);
    setAiError(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Daily Paw Log 🐾</Text>

      <View style={styles.coinBadge}>
        <Text style={styles.coinText}>🪙 {coins}</Text>
      </View>

      {!selectedPet ? (
        <>
          <Text style={styles.header}>Choose your pet</Text>

          {pets
            .filter((pet) => pet.confirmed)
            .map((pet) => (
              <Pressable
                key={pet.id}
                style={styles.petCard}
                onPress={() => changePet(pet)}
              >
                <View style={{ marginRight: 20 }}>
                  <AvatarDisplay
                    category={pet.category}
                    emoji={pet.selectedEmoji}
                    color={pet.color}
                    size={35}
                  />
                </View>

                <Text style={styles.petName}>
                  {pet.name || "Unnamed Pet"}
                </Text>
              </Pressable>
            ))}
        </>
      ) : (
        <>
          <Text style={styles.header}>
            What did {selectedPet.name} do today?
          </Text>

          <Pressable
            style={styles.changePet}
            onPress={() => changePet(null)}
          >
            <Text>Change Pet</Text>
          </Pressable>

          {ACTIVITIES.map((activity) => (
            <Pressable
              key={activity.name}
              style={styles.activity}
              onPress={() => handleActivity(activity)}
            >
              <Text style={styles.petEmoji}>{activity.emoji}</Text>

              <View>
                <Text style={styles.activityName}>{activity.name}</Text>

                <Text style={styles.attribute}>
                  +1 {activity.attribute}
                </Text>
              </View>
            </Pressable>
          ))}

          <View style={styles.aiSection}>
            {hasStorybook ? (
              <>
                <Text style={styles.aiSectionTitle}>
                  Or tell the Pet Coach about your day 💬
                </Text>

                <TextInput
                  style={styles.aiInput}
                  placeholder={`e.g. "We walked to the park and played fetch"`}
                  placeholderTextColor="#aaa"
                  multiline
                  value={logText}
                  onChangeText={setLogText}
                  editable={!isAnalyzing}
                />

                <Pressable
                  style={[
                    styles.aiSubmitButton,
                    (!logText.trim() || isAnalyzing) &&
                      styles.aiSubmitButtonDisabled,
                  ]}
                  onPress={handleAiSubmit}
                  disabled={!logText.trim() || isAnalyzing}
                >
                  {isAnalyzing ? (
                    <ActivityIndicator color="#FF8C42" />
                  ) : (
                    <Text style={styles.aiSubmitButtonText}>
                      Ask the Pet Coach
                    </Text>
                  )}
                </Pressable>

                {aiError && <Text style={styles.aiError}>{aiError}</Text>}

                {aiFeedback && (
                  <View style={styles.aiBubble}>
                    <Text style={styles.aiBubbleEmoji}>🐾</Text>
                    <Text style={styles.aiBubbleText}>{aiFeedback}</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.aiLockedState}>
                <Text style={styles.aiLockedEmoji}>🔒</Text>
                <Text style={styles.aiLockedTitle}>
                  Pet Coach is locked
                </Text>
                <Text style={styles.aiLockedSubtitle}>
                  Complete the Magical Forest adventure to earn the
                  Storybook of Bonds and unlock your Pet Coach.
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#FF8C42",
    padding: 20,
    paddingTop: 80,
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
  },

  coinBadge: {
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

  header: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
  },

  petCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  petEmoji: {
    fontSize: 35,
    marginRight: 20,
  },

  petName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },

  activity: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  activityName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },

  attribute: {
    color: "#FF8C42",
    fontWeight: "700",
  },

  changePet: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 20,
  },

  aiSection: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    padding: 18,
  },

  aiSectionTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 12,
  },

  aiInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    color: "#333",
    textAlignVertical: "top",
    marginBottom: 12,
  },

  aiSubmitButton: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  aiSubmitButtonDisabled: {
    opacity: 0.6,
  },

  aiSubmitButtonText: {
    color: "#FF8C42",
    fontWeight: "700",
    fontSize: 15,
  },

  aiError: {
    color: "#fff",
    fontWeight: "600",
    marginTop: 10,
  },

  aiBubble: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  aiBubbleEmoji: {
    fontSize: 20,
  },

  aiBubbleText: {
    flex: 1,
    color: "#333",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },

  aiLockedState: {
    alignItems: "center",
    paddingVertical: 10,
  },

  aiLockedEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },

  aiLockedTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 6,
  },

  aiLockedSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 19,
  },
});