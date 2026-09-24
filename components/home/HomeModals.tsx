import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AvatarDisplay } from "../ui/AvatarDisplay";
import { PressableScale } from "../ui/PressableScale";
import { CLAY_RED, PARCHMENT, WOOD_DARK, WOOD_MID } from "../../constants/backyard-theme";
import { AvatarOption, PET_CATEGORIES, PetCategory } from "../../data/petcategories";

// Pop-ups used by the Home tab: pet-type picker, avatar picker, and the
// delete-pet confirmation. All share the same parchment-card look.

// Dimmed full-screen overlay; tapping outside the card closes it.
function HomeModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        {children}
      </Pressable>
    </Modal>
  );
}

export function CategoryPickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (category: PetCategory) => void;
}) {
  return (
    <HomeModal visible={visible} onClose={onClose}>
      <View style={styles.dropdownMenu}>
        <Text style={styles.modalTitle}>Choose pet type</Text>
        <ScrollView>
          {PET_CATEGORIES.map((cat) => (
            <PressableScale key={cat.key} style={styles.dropdownItem} onPress={() => onSelect(cat.key)}>
              <Text style={styles.dropdownItemEmoji}>{cat.emoji}</Text>
              <Text style={styles.dropdownItemText}>{cat.label}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      </View>
    </HomeModal>
  );
}

export function AvatarPickerModal({
  visible,
  title,
  category,
  options,
  isLocked,
  onClose,
  onSelect,
  onSelectLocked,
}: {
  visible: boolean;
  title: string;
  category: PetCategory | null;
  options: AvatarOption[];
  isLocked: (option: AvatarOption) => boolean;
  onClose: () => void;
  onSelect: (option: AvatarOption) => void;
  onSelectLocked: (option: AvatarOption) => void;
}) {
  return (
    <HomeModal visible={visible} onClose={onClose}>
      <View style={styles.dropdownMenu}>
        <Text style={styles.modalTitle}>{title}</Text>
        <ScrollView>
          {category &&
            options.map((option) => {
              const locked = isLocked(option);
              return (
                <PressableScale
                  key={`${option.emoji}-${option.color}`}
                  style={styles.dropdownItem}
                  onPress={() => (locked ? onSelectLocked(option) : onSelect(option))}
                >
                  <View style={[styles.avatarSwatch, { backgroundColor: option.color }, locked && styles.avatarSwatchLocked]}>
                    <AvatarDisplay
                      category={category}
                      emoji={option.emoji}
                      color={option.color}
                      size={28}
                      variant="face"
                      transparentBackdrop
                      style={locked ? { opacity: 0.35 } : undefined}
                    />
                    {locked && (
                      <View style={styles.lockBadge}>
                        <MaterialCommunityIcons name="lock" size={12} color="#fff" />
                      </View>
                    )}
                  </View>

                  <Text style={[styles.dropdownItemText, locked && styles.dropdownItemTextLocked]}>
                    {option.label}
                    {locked ? "  🔒 Paw Shop" : ""}
                  </Text>
                </PressableScale>
              );
            })}
        </ScrollView>
      </View>
    </HomeModal>
  );
}

export function DeletePetModal({
  visible,
  petName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  petName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = petName ? `${petName}'s` : "this pet's";
  return (
    <HomeModal visible={visible} onClose={onCancel}>
      <View style={styles.confirmCard}>
        <Text style={styles.modalTitle}>Remove this pet?</Text>
        <Text style={styles.confirmBody}>
          {`This will permanently delete ${label} photo, profile, and stats. This can't be undone.`}
        </Text>

        <View style={styles.confirmButtonRow}>
          <PressableScale style={styles.confirmCancelButton} onPress={onCancel}>
            <Text style={styles.confirmCancelButtonText}>Cancel</Text>
          </PressableScale>
          <PressableScale style={styles.confirmDeleteButton} onPress={onConfirm}>
            <Text style={styles.confirmDeleteButtonText}>Delete</Text>
          </PressableScale>
        </View>
      </View>
    </HomeModal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(20, 10, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownMenu: {
    width: "80%",
    maxHeight: 380,
    backgroundColor: PARCHMENT,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: WOOD_MID,
    paddingVertical: 8,
  },
  modalTitle: {
    fontFamily: "Fredoka_700Bold",
    fontSize: 15,
    color: WOOD_DARK,
    textAlign: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(107, 74, 40, 0.18)",
  },
  dropdownItemEmoji: {
    fontSize: 28,
  },
  dropdownItemText: {
    fontFamily: "Fredoka_600SemiBold",
    fontSize: 15,
    color: WOOD_DARK,
  },
  dropdownItemTextLocked: {
    color: "#A89880",
  },
  avatarSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: WOOD_MID,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSwatchLocked: {
    opacity: 0.6,
  },
  lockBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: WOOD_MID,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: PARCHMENT,
  },
  confirmCard: {
    width: "82%",
    backgroundColor: PARCHMENT,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: WOOD_MID,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  confirmBody: {
    fontFamily: "Fredoka_400Regular",
    fontSize: 13,
    color: WOOD_MID,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 18,
  },
  confirmButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(107, 74, 40, 0.14)",
  },
  confirmCancelButtonText: {
    fontFamily: "Fredoka_600SemiBold",
    fontSize: 14,
    color: WOOD_MID,
  },
  confirmDeleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CLAY_RED,
  },
  confirmDeleteButtonText: {
    fontFamily: "Fredoka_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
});
