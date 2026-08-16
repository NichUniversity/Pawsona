import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export type SettingsOption = {
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

export type AccentSwatch = {
  key: string;
  label: string;
  value: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  options: SettingsOption[];
  accentOptions?: AccentSwatch[];
  activeAccentKey?: string;
  onSelectAccent?: (key: string) => void;
};

// A bottom-sheet style settings menu, opened from the gear icon on the
// Home tab. Takes a list of options (Log Out, Replay Tutorial, ...) plus
// an optional row of accent-color swatches, so more of either can be
// added later without touching the sheet itself.
export function SettingsMenu({
  visible,
  onClose,
  options,
  accentOptions,
  activeAccentKey,
  onSelectAccent,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Settings</Text>

          {accentOptions && accentOptions.length > 0 && (
            <View style={styles.themeSection}>
              <Text style={styles.themeLabel}>Theme Color</Text>
              <View style={styles.swatchRow}>
                {accentOptions.map((swatch) => {
                  const isActive = swatch.key === activeAccentKey;
                  return (
                    <Pressable
                      key={swatch.key}
                      onPress={() => onSelectAccent?.(swatch.key)}
                      style={styles.swatchWrapper}
                    >
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: swatch.value },
                          isActive && styles.swatchActive,
                        ]}
                      >
                        {isActive && (
                          <MaterialCommunityIcons name="check" size={16} color="#fff" />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {options.map((option, index) => (
            <Pressable
              key={option.key}
              style={[
                styles.optionRow,
                index === options.length - 1 && styles.optionRowLast,
              ]}
              onPress={() => {
                onClose();
                option.onPress();
              }}
            >
              <MaterialCommunityIcons
                name={option.icon}
                size={20}
                color={option.destructive ? "#FF6B6B" : "#F5F5F5"}
                style={styles.optionIcon}
              />
              <Text
                style={[
                  styles.optionText,
                  option.destructive && styles.optionTextDestructive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}

          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },

  sheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: 0,
  },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 14,
  },

  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  themeSection: {
    paddingHorizontal: 4,
    paddingBottom: 14,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },

  themeLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#F5F5F5",
    marginBottom: 12,
  },

  swatchRow: {
    flexDirection: "row",
    gap: 14,
  },

  swatchWrapper: {
    padding: 2,
  },

  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  swatchActive: {
    borderWidth: 2,
    borderColor: "#fff",
  },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },

  optionRowLast: {
    borderBottomWidth: 0,
  },

  optionIcon: {
    marginRight: 12,
  },

  optionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F5F5F5",
  },

  optionTextDestructive: {
    color: "#FF6B6B",
  },

  cancelButton: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },

  cancelButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F5F5F5",
  },
});
