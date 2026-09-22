import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AvatarDisplay } from "../../components/ui/AvatarDisplay";
import { CoinIcon } from "../../components/ui/CoinIcon";
import { PressableScale } from "../../components/ui/PressableScale";
import { SailingAdventureBackground } from "../../components/ui/SailingAdventureBackground";
import { TabBackground } from "../../components/ui/TabBackground";
import { PetEntry, usePets } from "../../context/PetInformation";
import { useTheme, withAlpha } from "../../context/ThemeContext";
import { ADVENTURES } from "../../data/adventure";
import { getTabBarStyle } from "./_layout";

type AreaName = keyof typeof ADVENTURES;

const AREAS: { name: AreaName; emoji: string; price: number }[] = [
  { name: "Magical Forest", emoji: "🌲", price: 0 },
  { name: "Frostpaw Tundra", emoji: "❄️", price: 40 },
  { name: "Crystal Caverns", emoji: "💎", price: 60 },
  { name: "Bone Desert", emoji: "🦴", price: 80 },
];

// Used when stepping into a whole new area — long enough for the label to build in and hold.
const AREA_TRANSITION = {
  fadeIn: 900,
  textScale: 650,
  hold: 950,
  fadeOut: 850,
};

// Used between story beats within the same area — a quick, wordless black cut/fade between choices.
const SCENE_TRANSITION = {
  fadeIn: 320,
  textScale: 0,
  hold: 120,
  fadeOut: 320,
};

export default function Adventure() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { pets, coins, unlockedAreas, unlockArea, unlockBookOfOrigin } =
    usePets();
  const { accentColor, theme } = useTheme();

  const [selectedPet, setSelectedPet] = useState<PetEntry | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaName | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);

  // Reset target for the tab bar, matching _layout.tsx's style exactly (never reset to `undefined`, which drops it entirely).
  const restoredTabBarStyle = useMemo(
    () => getTabBarStyle(theme, insets.bottom),
    [theme, insets.bottom]
  );

  // Drives a gradual fade via a JS listener recomputing plain opacity, since setOptions can't take an Animated.Value directly.
  const tabBarOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const listenerId = tabBarOpacity.addListener(({ value }) => {
      navigation.setOptions({
        tabBarStyle: {
          ...restoredTabBarStyle,
          opacity: value,
          // Only pull it out of layout/touch once essentially invisible, so the fade finishes.
          ...(value <= 0.01 ? { display: "none" } : null),
        },
      });
    });

    return () => tabBarOpacity.removeListener(listenerId);
  }, [navigation, restoredTabBarStyle, tabBarOpacity]);

  // Hides the tab bar only once a story is entered (selectedArea set), not just when this tab is focused.
  useEffect(() => {
    Animated.timing(tabBarOpacity, {
      toValue: selectedArea ? 0 : 1,
      duration: 350,
      useNativeDriver: false, // driving a JS listener, not a native style prop
    }).start();
  }, [selectedArea, tabBarOpacity]);

  // Safety net: instantly restores the tab bar when leaving this tab entirely, since state persists across tab swaps.
  useFocusEffect(
    useCallback(() => {
      return () => {
        tabBarOpacity.stopAnimation();
        tabBarOpacity.setValue(1);
        navigation.setOptions({ tabBarStyle: restoredTabBarStyle });
      };
    }, [navigation, restoredTabBarStyle, tabBarOpacity])
  );

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionLabel, setTransitionLabel] = useState("");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Starts the transition label slightly small and scales it up once the screen is fully black.
  const transitionTextScale = useRef(new Animated.Value(0.82)).current;

  const currentStory =
    selectedArea && currentNodeId
      ? ADVENTURES[selectedArea].nodes[currentNodeId]
      : null;

  // Fades a black overlay in, swaps screen state while covered (onMidpoint), then fades back out; shared by area and choice transitions.
  const runSceneTransition = (
    label: string,
    durations: { fadeIn: number; textScale: number; hold: number; fadeOut: number },
    onMidpoint: () => void
  ) => {
    setTransitionLabel(label);
    setIsTransitioning(true);
    fadeAnim.setValue(0);
    transitionTextScale.setValue(0.82);

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: durations.fadeIn,
      useNativeDriver: true,
    }).start(() => {
      onMidpoint();

      if (label) {
        Animated.timing(transitionTextScale, {
          toValue: 1,
          duration: durations.textScale,
          useNativeDriver: true,
        }).start();
      }

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: durations.fadeOut,
        delay: durations.hold,
        useNativeDriver: true,
      }).start(() => {
        setIsTransitioning(false);
      });
    });
  };

  const chooseArea = (areaName: AreaName) => {
    runSceneTransition(`Entering ${areaName}...`, AREA_TRANSITION, () => {
      setSelectedArea(areaName);
      setCurrentNodeId(ADVENTURES[areaName].start);
    });
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

  // Every choice cuts to black and back before the next scene appears, same beat as entering an area but quicker and wordless.
  const handleChoice = (nextId: string) => {
    if (!selectedArea) return;

    runSceneTransition("", SCENE_TRANSITION, () => {
      setCurrentNodeId(nextId);

      const nextNode = ADVENTURES[selectedArea].nodes[nextId];
      if (nextNode?.givesBookOfOrigin) {
        unlockBookOfOrigin();
      }
    });
  };

  // Resets adventure state and returns to the pet/area picker within this tab.
  const resetAdventureState = () => {
    setSelectedArea(null);
    setCurrentNodeId(null);
  };

  // Leaves the story for the area-select screen, keeping selectedPet set (unlike changePet).
  const endAdventure = () => {
    resetAdventureState();
  };

  const changePet = () => {
    setSelectedPet(null);
    resetAdventureState();
  };

  // Only relevant inside a story, since ending an adventure returns to area-select rather than leaving the tab.
  const showEndAdventureButton = selectedArea !== null;

  return (
    <View style={{ flex: 1 }}>
      {/* TEMP PREVIEW: swapped in to preview the new sailing background/flag
          animation without wiring a real area yet. Revert to <TabBackground />
          once approved (see SailingAdventureBackground.tsx). */}
      <SailingAdventureBackground />

      <ScrollView contentContainerStyle={styles.container}>
        {!selectedArea && (
          <View style={styles.coinBadge}>
            <CoinIcon size={16} />
            <Text style={[styles.coinText, { color: accentColor }]}> {coins}</Text>
          </View>
        )}

        {showEndAdventureButton && (
          <PressableScale
            style={[
              styles.endAdventureButton,
              { backgroundColor: theme.card.background, borderColor: theme.card.border },
            ]}
            onPress={endAdventure}
          >
            <Text style={[styles.endAdventureText, { color: theme.text.primary }]}>← End Adventure</Text>
          </PressableScale>
        )}

        {!selectedPet && (
          <>
            <Text style={[styles.header, { color: theme.text.primary }]}>Choose your adventurer</Text>

            {pets
              .filter((pet) => pet.confirmed)
              .map((pet) => (
                <PressableScale
                  key={pet.id}
                  style={[
                    styles.card,
                    { backgroundColor: theme.card.background, borderColor: theme.card.border },
                  ]}
                  onPress={() => setSelectedPet(pet)}
                >
                  <View style={{ marginRight: 20 }}>
                    <AvatarDisplay
                      category={pet.category}
                      emoji={pet.selectedEmoji}
                      color={pet.color}
                      size={36}
                      variant="face"
                    />
                  </View>

                  <Text style={[styles.name, { color: theme.text.primary }]}>{pet.name || "Unnamed Pet"}</Text>
                </PressableScale>
              ))}
          </>
        )}

        {selectedPet && !selectedArea && (
          <>
            <PressableScale
              style={[
                styles.changePetPill,
                { backgroundColor: theme.card.background, borderColor: theme.card.border },
              ]}
              onPress={changePet}
            >
              <MaterialCommunityIcons
                name="swap-horizontal"
                size={14}
                color={theme.text.primary}
              />
              <Text style={[styles.changePetPillText, { color: theme.text.primary }]}>Change Pet</Text>
            </PressableScale>

            <Text style={[styles.header, { color: theme.text.primary }]}>
              Where should {selectedPet.name} explore?
            </Text>

            {AREAS.map((area) => {
              const isUnlocked = unlockedAreas.includes(area.name);
              const canAfford = coins >= area.price;

              return (
                <PressableScale
                  key={area.name}
                  style={[
                    styles.card,
                    { backgroundColor: theme.card.background, borderColor: theme.card.border },
                    // Only fade a locked area once you can't afford it; affordable areas read at full brightness.
                    !isUnlocked && !canAfford && styles.cardLocked,
                  ]}
                  onPress={() => handleAreaPress(area.name, area.price)}
                  disabled={!isUnlocked && !canAfford}
                >
                  <Text style={styles.avatar}>
                    {isUnlocked ? area.emoji : "🔒"}
                  </Text>

                  <View style={styles.areaTextWrap}>
                    <Text style={[styles.name, { color: theme.text.primary }]}>{area.name}</Text>

                    {!isUnlocked && (
                      <Text
                        style={[
                          styles.priceTag,
                          { color: accentColor },
                          !canAfford && { color: theme.text.secondary },
                        ]}
                      >
                        {canAfford ? (
                          <>
                            Unlock for <CoinIcon size={13} /> {area.price}
                          </>
                        ) : (
                          <>
                            Need <CoinIcon size={13} /> {area.price}
                          </>
                        )}
                      </Text>
                    )}
                  </View>
                </PressableScale>
              );
            })}
          </>
        )}

        {currentStory && !currentStory.isEnding && (
          <View style={styles.storyBox}>
            <Text style={styles.storyText}>{currentStory.story}</Text>

            {currentStory.choices.map((choice) => (
              <PressableScale
                key={choice.text}
                style={[styles.choiceButton, { backgroundColor: accentColor }]}
                onPress={() => handleChoice(choice.next)}
              >
                <Text style={styles.choiceText}>{choice.text}</Text>
              </PressableScale>
            ))}
          </View>
        )}

        {currentStory && currentStory.isEnding && currentStory.givesBookOfOrigin && (
          <View style={styles.bookBox}>
            <Text style={styles.bookEmoji}>🧙📖</Text>
            <Text style={styles.storyText}>{currentStory.story}</Text>

            <View style={[styles.bookBanner, { backgroundColor: withAlpha(accentColor, 0.15) }]}>
              <Text style={[styles.bookBannerText, { color: accentColor }]}>
                Book of Origin unlocked! You can now use the Origin Story
                wizard on the Daily Paw Log tab.
              </Text>
            </View>

            <PressableScale
              style={[styles.finishButton, { backgroundColor: accentColor }]}
              onPress={resetAdventureState}
            >
              <Text style={styles.finishButtonText}>Explore More</Text>
            </PressableScale>
          </View>
        )}

        {currentStory && currentStory.isEnding && !currentStory.givesBookOfOrigin && (
          <View style={styles.storyBox}>
            <Text style={styles.storyText}>{currentStory.story}</Text>

            <PressableScale
              style={[styles.finishButton, { backgroundColor: accentColor }]}
              onPress={resetAdventureState}
            >
              <Text style={styles.finishButtonText}>Explore More</Text>
            </PressableScale>
          </View>
        )}
      </ScrollView>

      {isTransitioning && (
        <Animated.View
          pointerEvents="auto"
          style={[styles.transitionOverlay, { opacity: fadeAnim }]}
        >
          <Animated.Text
            style={[
              styles.transitionText,
              { transform: [{ scale: transitionTextScale }] },
            ]}
          >
            {transitionLabel}
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flexGrow: 1,
    backgroundColor: "transparent",
    padding: 20,
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
    marginBottom: 16,
  },

  coinText: {
    fontWeight: "800",
    fontSize: 16,
  },

  endAdventureButton: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
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
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  cardLocked: {
    opacity: 0.4,
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
  },

  priceTag: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
  },

  // Matches the Change Pet pill used on Daily Paw Log's almanac page.
  changePetPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  changePetPillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },

  storyBox: {
    backgroundColor: "rgba(28,28,30,0.92)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  storyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#F5F5F5",
    marginBottom: 20,
  },

  choiceButton: {
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
    backgroundColor: "rgba(28,28,30,0.92)",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  bookEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },

  bookBanner: {
    backgroundColor: "rgba(255,140,66,0.15)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },

  bookBannerText: {
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },

  finishButton: {
    borderRadius: 15,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },

  finishButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  transitionOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },

  transitionText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
