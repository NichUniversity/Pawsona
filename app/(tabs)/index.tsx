import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused } from 'expo-router/react-navigation';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarDisplay, findAvatarOption } from '../../components/ui/AvatarDisplay';
import { DailyRewardModal } from '../../components/ui/DailyRewardModal';
import { PressableScale } from '../../components/ui/PressableScale';
import { SettingsMenu } from '../../components/ui/SettingsMenu';
import { TabBackground } from '../../components/ui/TabBackground';
import { ONBOARDING_STORAGE_KEY } from '../../constants/onboarding';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import {
  AttributeRatings,
  EMPTY_RATINGS,
  makeEmptyEntry,
  PetEntry,
  usePets
} from '../../context/PetInformation';
import { useSettings } from '../../context/SettingsContext';
import { ACCENT_COLORS, useTheme, withAlpha } from '../../context/ThemeContext';
import {
  AVATAR_OPTIONS,
  AvatarOption,
  getAvatarVariants,
  getMainPickerOptions,
  PET_CATEGORIES,
  PetCategory,
} from '../../data/petcategories';
import { useTabBarClearance } from '../../hooks/useTabBarClearance';

// TODO: swap in a real inbox before shipping — this is a placeholder.
const SUPPORT_EMAIL = 'pawsonasupport@gmail.com';

const ATTRIBUTES = [
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'speed', label: 'Speed' },
  { key: 'mischief', label: 'Mischief' },
  { key: 'strength', label: 'Strength' },
  { key: 'energy', label: 'Energy Level' },
];

async function pickPetPhoto(): Promise<string | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (!result.canceled) {
    return result.assets[0].uri;
  }
}

function categoryMeta(category: PetCategory) {
  return PET_CATEGORIES.find((c) => c.key === category)!;
}

function PawRating({ value }: { value: number }) {
  const { theme } = useTheme();
  return (
    <View style={styles.pawsRow}>
      {[1, 2, 3, 4, 5].map((paw) => (
        <MaterialCommunityIcons
          key={paw}
          name={paw <= value ? 'paw' : 'paw-outline'}
          size={18}
          color={paw <= value ? theme.text.primary : withAlpha(theme.text.primary, 0.35)}
        />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const {
    pets: entries,
    setPets: setEntries,
    streak,
    longestStreak,
    canClaimDailyReward,
    previewStreak,
    previewReward,
    claimDailyReward,
    isHydrated,
    unlockedAvatars,
    resetAllData,
  } = usePets();
  const { signOut, deleteAccount } = useAuth();
  const { replayOnboarding } = useOnboarding();
  const { accentKey, accentColor, setAccentKey, theme } = useTheme();
  const { hapticsEnabled, setHapticsEnabled } = useSettings();
  const tabBarClearance = useTabBarClearance();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [categoryModalId, setCategoryModalId] = useState<string | null>(null);
  const [avatarModalState, setAvatarModalState] = useState<{
    entryId: string;
    category: PetCategory;
    // True to show only alternate looks of the current avatar.
    variantsOnly?: boolean;
  } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Only glow on the very first app open.
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!done) {
          setIsFirstLaunch(true);
        }
      } catch {
        // Skip the glow if storage isn't available.
      }
    })();
  }, []);

  // Daily-reward popup, shown once per calendar day once hydrated.
  const [rewardModalVisible, setRewardModalVisible] = useState(false);
  useEffect(() => {
    if (isHydrated && canClaimDailyReward) {
      setRewardModalVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated]);

  const handleClaimDailyReward = () => {
    claimDailyReward();
    setRewardModalVisible(false);
  };

  // Keep currentIndex valid if entries shrink/grow.
  useEffect(() => {
    if (currentIndex > entries.length - 1) {
      setCurrentIndex(Math.max(0, entries.length - 1));
    }
  }, [entries.length, currentIndex]);

  // Quick fade whenever the active pet changes.
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [currentIndex, fadeAnim]);

  // Pulsing glow behind the empty upload box, only while this tab is focused.
  useEffect(() => {
    if (!isFocused) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim, isFocused]);

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.4],
  });

  const currentEntry = entries[currentIndex];

  const goToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(index, entries.length - 1));
    setCurrentIndex(clamped);
  };

  const goLeft = () => goToIndex(currentIndex - 1);
  const goRight = () => goToIndex(currentIndex + 1);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_evt, gestureState) =>
      Math.abs(gestureState.dx) > 15 &&
      Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderRelease: (_evt, gestureState) => {
      if (gestureState.dx < -50) {
        goRight();
      } else if (gestureState.dx > 50) {
        goLeft();
      }
    },
  });

  const updateEntry = (
    id: string,
    patch: Partial<PetEntry>
  ) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, ...patch }
          : entry
      )
    );
  };

  const handleUpload = async (id: string) => {
    const uri = await pickPetPhoto();

    if (uri) {
      updateEntry(id, {
        photoUri: uri,
        category: null,
        selectedEmoji: null,
        color: null,
        confirmed: false,
        ratings: { ...EMPTY_RATINGS },
      });
    }
  };

  const handleSelectCategory = (id: string, category: PetCategory) => {
    updateEntry(id, {
      category,
      selectedEmoji: null,
      color: null,
    });

    setCategoryModalId(null);
    setAvatarModalState({ entryId: id, category });
  };

  const handleChangeCategory = (id: string) => {
    setCategoryModalId(id);
  };

  const handleSelectAvatar = (id: string, option: AvatarOption) => {
    updateEntry(id, {
      selectedEmoji: option.emoji,
      color: option.color,
    });

    setAvatarModalState(null);
  };

  const handleConfirm = (id: string) => {
    setEntries((prev) => {
      const updated = prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              confirmed: true,
            }
          : entry
      );

      const isLast =
        prev[prev.length - 1]?.id === id;

      if (isLast) {
        updated.push(makeEmptyEntry());
      }

      return updated;
    });
  };

  // Opens the delete-confirm modal for this entry.
  const handleDeleteEntry = (id: string) => {
    setDeleteConfirmId(id);
  };

  // Removes a pet's photo/profile/stats, always leaving at least one entry.
  const confirmDeleteEntry = () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;

    setEntries((prev) => {
      const filtered = prev.filter((e) => e.id !== id);
      return filtered.length > 0 ? filtered : [makeEmptyEntry()];
    });

    setDeleteConfirmId(null);
  };

  // Opens the device's mail client with a pre-filled subject/body — no in-app form or backend needed.
  const handleSendFeedback = () => {
    const subject = encodeURIComponent('Pawsona Feedback');
    const body = encodeURIComponent(
      `\n\n—\nApp version ${Constants.expoConfig?.version ?? 'unknown'}`
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(
      () => Alert.alert("Couldn't open Mail", 'You can reach us at ' + SUPPORT_EMAIL)
    );
  };

  // Hands over every pet's saved data as JSON through the native share sheet — no backend or file-system permissions needed.
  const handleExportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      pets: entries,
    };
    Share.share({
      message: JSON.stringify(payload, null, 2),
      title: 'Pawsona Data Export',
    }).catch(() => {
      // User cancelled the share sheet — nothing to do.
    });
  };

  // Destructive and permanent: wipes the local account and all pet/coin/streak data, then signs out. Confirmed via native alert.
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all pet data on this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await resetAllData();
            await deleteAccount();
          },
        },
      ]
    );
  };

  const hasConfirmedPet = entries.some((e) => e.confirmed);

  // Options to list in the avatar picker modal.
  const avatarModalOptions: AvatarOption[] = (() => {
    if (!avatarModalState) return [];
    const { category, variantsOnly, entryId } = avatarModalState;
    if (!variantsOnly) return getMainPickerOptions(category);

    const activeEntry = entries.find((e) => e.id === entryId);
    const currentOption = activeEntry?.selectedEmoji
      ? AVATAR_OPTIONS[category].find(
          (o) => o.emoji === activeEntry.selectedEmoji
        )
      : undefined;

    return currentOption
      ? getAvatarVariants(category, currentOption)
      : getMainPickerOptions(category);
  })();

  // Avatar unlocks are account-wide, so this checks the global list, not the pet the picker modal is open for.
  const isAvatarLocked = (option: AvatarOption) =>
    !!option.unlockId && !unlockedAvatars.includes(option.unlockId);

  return (
    <View style={styles.screen}>
      <TabBackground />

      <PressableScale
        style={[styles.settingsButton, { top: insets.top + 8 }]}
        onPress={() => setSettingsVisible(true)}
      >
        <MaterialCommunityIcons name="cog" size={22} color={withAlpha(theme.text.primary, 0.7)} />
      </PressableScale>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarClearance },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>

          <View style={styles.header}>
            <Image
              source={require('../../assets/images/pawsona-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={[styles.subtitle, { color: withAlpha(theme.text.primary, 0.85) }]}>
              {hasConfirmedPet
                ? 'Your pet pals, ready for adventure 🐾'
                : 'Upload a photo to bring your pet to life'}
            </Text>
          </View>

          <PressableScale
            style={[
              styles.streakBanner,
              {
                backgroundColor: theme.card.background,
                borderColor: theme.card.border,
              },
            ]}
            disabled={!canClaimDailyReward}
            onPress={handleClaimDailyReward}
          >
            <View
              style={[
                styles.streakIconBadge,
                { backgroundColor: withAlpha(accentColor, 0.15) },
              ]}
            >
              <MaterialCommunityIcons name="fire" size={18} color={accentColor} />
            </View>

            <View style={styles.streakTextColumn}>
              <Text style={[styles.streakTitle, { color: theme.text.primary }]}>
                {streak > 0 ? `Day ${streak} streak` : 'Start your streak'}
              </Text>
              <Text style={[styles.streakSubtitle, { color: theme.text.secondary }]}>
                {canClaimDailyReward
                  ? `Tap to claim Day ${previewStreak} · +${previewReward} coins`
                  : longestStreak > streak
                  ? `Best streak: ${longestStreak} days`
                  : 'Come back tomorrow to keep it going'}
              </Text>
            </View>

            {canClaimDailyReward && (
              <View style={[styles.streakClaimPill, { backgroundColor: accentColor }]}>
                <Text style={styles.streakClaimPillText}>Claim</Text>
              </View>
            )}
          </PressableScale>

          {currentEntry && (
            <View style={styles.swiperArea}>
              <View style={styles.topRow}>

                <View style={styles.uploadColumn}>

                  {currentEntry.confirmed && (
                    <View style={styles.nameRow}>
                      {currentEntry.selectedEmoji && (
                        <PressableScale
                          style={[
                            styles.avatarBox,
                            { backgroundColor: currentEntry.color ?? '#fff' },
                          ]}
                          onPress={() =>
                            setAvatarModalState({
                              entryId: currentEntry.id,
                              category: currentEntry.category!,
                              variantsOnly: true,
                            })
                          }
                        >
                          <AvatarDisplay
                            category={currentEntry.category}
                            emoji={currentEntry.selectedEmoji}
                            color={currentEntry.color}
                            size={50}
                            variant="face"
                            transparentBackdrop
                          />
                          <View style={styles.avatarBoxEditDot}>
                            <MaterialCommunityIcons
                              name="pencil"
                              size={10}
                              color="#fff"
                            />
                          </View>
                        </PressableScale>
                      )}

                      <View style={styles.nameInputWrapper}>
                        <TextInput
                          style={[styles.nameInput, { color: accentColor }]}
                          placeholder="Pet's name"
                          placeholderTextColor="#aaa"
                          value={currentEntry.name}
                          onChangeText={(text) =>
                            updateEntry(currentEntry.id, { name: text })
                          }
                        />
                      </View>
                    </View>
                  )}

                  <View style={styles.uploadBoxWrapper}>

                    {isFirstLaunch && !currentEntry.photoUri && (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.uploadGlow,
                          {
                            backgroundColor: accentColor,
                            shadowColor: accentColor,
                            opacity: glowOpacity,
                            transform: [{ scale: glowScale }],
                          },
                        ]}
                      />
                    )}

                    {currentEntry.photoUri && (
                      <PressableScale
                        style={styles.deleteBadge}
                        onPress={() => handleDeleteEntry(currentEntry.id)}
                      >
                        <MaterialCommunityIcons
                          name="trash-can-outline"
                          size={16}
                          color="#fff"
                        />
                      </PressableScale>
                    )}

                    <Animated.View
                      {...panResponder.panHandlers}
                      style={[
                        styles.uploadBoxShadow,
                        { opacity: fadeAnim },
                      ]}
                    >
                      <PressableScale
                        style={styles.uploadBox}
                        onPress={() =>
                          handleUpload(currentEntry.id)
                        }
                      >
                        {currentEntry.photoUri ? (
                          <Image
                            source={{
                              uri: currentEntry.photoUri,
                            }}
                            style={styles.uploadedImage}
                          />
                        ) : (
                          <View style={styles.uploadEmptyState}>
                            <MaterialCommunityIcons
                              name="paw"
                              size={32}
                              color="#FFB067"
                              style={styles.uploadIcon}
                            />
                            <Text style={styles.uploadText}>
                              {currentIndex === 0
                                ? 'Tap to upload a photo of your pet'
                                : 'Tap to upload another photo'}
                            </Text>
                          </View>
                        )}
                      </PressableScale>
                    </Animated.View>

                  </View>

                </View>

                {currentEntry.confirmed && (
                  <View style={styles.attributesSide}>
                    {ATTRIBUTES.map((attr) => (
                      <View
                        key={attr.key}
                        style={styles.attributeRowSide}
                      >
                        <Text style={[styles.attributeLabelSide, { color: theme.text.primary }]}>
                          {attr.label}
                        </Text>

                        <PawRating
                          value={
                            currentEntry.ratings[
                              attr.key as keyof AttributeRatings
                            ]
                          }
                        />
                      </View>
                    ))}
                  </View>
                )}

              </View>

              {entries.length > 1 && (
                <View style={styles.carouselControls}>
                  <PressableScale
                    onPress={goLeft}
                    disabled={currentIndex === 0}
                    style={[
                      styles.arrowButton,
                      currentIndex === 0 && styles.arrowButtonDisabled,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="chevron-left"
                      size={20}
                      color={theme.text.primary}
                    />
                  </PressableScale>

                  <View style={styles.dotsRow}>
                    {entries.map((entry, i) => (
                      <PressableScale
                        key={entry.id}
                        onPress={() => goToIndex(i)}
                        hitSlop={8}
                      >
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: withAlpha(theme.text.primary, 0.35) },
                            i === currentIndex && styles.dotActive,
                            i === currentIndex && { backgroundColor: theme.text.primary },
                          ]}
                        />
                      </PressableScale>
                    ))}
                  </View>

                  <PressableScale
                    onPress={goRight}
                    disabled={currentIndex === entries.length - 1}
                    style={[
                      styles.arrowButton,
                      currentIndex === entries.length - 1 &&
                        styles.arrowButtonDisabled,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={theme.text.primary}
                    />
                  </PressableScale>
                </View>
              )}

              {currentEntry.photoUri && !currentEntry.confirmed && (
                <View style={styles.pickerSection}>
                  {!currentEntry.category ? (
                    <PressableScale
                      style={styles.chooseTypeButton}
                      onPress={() => setCategoryModalId(currentEntry.id)}
                    >
                      <Text style={[styles.chooseTypeButtonText, { color: accentColor }]}>
                        What kind of pet is this?
                      </Text>
                      <MaterialCommunityIcons
                        name="chevron-down"
                        size={20}
                        color={accentColor}
                      />
                    </PressableScale>
                  ) : (
                    <View style={styles.pickerRow}>
                      <View
                        style={[
                          styles.smallAvatarBox,
                          {
                            backgroundColor:
                              currentEntry.color ??
                              'rgba(255,255,255,0.6)',
                          },
                        ]}
                      >
                        <AvatarDisplay
                          category={currentEntry.category}
                          emoji={
                            currentEntry.selectedEmoji ??
                            categoryMeta(currentEntry.category).emoji
                          }
                          color={currentEntry.color}
                          size={48}
                          variant="face"
                          transparentBackdrop
                        />
                      </View>

                      <View style={styles.dropdownWrapper}>
                        <PressableScale
                          style={styles.dropdownButton}
                          onPress={() =>
                            setAvatarModalState({
                              entryId: currentEntry.id,
                              category: currentEntry.category!,
                            })
                          }
                        >
                          <Text style={[styles.dropdownButtonText, { color: accentColor }]}>
                            {currentEntry.selectedEmoji
                              ? findAvatarOption(
                                  currentEntry.category,
                                  currentEntry.selectedEmoji,
                                  currentEntry.color
                                )?.label ?? 'Choose your avatar'
                              : `Choose your ${categoryMeta(
                                  currentEntry.category
                                ).label.toLowerCase()}`}
                          </Text>

                          <MaterialCommunityIcons
                            name="chevron-down"
                            size={20}
                            color={accentColor}
                          />
                        </PressableScale>

                        <PressableScale
                          style={styles.changeTypeLink}
                          onPress={() =>
                            handleChangeCategory(currentEntry.id)
                          }
                        >
                          <Text style={[styles.changeTypeLinkText, { color: withAlpha(theme.text.primary, 0.85) }]}>
                            Change pet type
                          </Text>
                        </PressableScale>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {currentEntry.photoUri &&
                !currentEntry.confirmed &&
                currentEntry.selectedEmoji && (
                  <PressableScale
                    style={styles.confirmButton}
                    onPress={() =>
                      handleConfirm(currentEntry.id)
                    }
                  >
                    <Text style={[styles.confirmButtonText, { color: accentColor }]}>
                      Confirm Avatar
                    </Text>
                  </PressableScale>
                )}

            </View>
          )}

          {/* Category picker modal */}
          <Modal
            visible={categoryModalId !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setCategoryModalId(null)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setCategoryModalId(null)}
            >
              <View style={styles.dropdownMenu}>
                <Text style={styles.modalTitle}>Choose pet type</Text>
                <ScrollView>
                  {PET_CATEGORIES.map((cat) => (
                    <PressableScale
                      key={cat.key}
                      style={styles.dropdownItem}
                      onPress={() =>
                        categoryModalId &&
                        handleSelectCategory(categoryModalId, cat.key)
                      }
                    >
                      <Text style={styles.dropdownItemEmoji}>
                        {cat.emoji}
                      </Text>

                      <Text style={styles.dropdownItemText}>
                        {cat.label}
                      </Text>
                    </PressableScale>
                  ))}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>

          {/* Avatar picker modal */}
          <Modal
            visible={avatarModalState !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setAvatarModalState(null)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setAvatarModalState(null)}
            >
              <View style={styles.dropdownMenu}>
                <Text style={styles.modalTitle}>
                  {avatarModalState?.variantsOnly
                    ? 'Choose a look'
                    : `${
                        avatarModalState
                          ? categoryMeta(avatarModalState.category).label
                          : ''
                      } avatars`}
                </Text>
                <ScrollView>
                  {avatarModalState &&
                    avatarModalOptions.map(
                      (option) => {
                        const locked = isAvatarLocked(option);

                        return (
                          <PressableScale
                            key={`${option.emoji}-${option.color}`}
                            style={styles.dropdownItem}
                            onPress={() => {
                              if (locked) {
                                Alert.alert(
                                  'Locked avatar',
                                  `Unlock "${option.label}" in the Paw Shop to use this look.`
                                );
                                return;
                              }
                              handleSelectAvatar(
                                avatarModalState.entryId,
                                option
                              );
                            }}
                          >
                            <View
                              style={[
                                styles.avatarSwatch,
                                { backgroundColor: option.color },
                                locked && styles.avatarSwatchLocked,
                              ]}
                            >
                              <AvatarDisplay
                                category={avatarModalState.category}
                                emoji={option.emoji}
                                color={option.color}
                                size={28}
                                variant="face"
                                transparentBackdrop
                                style={locked ? { opacity: 0.35 } : undefined}
                              />

                              {locked && (
                                <View style={styles.lockBadge}>
                                  <MaterialCommunityIcons
                                    name="lock"
                                    size={12}
                                    color="#fff"
                                  />
                                </View>
                              )}
                            </View>

                            <Text
                              style={[
                                styles.dropdownItemText,
                                locked && styles.dropdownItemTextLocked,
                              ]}
                            >
                              {option.label}
                              {locked ? '  🔒 Paw Shop' : ''}
                            </Text>
                          </PressableScale>
                        );
                      }
                    )}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>

          {/* Delete-pet confirmation modal */}
          <Modal
            visible={deleteConfirmId !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setDeleteConfirmId(null)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setDeleteConfirmId(null)}
            >
              <View style={styles.confirmCard}>
                <Text style={styles.modalTitle}>Remove this pet?</Text>
                <Text style={styles.confirmBody}>
                  {(() => {
                    const entry = entries.find(
                      (e) => e.id === deleteConfirmId
                    );
                    const label = entry?.name
                      ? `${entry.name}'s`
                      : "this pet's";
                    return `This will permanently delete ${label} photo, profile, and stats. This can't be undone.`;
                  })()}
                </Text>

                <View style={styles.confirmButtonRow}>
                  <PressableScale
                    style={styles.confirmCancelButton}
                    onPress={() => setDeleteConfirmId(null)}
                  >
                    <Text style={styles.confirmCancelButtonText}>
                      Cancel
                    </Text>
                  </PressableScale>

                  <PressableScale
                    style={styles.confirmDeleteButton}
                    onPress={confirmDeleteEntry}
                  >
                    <Text style={styles.confirmDeleteButtonText}>
                      Delete
                    </Text>
                  </PressableScale>
                </View>
              </View>
            </Pressable>
          </Modal>

          <SettingsMenu
            visible={settingsVisible}
            onClose={() => setSettingsVisible(false)}
            accentOptions={ACCENT_COLORS}
            activeAccentKey={accentKey}
            onSelectAccent={(key) => setAccentKey(key as typeof accentKey)}
            toggles={[
              {
                key: 'haptics',
                label: 'Haptic Feedback',
                icon: 'vibrate',
                value: hapticsEnabled,
                onToggle: setHapticsEnabled,
              },
            ]}
            options={[
              {
                key: 'replay-tutorial',
                label: 'Replay Tutorial',
                icon: 'play-circle-outline',
                onPress: replayOnboarding,
              },
              {
                key: 'export-data',
                label: 'Export My Data',
                icon: 'export-variant',
                onPress: handleExportData,
              },
              {
                key: 'send-feedback',
                label: 'Send Feedback',
                icon: 'email-outline',
                onPress: handleSendFeedback,
              },
              {
                key: 'logout',
                label: 'Log Out',
                icon: 'logout',
                destructive: true,
                onPress: signOut,
              },
              {
                key: 'delete-account',
                label: 'Delete Account',
                icon: 'delete-outline',
                destructive: true,
                onPress: handleDeleteAccount,
              },
            ]}
            footerText={`Pawsona v${Constants.expoConfig?.version ?? '1.0.0'}`}
          />

          <DailyRewardModal
            visible={rewardModalVisible}
            streakDay={previewStreak}
            reward={previewReward}
            onClaim={handleClaimDailyReward}
            onClose={() => setRewardModalVisible(false)}
          />

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
  },

  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 20,
    paddingTop: 70,
  },

  header: {
    alignItems: 'center',
    marginBottom: 18,
  },

  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 24,
    gap: 12,
  },

  streakIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  streakTextColumn: {
    flex: 1,
  },

  streakTitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    fontWeight: '700',
  },

  streakSubtitle: {
    fontFamily: 'Fredoka_400Regular',
    fontSize: 12,
    marginTop: 2,
  },

  streakClaimPill: {
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },

  streakClaimPillText: {
    fontFamily: 'Fredoka_700Bold',
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  settingsButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoImage: {
    height: 84,
    aspectRatio: 1970 / 493,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4, // Android equivalent — shadow* alone is iOS-only.
  },

  subtitle: {
    fontFamily: 'Fredoka_400Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    textAlign: 'center',
  },

  swiperArea: {
    alignItems: 'center',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  carouselControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 18,
  },

  arrowButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  arrowButtonDisabled: {
    opacity: 0.3,
  },

  uploadColumn: {
    alignItems: 'center',
    width: 230,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 6,
    marginLeft: -40,
  },

  nameInputWrapper: {
    flex: 1,
  },

  nameInput: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    color: '#FF8C42',
    textAlign: 'center',
  },

  uploadBoxWrapper: {
    position: 'relative',
  },

  deleteBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    zIndex: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220,60,60,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  uploadGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    width: 190,
    height: 190,
    borderRadius: 34,
    backgroundColor: '#FF8C42',
    shadowColor: '#FF8C42',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 8,
  },

  uploadBoxShadow: {
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },

  uploadBox: {
    width: 170,
    height: 170,
    borderRadius: 24,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },

  uploadEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  uploadIcon: {
    marginBottom: 8,
  },

  uploadText: {
    fontFamily: 'Fredoka_400Regular',
    textAlign: 'center',
    color: '#888',
    paddingHorizontal: 10,
  },

  uploadedImage: {
    width: '100%',
    height: '100%',
  },

  avatarBox: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  avatarBoxEditDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  dotActive: {
    backgroundColor: '#fff',
    width: 20,
  },

  attributesSide: {
    marginLeft: -10,
    marginTop: 55,
    gap: 10,
    justifyContent: 'center',
  },

  attributeRowSide: {
    alignItems: 'flex-start',
    gap: 2,
  },

  attributeLabelSide: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#fff',
    fontSize: 11,
  },

  pawsRow: {
    flexDirection: 'row',
    gap: 2,
  },

  pickerSection: {
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },

  chooseTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
  },

  chooseTypeButtonText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#FF8C42',
    fontSize: 14,
  },

  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },

  smallAvatarBox: {
    width: 70,
    height: 70,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dropdownWrapper: {
    flex: 1,
  },

  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
  },

  dropdownButtonText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#FF8C42',
    fontSize: 14,
  },

  changeTypeLink: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginLeft: 4,
  },

  changeTypeLinkText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    textDecorationLine: 'underline',
  },

  confirmButton: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 16,
    alignSelf: 'center',
  },

  confirmButtonText: {
    fontFamily: 'Fredoka_700Bold',
    color: '#FF8C42',
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  dropdownMenu: {
    width: '80%',
    maxHeight: 380,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
  },

  modalTitle: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },

  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },

  dropdownItemEmoji: {
    fontSize: 28,
  },

  dropdownItemText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#333',
  },

  confirmCard: {
    width: '82%',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },

  confirmBody: {
    fontFamily: 'Fredoka_400Regular',
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 18,
  },

  confirmButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },

  confirmCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },

  confirmCancelButtonText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    color: '#555',
  },

  confirmDeleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC3C3C',
  },

  confirmDeleteButtonText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },

  avatarSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarSwatchLocked: {
    opacity: 0.6,
  },

  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#8C6C4B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  dropdownItemTextLocked: {
    color: '#999',
  },
});