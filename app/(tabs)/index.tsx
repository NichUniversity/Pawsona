import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AvatarDisplay, findAvatarOption } from '../../components/ui/AvatarDisplay';
import {
  AttributeRatings,
  EMPTY_RATINGS,
  makeEmptyEntry,
  PetEntry,
  usePets
} from '../../context/PetInformation';
import {
  AVATAR_OPTIONS,
  AvatarOption,
  PET_CATEGORIES,
  PetCategory,
} from '../../data/petcategories';

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
  return (
    <View style={styles.pawsRow}>
      {[1, 2, 3, 4, 5].map((paw) => (
        <MaterialCommunityIcons
          key={paw}
          name={paw <= value ? 'paw' : 'paw-outline'}
          size={18}
          color={paw <= value ? '#fff' : 'rgba(255,255,255,0.35)'}
        />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const { pets: entries, setPets: setEntries } = usePets();

  const [categoryModalId, setCategoryModalId] = useState<string | null>(null);
  const [avatarModalState, setAvatarModalState] = useState<{
    entryId: string;
    category: PetCategory;
  } | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);

  const fadeAnim = useRef(new Animated.Value(1)).current;

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

  const hasConfirmedPet = entries.some((e) => e.confirmed);

  return (
    <View style={styles.screen}>
      <ImageBackground
        source={require('../../assets/images/paw-background.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>

          <View style={styles.header}>
            <Text style={styles.title}>Pawsona</Text>
            <Text style={styles.subtitle}>
              {hasConfirmedPet
                ? 'Your pet pals, ready for adventure 🐾'
                : 'Upload a photo to bring your pet to life'}
            </Text>
          </View>

          {currentEntry && (
            <View style={styles.swiperArea}>
              <View style={styles.topRow}>

                <View style={styles.uploadColumn}>

                  {currentEntry.confirmed && (
                    <View style={styles.nameInputWrapper}>
                      <TextInput
                        style={styles.nameInput}
                        placeholder="Pet's name"
                        placeholderTextColor="#aaa"
                        value={currentEntry.name}
                        onChangeText={(text) =>
                          updateEntry(currentEntry.id, { name: text })
                        }
                      />
                    </View>
                  )}

                  <View style={styles.uploadBoxWrapper}>

                    {currentEntry.confirmed && currentEntry.selectedEmoji && (
                      <View
                        style={[
                          styles.avatarBadge,
                          { backgroundColor: currentEntry.color ?? '#fff' },
                        ]}
                      >
                        <AvatarDisplay
                          category={currentEntry.category}
                          emoji={currentEntry.selectedEmoji}
                          color={currentEntry.color}
                          size={28}
                        />
                      </View>
                    )}

                    <Animated.View
                      {...panResponder.panHandlers}
                      style={[
                        styles.uploadBoxShadow,
                        { opacity: fadeAnim },
                      ]}
                    >
                      <Pressable
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
                      </Pressable>
                    </Animated.View>

                    <Pressable
                      onPress={goLeft}
                      disabled={currentIndex === 0}
                      style={[
                        styles.arrowButtonOverlay,
                        styles.arrowButtonLeft,
                        currentIndex === 0 && styles.arrowButtonDisabled,
                      ]}
                      >
                        <MaterialCommunityIcons
                        name="chevron-left"
                        size={22}
                        color="#fff"
                      />
                    </Pressable>

                    <Pressable
                      onPress={goRight}
                      disabled={currentIndex === entries.length - 1}
                      style={[
                        styles.arrowButtonOverlay,
                        styles.arrowButtonRight,
                        currentIndex === entries.length - 1 &&
                          styles.arrowButtonDisabled,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={22}
                        color="#fff"
                      />
                    </Pressable>

                  </View>

                </View>

                {currentEntry.confirmed && (
                  <View style={styles.attributesSide}>
                    {ATTRIBUTES.map((attr) => (
                      <View
                        key={attr.key}
                        style={styles.attributeRowSide}
                      >
                        <Text style={styles.attributeLabelSide}>
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
                <View style={styles.dotsRow}>
                  {entries.map((entry, i) => (
                    <Pressable
                      key={entry.id}
                      onPress={() => goToIndex(i)}
                      hitSlop={8}
                    >
                      <View
                        style={[
                          styles.dot,
                          i === currentIndex && styles.dotActive,
                        ]}
                      />
                    </Pressable>
                  ))}
                </View>
              )}

              {currentEntry.photoUri && !currentEntry.confirmed && (
                <View style={styles.pickerSection}>
                  {!currentEntry.category ? (
                    <Pressable
                      style={styles.chooseTypeButton}
                      onPress={() => setCategoryModalId(currentEntry.id)}
                    >
                      <Text style={styles.chooseTypeButtonText}>
                        What kind of pet is this?
                      </Text>
                      <MaterialCommunityIcons
                        name="chevron-down"
                        size={20}
                        color="#FF8C42"
                      />
                    </Pressable>
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
                        />
                      </View>

                      <View style={styles.dropdownWrapper}>
                        <Pressable
                          style={styles.dropdownButton}
                          onPress={() =>
                            setAvatarModalState({
                              entryId: currentEntry.id,
                              category: currentEntry.category!,
                            })
                          }
                        >
                          <Text style={styles.dropdownButtonText}>
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
                            color="#FF8C42"
                          />
                        </Pressable>

                        <Pressable
                          style={styles.changeTypeLink}
                          onPress={() =>
                            handleChangeCategory(currentEntry.id)
                          }
                        >
                          <Text style={styles.changeTypeLinkText}>
                            Change pet type
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              )}

              {currentEntry.photoUri &&
                !currentEntry.confirmed &&
                currentEntry.selectedEmoji && (
                  <Pressable
                    style={styles.confirmButton}
                    onPress={() =>
                      handleConfirm(currentEntry.id)
                    }
                  >
                    <Text style={styles.confirmButtonText}>
                      Confirm Avatar
                    </Text>
                  </Pressable>
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
                    <Pressable
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
                    </Pressable>
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
                  {avatarModalState
                    ? categoryMeta(avatarModalState.category).label
                    : ''}{' '}
                  avatars
                </Text>
                <ScrollView>
                  {avatarModalState &&
                    AVATAR_OPTIONS[avatarModalState.category].map(
                      (option) => (
                        <Pressable
                          key={`${option.emoji}-${option.color}`}
                          style={styles.dropdownItem}
                          onPress={() =>
                            handleSelectAvatar(
                              avatarModalState.entryId,
                              option
                            )
                          }
                        >
                          <View
                            style={[
                              styles.avatarSwatch,
                              { backgroundColor: option.color },
                            ]}
                          >
                            <AvatarDisplay
                              category={avatarModalState.category}
                              emoji={option.emoji}
                              color={option.color}
                              size={28}
                            />
                          </View>

                          <Text style={styles.dropdownItemText}>
                            {option.label}
                          </Text>
                        </Pressable>
                      )
                    )}
                </ScrollView>
              </View>
            </Pressable>
          </Modal>

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
    marginBottom: 36,
  },

  title: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 42,
    color: '#fff',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
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

  arrowButtonOverlay: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },

  arrowButtonLeft: {
    left: 6,
  },

  arrowButtonRight: {
    right: 6,
  },

  arrowButtonDisabled: {
    opacity: 0.3,
  },

  uploadColumn: {
    alignItems: 'center',
    width: 170,
  },

  nameInputWrapper: {
    width: '100%',
    marginBottom: 10,
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

  avatarBadge: {
    position: 'absolute',
    top: -10,
    left: -10,
    zIndex: 6,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  sideAvatarEmoji: {
    fontSize: 22,
  },

  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
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
    marginLeft: 8,
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

  smallAvatarEmoji: {
    fontSize: 36,
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

  avatarSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarSwatchEmoji: {
    fontSize: 20,
  },
});