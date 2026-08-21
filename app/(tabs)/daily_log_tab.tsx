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
import { AvatarDisplay, findAvatarOption } from "../../components/ui/AvatarDisplay";
import { CoinIcon } from "../../components/ui/CoinIcon";
import { PressableScale } from "../../components/ui/PressableScale";
import { TabBackground } from "../../components/ui/TabBackground";
import { WalkingSprite } from "../../components/ui/WalkingSprite";
import { WalkingVideo } from "../../components/ui/WalkingVideo";
import { API_BASE_URL, GOLD, PARCHMENT, WOOD_DARK, WOOD_MID } from "../../constants/pet-log-theme";
import { PetEntry, usePets } from "../../context/PetInformation";
import { useTheme } from "../../context/ThemeContext";
import { findWalkFrames } from "../../data/walkAnimations";
import { findWalkVideo } from "../../data/walkVideos";
import { useTabBarClearance } from "../../hooks/useTabBarClearance";

type AttributeKey =
  | "speed"
  | "intelligence"
  | "mischief"
  | "strength"
  | "energy";

const VALID_ATTRIBUTES: AttributeKey[] = [
  "speed",
  "intelligence",
  "mischief",
  "strength",
  "energy",
];

// Drives the almanac card's stat rows, in display order.
const ATTRIBUTE_META: { key: AttributeKey; label: string; emoji: string }[] = [
  { key: "speed", label: "Speed", emoji: "🏃" },
  { key: "intelligence", label: "Intelligence", emoji: "🧠" },
  { key: "mischief", label: "Mischief", emoji: "😼" },
  { key: "strength", label: "Strength", emoji: "💪" },
  { key: "energy", label: "Energy", emoji: "⚡" },
];

const MAX_RATING = 5;

export default function DailyPawLog() {
  const { pets, setPets, coins, earnCoins, hasStorybook } = usePets();
  const { accentColor, theme } = useTheme();
  const tabBarClearance = useTabBarClearance();

  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const selectedPet =
    pets.find((pet) => pet.id === selectedPetId) ?? null;
  // Looked up once per render so both the hidden preloader below and the
  // avatar's hold-to-walk logic use the exact same frames.
  const walkFrames = selectedPet
    ? findWalkFrames(selectedPet.selectedEmoji)
    : undefined;
  // A real video clip takes priority over the sprite frames above when
  // both exist for a pet (see data/walkVideos.ts) — walkFrames stays as
  // the fallback for any pet that doesn't have one.
  const walkVideo = selectedPet
    ? findWalkVideo(selectedPet.selectedEmoji)
    : undefined;

  const [logText, setLogText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isOriginStoryVisible, setIsOriginStoryVisible] = useState(false);
  // Held down on the almanac avatar? Plays that pet's walk cycle instead of
  // the static avatar art (only pets with a WALK_ANIMATIONS entry animate;
  // everyone else just sits there as before).
  const [isAvatarWalking, setIsAvatarWalking] = useState(false);

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
      const changes: Partial<Record<AttributeKey, number>> =
        data.attributeChanges ?? {};

      let totalIncrease = 0;

      setPets((currentPets) =>
        currentPets.map((pet) => {
          if (pet.id !== selectedPet.id) return pet;

          const newRatings = { ...pet.ratings };

          VALID_ATTRIBUTES.forEach((key) => {
            const delta = changes[key] ?? 0;
            if (delta > 0) {
              newRatings[key] = Math.min(newRatings[key] + delta, MAX_RATING);
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
    setSelectedPetId(pet?.id ?? null);
    setLogText("");
    setAiFeedback(null);
    setAiError(null);
    setIsOriginStoryVisible(false);
    setIsAvatarWalking(false);
  };

  const updateBackstory = (petId: string, text: string) => {
    setPets((currentPets) =>
      currentPets.map((pet) =>
        pet.id === petId ? { ...pet, backstory: text } : pet
      )
    );
  };

  // Renders a 5-pip meter for a single attribute, filled up to `value`.
  const StatRow = ({
    label,
    emoji,
    value,
  }: {
    label: string;
    emoji: string;
    value: number;
  }) => (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>
        {emoji} {label}
      </Text>

      <View style={styles.statPips}>
        {Array.from({ length: MAX_RATING }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.statPip,
              i < value ? styles.statPipFilled : styles.statPipEmpty,
            ]}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Grey glossy background while picking a pet; once one's selected,
          the almanac goes full-bleed wood-dark instead (no grey behind it). */}
      {!selectedPet ? (
        <TabBackground />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.almanacBackdrop]} />
      )}

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: tabBarClearance },
        ]}
      >
      <View style={styles.headerRow}>
        <View style={styles.pageLabelPill}>
          <Text style={styles.pageLabelPillText}>Daily Paw Log</Text>
        </View>

        <View style={styles.coinBadge}>
          <CoinIcon size={16} />
          <Text style={[styles.coinText, { color: accentColor }]}> {coins}</Text>
        </View>
      </View>

      {!selectedPet ? (
        <>
          <Text style={styles.header}>Choose your pet</Text>

          {pets
            .filter((pet) => pet.confirmed)
            .map((pet) => (
              <PressableScale
                key={pet.id}
                style={[
                  styles.petCard,
                  {
                    backgroundColor: theme.card.background,
                    borderColor: theme.card.border,
                  },
                ]}
                onPress={() => changePet(pet)}
              >
                <View style={{ marginRight: 20 }}>
                  <AvatarDisplay
                    category={pet.category}
                    emoji={pet.selectedEmoji}
                    color={pet.color}
                    size={35}
                    transparentBackdrop
                  />
                </View>

                <Text style={[styles.petName, { color: theme.text.primary }]}>
                  {pet.name || "Unnamed Pet"}
                </Text>
              </PressableScale>
            ))}
        </>
      ) : (
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

              <PressableScale
                style={styles.avatarFrame}
                onPressIn={() => setIsAvatarWalking(true)}
                onPressOut={() => setIsAvatarWalking(false)}
              >
                {/* Off-screen decode pass for sprite-based pets: mounting
                    these as soon as the pet is selected means each walk
                    frame is already decoded/cached by the time the user
                    holds the avatar, instead of decoding on first use
                    (which showed up as a black flash for the first cycle
                    or two). Skipped for pets with a video clip — WalkingVideo
                    below handles its own warm-up by staying mounted. */}
                {walkFrames && !walkVideo && (
                  <View
                    style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
                    pointerEvents="none"
                  >
                    {walkFrames.map((frame, i) => (
                      <Image key={i} source={frame} style={{ width: 1, height: 1 }} />
                    ))}
                  </View>
                )}

                {(() => {
                  const avatarOption = findAvatarOption(
                    selectedPet.category,
                    selectedPet.selectedEmoji,
                    selectedPet.color
                  );

                  const staticAvatar = avatarOption?.image ? (
                    <Image
                      source={avatarOption.image}
                      style={styles.avatarFrameImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={styles.avatarFrameEmoji}>
                      {avatarOption?.emoji ?? selectedPet.selectedEmoji ?? "🐾"}
                    </Text>
                  );

                  if (walkVideo) {
                    // WalkingVideo stays mounted at all times (just
                    // opacity-swapped with the static avatar) instead of
                    // being mounted fresh on every hold, so the player is
                    // already warmed up and there's no decode/buffer lag
                    // once the hold starts — only the very first hold of
                    // the session pays that startup cost.
                    return (
                      <>
                        <View
                          style={[
                            StyleSheet.absoluteFillObject,
                            { opacity: isAvatarWalking ? 0 : 1 },
                          ]}
                        >
                          {staticAvatar}
                        </View>
                        <View
                          style={[
                            StyleSheet.absoluteFillObject,
                            { opacity: isAvatarWalking ? 1 : 0 },
                          ]}
                          pointerEvents="none"
                        >
                          <WalkingVideo
                            source={walkVideo}
                            playing={isAvatarWalking}
                            style={{ width: "100%", height: "100%" }}
                          />
                        </View>
                      </>
                    );
                  }

                  if (isAvatarWalking && walkFrames) {
                    return (
                      <WalkingSprite
                        frames={walkFrames}
                        style={{ width: "100%", height: "100%" }}
                      />
                    );
                  }

                  return staticAvatar;
                })()}
              </PressableScale>
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
              {hasStorybook ? (
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
                    Complete the Magical Forest adventure to earn the
                    Storybook of Bonds and unlock your Bond Keeper.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
      </ScrollView>

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
  almanacBackdrop: {
    backgroundColor: WOOD_DARK,
  },

  container: {
    flexGrow: 1,
    padding: 14,
    paddingTop: 52,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  pageLabelPill: {
    backgroundColor: PARCHMENT,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },

  pageLabelPillText: {
    color: WOOD_DARK,
    fontWeight: "800",
    fontSize: 18,
  },

  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
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
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  petName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F5F5F5",
  },

  // Fills whatever vertical space is left below the header, so the whole
  // screen reads as one full page rather than a card floating at the top.
  pageBody: {
    flex: 1,
  },

  // --- Almanac page: one continuous parchment page filling the tab ---

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

  // Fills edge-to-edge, same as photoFrame — avatar art (or a large emoji
  // fallback) takes up the whole box instead of sitting as a small centered
  // icon with empty space around it.
  avatarFrame: {
    flex: 1,
    height: 260,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: WOOD_MID,
    backgroundColor: "#000",
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