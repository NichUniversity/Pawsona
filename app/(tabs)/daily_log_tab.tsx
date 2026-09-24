import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import OriginStoryWizard from "../../components/OriginStoryWizard";
import { AVATAR_BACKDROP_COLOR, findAvatarOption } from "../../components/ui/AvatarDisplay";
import { CoinIcon } from "../../components/ui/CoinIcon";
import { NotebookPetPicker } from "../../components/ui/NotebookPetPicker";
import { PressableScale } from "../../components/ui/PressableScale";
import { IdleSprite } from "../../components/ui/IdleSprite";
import { API_BASE_URL, GOLD, PARCHMENT, WOOD_DARK, WOOD_MID } from "../../constants/pet-log-theme";
import { PetEntry, usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";
import { findIdleFrames, findIdleSequence } from "../../data/idleAnimations";
import { useTabBarClearance } from "../../hooks/useTabBarClearance";

// Notebook-paper art behind the "Choose your pet" screen. Drawn with
// "contain" (never cropped) plus a letterbox color sampled from the paper;
// see claude/minigames-arcade-cabinet-background.md for why.
const SELECT_PET_BACKGROUND = require("../../assets/backgrounds/daily_log_notebook_paper.png");
const NOTEBOOK_LETTERBOX_COLOR = "#937558";

type AttributeKey = "speed" | "intelligence" | "mischief" | "strength" | "energy";

// The almanac card's stat rows, in display order.
const ATTRIBUTE_META: { key: AttributeKey; label: string; emoji: string }[] = [
  { key: "speed", label: "Speed", emoji: "🏃" },
  { key: "intelligence", label: "Intelligence", emoji: "🧠" },
  { key: "mischief", label: "Mischief", emoji: "😼" },
  { key: "strength", label: "Strength", emoji: "💪" },
  { key: "energy", label: "Energy", emoji: "⚡" },
];

const MAX_RATING = 5;
const COINS_PER_STAT_POINT = 5;

// A 5-pip meter for one attribute, filled up to `value`.
function StatRow({ label, emoji, value }: { label: string; emoji: string; value: number }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>
        {emoji} {label}
      </Text>
      <View style={styles.statPips}>
        {Array.from({ length: MAX_RATING }).map((_, i) => (
          <View key={i} style={[styles.statPip, i < value ? styles.statPipFilled : styles.statPipEmpty]} />
        ))}
      </View>
    </View>
  );
}

// The pet's full-body avatar in the card: its idle loop if it has one (data/idleAnimations.ts),
// otherwise the static avatar image (or emoji).
function PetAvatarArt({ pet }: { pet: PetEntry }) {
  const idleFrames = findIdleFrames(pet.selectedEmoji);
  const avatarOption = findAvatarOption(pet.category, pet.selectedEmoji, pet.color);

  if (idleFrames) {
    return (
      <IdleSprite
        key={pet.selectedEmoji ?? undefined}
        frames={idleFrames}
        sequence={findIdleSequence(pet.selectedEmoji)}
        style={styles.avatarFrameImage}
      />
    );
  }

  return avatarOption?.image ? (
    <Image source={avatarOption.image} style={styles.avatarFrameImage} resizeMode="contain" />
  ) : (
    <Text style={styles.avatarFrameEmoji}>{avatarOption?.emoji ?? pet.selectedEmoji ?? "🐾"}</Text>
  );
}

export default function DailyPawLog() {
  const { pets, setPets, coins, earnCoins, hasBookOfOrigin, hasBondKeeper } =
    usePets();
  const { accentColor } = useTheme();
  const tabBarClearance = useTabBarClearance();

  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  // Derived from the live pets array each render (never a stored snapshot).
  const selectedPet = pets.find((pet) => pet.id === selectedPetId) ?? null;

  const [logText, setLogText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isOriginStoryVisible, setIsOriginStoryVisible] = useState(false);

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
      const changes: Partial<Record<AttributeKey, number>> = data.attributeChanges ?? {};

      // Only positive changes to known attributes count. Summed here, not
      // inside the setPets updater, since React may run that later (or twice).
      const increases = ATTRIBUTE_META.map(({ key }) => ({ key, delta: changes[key] ?? 0 })).filter(
        ({ delta }) => delta > 0
      );
      const totalIncrease = increases.reduce((sum, { delta }) => sum + delta, 0);

      setPets((currentPets) =>
        currentPets.map((pet) => {
          if (pet.id !== selectedPet.id) return pet;

          const newRatings = { ...pet.ratings };
          increases.forEach(({ key, delta }) => {
            newRatings[key] = Math.min(newRatings[key] + delta, MAX_RATING);
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
        earnCoins(totalIncrease * COINS_PER_STAT_POINT);
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
    setSelectedPetId(pet?.id ?? null);
    setLogText("");
    setAiFeedback(null);
    setAiError(null);
    setIsOriginStoryVisible(false);
  };

  const updateBackstory = (petId: string, text: string) => {
    setPets((currentPets) =>
      currentPets.map((pet) =>
        pet.id === petId ? { ...pet, backstory: text } : pet
      )
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: NOTEBOOK_LETTERBOX_COLOR }}>
      {/* Notebook-paper background while picking a pet — the pet list is then written
          right onto its ruled lines (see NotebookPetPicker). Once one's selected, the almanac
          goes full-bleed wood-dark instead (no paper behind it). */}
      {!selectedPet ? (
        <>
          <Image
            source={SELECT_PET_BACKGROUND}
            resizeMode="contain"
            style={styles.background}
          />
          <NotebookPetPicker
            pets={pets.filter((pet) => pet.confirmed)}
            coins={coins}
            accentColor={accentColor}
            bottomClearance={tabBarClearance}
            onSelect={changePet}
          />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.almanacBackdrop]} />
      )}

      {selectedPet && (
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: tabBarClearance },
        ]}
      >
      <View style={styles.coinBadge}>
        <CoinIcon size={16} />
        <Text style={[styles.coinText, { color: accentColor }]}> {coins}</Text>
      </View>

        <View style={styles.pageBody}>
          <View style={styles.almanacPage}>
            <PressableScale
              style={styles.changePetPill}
              onPress={() => changePet(null)}
            >
              <MaterialCommunityIcons
                name="swap-horizontal"
                size={14}
                color={PARCHMENT}
              />
              <Text style={styles.changePetPillText}>Change Pet</Text>
            </PressableScale>

            <View style={styles.mediaRow}>
              <View style={styles.photoFrame}>
                {selectedPet.photoUri ? (
                  <Image
                    source={{ uri: selectedPet.photoUri }}
                    style={styles.photoFrameImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.photoFrameEmpty}>
                    <MaterialCommunityIcons
                      name="paw"
                      size={34}
                      color="#B99C63"
                    />
                    <Text style={styles.photoFrameEmptyText}>
                      No photo yet
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.avatarFrame}>
                <PetAvatarArt pet={selectedPet} />
              </View>
            </View>

            <View style={styles.namePlaque}>
              <Text style={styles.namePlaqueText}>
                {selectedPet.name || "Unnamed Pet"}
              </Text>
            </View>

            <View style={styles.backstorySection}>
              <Text style={styles.backstoryLabel}>✒️ Backstory</Text>

              <TextInput
                style={styles.backstoryInput}
                placeholder={`Write a little backstory for ${
                  selectedPet.name || "your pet"
                }...`}
                placeholderTextColor="#A88A55"
                multiline
                value={selectedPet.backstory}
                onChangeText={(text) => updateBackstory(selectedPet.id, text)}
              />

              {hasBookOfOrigin ? (
                <PressableScale
                  style={styles.originStoryButton}
                  onPress={() => setIsOriginStoryVisible(true)}
                >
                  <MaterialCommunityIcons
                    name="auto-fix"
                    size={16}
                    color={PARCHMENT}
                  />
                  <Text style={styles.originStoryButtonText}>
                    {selectedPet.backstory
                      ? "Rewrite with the Origin Story wizard"
                      : "Create with the Origin Story wizard"}
                  </Text>
                </PressableScale>
              ) : (
                <View style={styles.originLockedState}>
                  <Text style={styles.originLockedEmoji}>🔒</Text>
                  <Text style={styles.originLockedTitle}>
                    Origin Story wizard is locked
                  </Text>
                  <Text style={styles.originLockedSubtitle}>
                    Find the witch somewhere out in the Magical Forest to earn
                    the Book of Origin and unlock the wizard. You can still
                    write a backstory by hand above in the meantime.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.statsSection}>
              {ATTRIBUTE_META.map((meta) => (
                <StatRow
                  key={meta.key}
                  label={meta.label}
                  emoji={meta.emoji}
                  value={selectedPet.ratings[meta.key]}
                />
              ))}
            </View>

            {/* --- Bond Keeper, same page, fills remaining height --- */}
            <View style={styles.coachSection}>
              {hasBondKeeper ? (
                <>
                  <Text style={styles.coachScrollTitle}>
                    📜 Tell the Bond Keeper about today
                  </Text>

                  <TextInput
                    style={styles.coachInput}
                    placeholder={`e.g. "We walked to the park and played fetch"`}
                    placeholderTextColor="#A88A55"
                    multiline
                    value={logText}
                    onChangeText={setLogText}
                    editable={!isAnalyzing}
                  />

                  <PressableScale
                    style={[
                      styles.coachSubmitButton,
                      (!logText.trim() || isAnalyzing) &&
                        styles.coachSubmitButtonDisabled,
                    ]}
                    onPress={handleAiSubmit}
                    disabled={!logText.trim() || isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <ActivityIndicator color={PARCHMENT} />
                    ) : (
                      <Text style={styles.coachSubmitButtonText}>
                        Ask the Bond Keeper
                      </Text>
                    )}
                  </PressableScale>

                  {aiError && (
                    <Text style={styles.coachError}>{aiError}</Text>
                  )}

                  {aiFeedback && (
                    <View style={styles.coachBubble}>
                      <Text style={styles.coachBubbleEmoji}>🐾</Text>
                      <Text style={styles.coachBubbleText}>{aiFeedback}</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.coachLockedState}>
                  <Text style={styles.coachLockedEmoji}>🔒</Text>
                  <Text style={styles.coachLockedTitle}>
                    Bond Keeper is locked
                  </Text>
                  <Text style={styles.coachLockedSubtitle}>
                    The Bond Keeper is out there somewhere in your toughest
                    adventure yet — exactly where is still being written.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
      )}

      {selectedPet && (
        <OriginStoryWizard
          visible={isOriginStoryVisible}
          petName={selectedPet.name}
          petCategory={selectedPet.category}
          onClose={() => setIsOriginStoryVisible(false)}
          onComplete={(story) => updateBackstory(selectedPet.id, story)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit 100% size is required on RN Web for local images; written out
  // literally since absoluteFillObject isn't in this project's RN types.
  background: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },

  almanacBackdrop: {
    backgroundColor: WOOD_DARK,
  },

  container: {
    flexGrow: 1,
    padding: 14,
    paddingTop: 80,
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
    marginBottom: 20,
  },

  coinText: {
    color: "#FF8C42",
    fontWeight: "800",
    fontSize: 16,
  },

  pageBody: {
    flex: 1,
  },

  // --- Almanac page ---

  almanacPage: {
    flex: 1,
    backgroundColor: PARCHMENT,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: WOOD_MID,
    padding: 16,
  },

  changePetPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: WOOD_DARK,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
  },

  changePetPillText: {
    color: PARCHMENT,
    fontWeight: "700",
    fontSize: 12,
  },

  mediaRow: {
    flexDirection: "row",
    gap: 10,
  },

  photoFrame: {
    flex: 1.5,
    height: 260,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: WOOD_MID,
    backgroundColor: "#D8C79A",
    overflow: "hidden",
  },

  photoFrameImage: {
    width: "100%",
    height: "100%",
  },

  photoFrameEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  photoFrameEmptyText: {
    color: "#8A6B3D",
    fontWeight: "700",
    fontSize: 13,
  },

  avatarFrame: {
    flex: 1,
    height: 260,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: WOOD_MID,
    backgroundColor: AVATAR_BACKDROP_COLOR,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  avatarFrameImage: {
    width: "100%",
    height: "100%",
  },

  avatarFrameEmoji: {
    fontSize: 96,
  },

  namePlaque: {
    marginTop: 12,
    backgroundColor: WOOD_MID,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
  },

  namePlaqueText: {
    color: PARCHMENT,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  backstorySection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 2,
    borderTopColor: "rgba(107,74,40,0.25)",
  },

  backstoryLabel: {
    color: WOOD_DARK,
    fontWeight: "700",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  backstoryInput: {
    fontSize: 15,
    lineHeight: 21,
    color: "#4A2F17",
    fontStyle: "italic",
    minHeight: 60,
    textAlignVertical: "top",
    padding: 0,
  },

  originStoryButton: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: WOOD_MID,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },

  originStoryButtonText: {
    color: PARCHMENT,
    fontWeight: "700",
    fontSize: 13,
  },

  originLockedState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginTop: 4,
  },

  originLockedEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },

  originLockedTitle: {
    color: WOOD_DARK,
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 4,
  },

  originLockedSubtitle: {
    color: "#6B4A28",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },

  statsSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 2,
    borderTopColor: "rgba(107,74,40,0.25)",
    gap: 10,
  },

  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  statLabel: {
    color: "#4A2F17",
    fontWeight: "700",
    fontSize: 14,
  },

  statPips: {
    flexDirection: "row",
    gap: 5,
  },

  statPip: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  statPipFilled: {
    backgroundColor: GOLD,
  },

  statPipEmpty: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#C9AD75",
  },

  // --- Bond Keeper, same page, fills whatever height is left ---

  coachSection: {
    flexGrow: 1,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 2,
    borderTopColor: "rgba(107,74,40,0.25)",
  },

  coachScrollTitle: {
    color: WOOD_DARK,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 12,
  },

  coachInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    color: "#333",
    textAlignVertical: "top",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E3CFA0",
  },

  coachSubmitButton: {
    backgroundColor: WOOD_DARK,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  coachSubmitButtonDisabled: {
    opacity: 0.5,
  },

  coachSubmitButtonText: {
    color: PARCHMENT,
    fontWeight: "700",
    fontSize: 15,
  },

  coachError: {
    color: "#8B3A2B",
    fontWeight: "600",
    marginTop: 10,
  },

  coachBubble: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E3CFA0",
  },

  coachBubbleEmoji: {
    fontSize: 20,
  },

  coachBubbleText: {
    flex: 1,
    color: "#333",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },

  coachLockedState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },

  coachLockedEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },

  coachLockedTitle: {
    color: WOOD_DARK,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 6,
  },

  coachLockedSubtitle: {
    color: "#6B4A28",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 19,
  },
});
