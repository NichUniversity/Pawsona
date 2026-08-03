import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PetEntry, usePets } from "../../context/PetInformation";
import { ADVENTURES } from "../../data/adventure";

type AreaName = keyof typeof ADVENTURES;

const AREAS: { name: AreaName; emoji: string; price: number }[] = [
  { name: "Magical Forest", emoji: "🌲", price: 0 },
  { name: "Frostpaw Tundra", emoji: "❄️", price: 40 },
  { name: "Crystal Caverns", emoji: "💎", price: 60 },
  { name: "Bone Desert", emoji: "🦴", price: 80 },
];

export default function Adventure() {
  const router = useRouter();
  const { pets, coins, unlockedAreas, unlockArea, unlockStorybook } =
    usePets();

  const [selectedPet, setSelectedPet] = useState<PetEntry | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaName | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);

  const currentStory =
    selectedArea && currentNodeId
      ? ADVENTURES[selectedArea].nodes[currentNodeId]
      : null;

  const chooseArea = (areaName: AreaName) => {
    setSelectedArea(areaName);
    setCurrentNodeId(ADVENTURES[areaName].start);
  };

  const handleAreaPress = (areaName: AreaName, price: number) => {
    const isUnlocked = unlockedAreas.includes(areaName);

    if (isUnlocked) {
      chooseArea(areaName);
      return;
    }

    const success = unlockArea(areaName, price);
    if (success) {
      chooseArea(areaName);
    }
  };

  const handleChoice = (nextId: string) => {
    if (!selectedArea) return;

    setCurrentNodeId(nextId);

    const nextNode = ADVENTURES[selectedArea].nodes[nextId];
    if (nextNode?.givesBook) {
      unlockStorybook();
    }
  };

  // Resets adventure state and returns to the pet/area picker within this tab.
  const resetAdventureState = () => {
    setSelectedArea(null);
    setCurrentNodeId(null);
  };

  // Fully leaves the Adventure flow and jumps back to the Home tab.
  const endAdventure = () => {
    setSelectedPet(null);
    resetAdventureState();
    router.push("/");
  };

  const changePet = () => {
    setSelectedPet(null);
    resetAdventureState();
  };

  const showEndAdventureButton = selectedPet !== null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🐾 Adventure</Text>

      <View style={styles.coinBadge}>
        <Text style={styles.coinText}>🪙 {coins}</Text>
      </View>

      {showEndAdventureButton && (
        <Pressable style={styles.endAdventureButton} onPress={endAdventure}>
          <Text style={styles.endAdventureText}>← End Adventure</Text>
        </Pressable>
      )}

      {!selectedPet && (
        <>
          <Text style={styles.header}>Choose your adventurer</Text>

          {pets
            .filter((pet) => pet.confirmed)
            .map((pet) => (
              <Pressable
                key={pet.id}
                style={styles.card}
                onPress={() => setSelectedPet(pet)}
              >
                <Text style={styles.avatar}>{pet.selectedEmoji}</Text>

                <Text style={styles.name}>{pet.name || "Unnamed Pet"}</Text>
              </Pressable>
            ))}
        </>
      )}

      {selectedPet && !selectedArea && (
        <>
          <Text style={styles.header}>
            Where should {selectedPet.name} explore?
          </Text>

          {AREAS.map((area) => {
            const isUnlocked = unlockedAreas.includes(area.name);
            const canAfford = coins >= area.price;

            return (
              <Pressable
                key={area.name}
                style={[styles.card, !isUnlocked && styles.cardLocked]}
                onPress={() => handleAreaPress(area.name, area.price)}
                disabled={!isUnlocked && !canAfford}
              >
                <Text style={styles.avatar}>
                  {isUnlocked ? area.emoji : "🔒"}
                </Text>

                <View style={styles.areaTextWrap}>
                  <Text style={styles.name}>{area.name}</Text>

                  {!isUnlocked && (
                    <Text
                      style={[
                        styles.priceTag,
                        !canAfford && styles.priceTagDisabled,
                      ]}
                    >
                      {canAfford
                        ? `Unlock for 🪙 ${area.price}`
                        : `Need 🪙 ${area.price}`}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}

          <Pressable style={styles.changePetButton} onPress={changePet}>
            <Text style={styles.changePetText}>Change Adventurer</Text>
          </Pressable>
        </>
      )}

      {currentStory && !currentStory.isEnding && (
        <View style={styles.storyBox}>
          <Text style={styles.storyText}>{currentStory.story}</Text>

          {currentStory.choices.map((choice) => (
            <Pressable
              key={choice.text}
              style={styles.choiceButton}
              onPress={() => handleChoice(choice.next)}
            >
              <Text style={styles.choiceText}>{choice.text}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {currentStory && currentStory.isEnding && currentStory.givesBook && (
        <View style={styles.bookBox}>
          <Text style={styles.bookEmoji}>🧙📖</Text>
          <Text style={styles.storyText}>{currentStory.story}</Text>

          <View style={styles.bookBanner}>
            <Text style={styles.bookBannerText}>
              Storybook unlocked! You can now use the AI Pet Coach on the
              Daily Paw Log tab.
            </Text>
          </View>

          <Pressable style={styles.finishButton} onPress={resetAdventureState}>
            <Text style={styles.finishButtonText}>Explore More</Text>
          </Pressable>
        </View>
      )}

      {currentStory && currentStory.isEnding && !currentStory.givesBook && (
        <View style={styles.storyBox}>
          <Text style={styles.storyText}>{currentStory.story}</Text>

          <Pressable style={styles.finishButton} onPress={resetAdventureState}>
            <Text style={styles.finishButtonText}>Explore More</Text>
          </Pressable>
        </View>
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
    marginBottom: 16,
  },

  coinText: {
    color: "#FF8C42",
    fontWeight: "800",
    fontSize: 16,
  },

  endAdventureButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 20,
  },

  endAdventureText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  header: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  cardLocked: {
    backgroundColor: "rgba(255,255,255,0.55)",
  },

  avatar: {
    fontSize: 40,
    marginRight: 20,
  },

  areaTextWrap: {
    flexShrink: 1,
  },

  name: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },

  priceTag: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#FF8C42",
  },

  priceTagDisabled: {
    color: "#999",
  },

  changePetButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 4,
  },

  changePetText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },

  storyBox: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },

  storyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 20,
  },

  choiceButton: {
    backgroundColor: "#FF8C42",
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
  },

  choiceText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  bookBox: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },

  bookEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },

  bookBanner: {
    backgroundColor: "#FFE3CC",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },

  bookBannerText: {
    color: "#FF8C42",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },

  finishButton: {
    backgroundColor: "#FF8C42",
    borderRadius: 15,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },

  finishButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});