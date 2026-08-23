import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AvatarDisplay } from "../../components/ui/AvatarDisplay";
import { CoinIcon } from "../../components/ui/CoinIcon";
import { PressableScale } from "../../components/ui/PressableScale";
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

// Add an entry here whenever a new area gets its own custom background art.
const AREA_BACKGROUNDS: Partial<Record<AreaName, ImageSourcePropType>> = {
  "Magical Forest": require("../../assets/backgrounds/EnchantedForestCartoon.png"),
};

const TRANSITION_FADE_IN_MS = 900;
const TRANSITION_TEXT_SCALE_MS = 650;
const TRANSITION_HOLD_MS = 950;
const TRANSITION_FADE_OUT_MS = 850;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const FIREFLY_COUNT = 12;

type FireflyConfig = {
  id: number;
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
};

// Scatters fireflies across the screen with randomized size/timing/drift so
// they don't all twinkle and float in unison.
function buildFireflies(): FireflyConfig[] {
  return Array.from({ length: FIREFLY_COUNT }).map((_, i) => ({
    id: i,
    left: Math.random() * SCREEN_WIDTH,
    top: 100 + Math.random() * (SCREEN_HEIGHT - 220),
    size: 3 + Math.random() * 4,
    duration: 2000 + Math.random() * 2200,
    delay: Math.random() * 2500,
    driftX: (Math.random() - 0.5) * 36,
    driftY: (Math.random() - 0.5) * 46,
  }));
}

// A single glowing dot that twinkles (fades in/out) and gently drifts,
// looping forever. Purely decorative, so it ignores touches.
function Firefly({ config }: { config: FireflyConfig }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: config.duration,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: config.duration,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [config, progress]);

  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.95],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1.3],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, config.driftX],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, config.driftY],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.firefly,
        {
          left: config.left,
          top: config.top,
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    />
  );
}

// Renders a full-screen, non-interactive layer of fireflies over the
// current area's background art.
function FireflyField({ fireflies }: { fireflies: FireflyConfig[] }) {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {fireflies.map((firefly) => (
        <Firefly key={firefly.id} config={firefly} />
      ))}
    </View>
  );
}

export default function Adventure() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { pets, coins, unlockedAreas, unlockArea, unlockStorybook } =
    usePets();
  const { accentColor, theme } = useTheme();

  const [selectedPet, setSelectedPet] = useState<PetEntry | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaName | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);

  // Reset target for the tab bar — matches the height/paddingBottom
  // calculation in _layout.tsx's screenOptions exactly, so re-applying
  // this looks identical to the bar's normal resting state instead of
  // resetting to `undefined` (which drops this styling entirely and
  // falls back to the default flat MaterialTopTabs bar anchored to the
  // screen edge).
  const restoredTabBarStyle = useMemo(
    () => getTabBarStyle(theme, insets.bottom),
    [theme, insets.bottom]
  );

  // Drives a gradual fade instead of an instant show/hide. We can't just
  // hand an Animated.Value straight to navigation.setOptions (tabBarStyle
  // is read as a plain style object by the navigator, not passed through
  // to an Animated component), so a JS-driven listener recomputes a plain
  // numeric opacity every frame and re-applies it via setOptions.
  const tabBarOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const listenerId = tabBarOpacity.addListener(({ value }) => {
      navigation.setOptions({
        tabBarStyle: {
          ...restoredTabBarStyle,
          opacity: value,
          // Only pull it out of layout/touch once it's essentially invisible,
          // so the fade gets to finish instead of being cut off.
          ...(value <= 0.01 ? { display: "none" } : null),
        },
      });
    });

    return () => tabBarOpacity.removeListener(listenerId);
  }, [navigation, restoredTabBarStyle, tabBarOpacity]);

  // Hides the floating bottom tab bar only once the player has actually
  // entered an area's story (selectedArea set), not just when the Adventure
  // tab itself is focused — so swiping to the pet/area picker still shows
  // the tab bar, and it fades out gradually once the adventure story begins.
  useEffect(() => {
    Animated.timing(tabBarOpacity, {
      toValue: selectedArea ? 0 : 1,
      duration: 350,
      useNativeDriver: false, // driving a JS listener, not a native style prop
    }).start();
  }, [selectedArea, tabBarOpacity]);

  // Safety net: always restore the tab bar instantly when leaving this tab
  // entirely (e.g. swiping away mid-adventure), regardless of selectedArea
  // state or any in-flight fade, since the screen stays mounted and its
  // state persists across tab swaps. adventure_tab is a direct child screen
  // of the Tabs navigator, so `navigation` here is already scoped to that
  // Tabs navigator — no getParent() needed.
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
  // Starts the "Entering {areaName}..." text slightly small and scales it
  // up to full size once the screen is fully black, so the label builds
  // into place during the hold instead of just popping in at full size.
  const transitionTextScale = useRef(new Animated.Value(0.82)).current;
  const fireflies = useMemo(() => buildFireflies(), []);

  const currentStory =
    selectedArea && currentNodeId
      ? ADVENTURES[selectedArea].nodes[currentNodeId]
      : null;

  const currentBackground = selectedArea
    ? AREA_BACKGROUNDS[selectedArea]
    : undefined;

  // Fades a black overlay in with "Entering {areaName}..." text, swaps the
  // underlying screen state while fully black (via onMidpoint), then fades
  // the overlay back out to reveal the new area/background.
  const runAreaTransition = (areaName: AreaName, onMidpoint: () => void) => {
    setTransitionLabel(`Entering ${areaName}...`);
    setIsTransitioning(true);
    fadeAnim.setValue(0);
    transitionTextScale.setValue(0.82);

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: TRANSITION_FADE_IN_MS,
      useNativeDriver: true,
    }).start(() => {
      onMidpoint();

      Animated.timing(transitionTextScale, {
        toValue: 1,
        duration: TRANSITION_TEXT_SCALE_MS,
        useNativeDriver: true,
      }).start();

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: TRANSITION_FADE_OUT_MS,
        delay: TRANSITION_HOLD_MS,
        useNativeDriver: true,
      }).start(() => {
        setIsTransitioning(false);
      });
    });
  };

  const chooseArea = (areaName: AreaName) => {
    runAreaTransition(areaName, () => {
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

  // Leaves the current story and returns to the area-select screen for the
  // same pet (unlike changePet, this keeps selectedPet set).
  const endAdventure = () => {
    resetAdventureState();
  };

  const changePet = () => {
    setSelectedPet(null);
    resetAdventureState();
  };

  // Only relevant once the user is actually inside a story — not just on
  // the area-select screen — since ending an adventure now returns there
  // instead of leaving the tab.
  const showEndAdventureButton = selectedArea !== null;

  // Full-screen background art for the currently selected area (once one
  // exists for it). Sits behind the ScrollView; the ScrollView's own
  // background is made transparent whenever this is present so the art
  // shows through everywhere, not just around the story card.
  const showFullScreenBackground = Boolean(selectedArea && currentBackground);

  return (
    <View style={{ flex: 1 }}>
      <TabBackground />

      {showFullScreenBackground && (
        <View style={styles.fullScreenBackgroundWrap}>
          <Image
            source={currentBackground}
            style={styles.fullScreenBackground}
            resizeMode="contain"
          />
        </View>
      )}

      {showFullScreenBackground && <FireflyField fireflies={fireflies} />}

      <ScrollView
        contentContainerStyle={[
          styles.container,
          showFullScreenBackground && styles.containerTransparent,
        ]}
        style={showFullScreenBackground ? styles.transparentScroll : undefined}
      >
        <Text style={[styles.title, { color: theme.text.primary }]}>Adventure</Text>

        <View style={styles.coinBadge}>
          <CoinIcon size={16} />
          <Text style={[styles.coinText, { color: accentColor }]}> {coins}</Text>
        </View>

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
                    !isUnlocked && styles.cardLocked,
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
          <View
            style={[
              styles.storyBox,
              showFullScreenBackground && styles.storyBoxThemed,
            ]}
          >
            <Text
              style={[
                styles.storyText,
                showFullScreenBackground && styles.storyTextThemed,
              ]}
            >
              {currentStory.story}
            </Text>

            {currentStory.choices.map((choice) => (
              <PressableScale
                key={choice.text}
                style={[
                  styles.choiceButton,
                  !showFullScreenBackground && { backgroundColor: accentColor },
                  showFullScreenBackground && styles.choiceButtonThemed,
                ]}
                onPress={() => handleChoice(choice.next)}
              >
                <Text
                  style={[
                    styles.choiceText,
                    showFullScreenBackground && styles.choiceTextThemed,
                  ]}
                >
                  {choice.text}
                </Text>
              </PressableScale>
            ))}
          </View>
        )}

        {currentStory && currentStory.isEnding && currentStory.givesBook && (
          <View
            style={[
              styles.bookBox,
              showFullScreenBackground && styles.storyBoxThemed,
            ]}
          >
            <Text style={styles.bookEmoji}>🧙📖</Text>
            <Text
              style={[
                styles.storyText,
                showFullScreenBackground && styles.storyTextThemed,
              ]}
            >
              {currentStory.story}
            </Text>

            <View
              style={[
                styles.bookBanner,
                !showFullScreenBackground && { backgroundColor: withAlpha(accentColor, 0.15) },
                showFullScreenBackground && styles.bookBannerThemed,
              ]}
            >
              <Text
                style={[
                  styles.bookBannerText,
                  !showFullScreenBackground && { color: accentColor },
                  showFullScreenBackground && styles.bookBannerTextThemed,
                ]}
              >
                Storybook unlocked! You can now use the AI Pet Coach on the
                Daily Paw Log tab.
              </Text>
            </View>

            <PressableScale
              style={[
                styles.finishButton,
                !showFullScreenBackground && { backgroundColor: accentColor },
                showFullScreenBackground && styles.choiceButtonThemed,
              ]}
              onPress={resetAdventureState}
            >
              <Text
                style={[
                  styles.finishButtonText,
                  showFullScreenBackground && styles.choiceTextThemed,
                ]}
              >
                Explore More
              </Text>
            </PressableScale>
          </View>
        )}

        {currentStory && currentStory.isEnding && !currentStory.givesBook && (
          <View
            style={[
              styles.storyBox,
              showFullScreenBackground && styles.storyBoxThemed,
            ]}
          >
            <Text
              style={[
                styles.storyText,
                showFullScreenBackground && styles.storyTextThemed,
              ]}
            >
              {currentStory.story}
            </Text>

            <PressableScale
              style={[
                styles.finishButton,
                !showFullScreenBackground && { backgroundColor: accentColor },
                showFullScreenBackground && styles.choiceButtonThemed,
              ]}
              onPress={resetAdventureState}
            >
              <Text
                style={[
                  styles.finishButtonText,
                  showFullScreenBackground && styles.choiceTextThemed,
                ]}
              >
                Explore More
              </Text>
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
  background: {
    ...StyleSheet.absoluteFillObject,
  },

  container: {
    flexGrow: 1,
    backgroundColor: "transparent",
    padding: 20,
    paddingTop: 80,
  },

  title: {
    fontFamily: "Fredoka_700Bold",
    fontSize: 32,
    color: "#fff",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.15)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
    textAlign: "center",
    marginBottom: 16,
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
    color: "#FF8C42",
    fontWeight: "800",
    fontSize: 16,
  },

  endAdventureButton: {
    alignSelf: "flex-start",
    backgroundColor: "#1C1C1E",
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
    backgroundColor: "#1C1C1E",
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
    color: "#F5F5F5",
  },

  priceTag: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#FF8C42",
  },

  priceTagDisabled: {
    color: "#8E8E93",
  },

  // Matches the Change Pet pill used on Daily Paw Log's almanac page.
  changePetPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1C1C1E",
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

  // Full-bleed area artwork, positioned behind the ScrollView. "contain"
  // shows the whole image with no cropping/zoom; the wrap's backgroundColor
  // fills any letterbox space so it doesn't show as transparent/orange.
  fullScreenBackgroundWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1B3B2F",
  },

  fullScreenBackground: {
    width: "100%",
    height: "100%",
  },

  // Small glowing dot used by the Firefly component. Warm yellow-green with
  // a soft shadow to fake a glow (Android needs elevation + shadow* both set
  // for the glow to render at all).
  firefly: {
    position: "absolute",
    backgroundColor: "#EFFFC2",
    shadowColor: "#D9FF7A",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },

  // Lets the area art show through instead of the default orange fill.
  transparentScroll: {
    backgroundColor: "transparent",
  },

  containerTransparent: {
    backgroundColor: "transparent",
  },

  storyBox: {
    backgroundColor: "rgba(28,28,30,0.92)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  // Applied over storyBox/bookBox whenever the area has its own background
  // art, so the card reads as a mist-glass panel sitting in the scene
  // instead of a plain white card.
  storyBoxThemed: {
    backgroundColor: "rgba(8, 24, 18, 0.68)",
    borderWidth: 1.5,
    borderColor: "rgba(168, 235, 195, 0.35)",
    shadowColor: "#8CFFC2",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },

  storyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#F5F5F5",
    marginBottom: 20,
  },

  storyTextThemed: {
    color: "#EAF7EE",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  choiceButton: {
    backgroundColor: "#FF8C42",
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
  },

  choiceButtonThemed: {
    backgroundColor: "rgba(38, 84, 58, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(168, 235, 195, 0.45)",
  },

  choiceText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  choiceTextThemed: {
    color: "#D9FFE6",
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

  bookBannerThemed: {
    backgroundColor: "rgba(255, 216, 130, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 216, 130, 0.5)",
  },

  bookBannerText: {
    color: "#FF8C42",
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },

  bookBannerTextThemed: {
    color: "#FFD873",
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

  transitionOverlay: {
    ...StyleSheet.absoluteFillObject,
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