import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, withAlpha } from "../../context/ThemeContext";
import { PressableScale } from "./PressableScale";

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

// A pale swatch (e.g. the White theme's dot) needs a dark checkmark instead
// of the usual white one, or it's invisible against its own fill.
function checkColorFor(swatchHex: string): string {
  const clean = swatchHex.replace("#", "");
  if (clean.length !== 6) return "#fff";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.75 ? "#1C1C1E" : "#fff";
}

// A bottom-sheet style settings menu, opened from the gear icon on the
// Home tab. Takes a list of options (Log Out, Replay Tutorial, ...) plus
// an optional row of theme swatches, so more of either can be added later
// without touching the sheet itself. The sheet's own colors follow the
// active theme (see context/ThemeContext.tsx) — picking "White" here makes
// the sheet itself go light too, not just the screen behind it.
export function SettingsMenu({
  visible,
  onClose,
  options,
  accentOptions,
  activeAccentKey,
  onSelectAccent,
}: Props) {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.card.background, borderColor: theme.card.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: withAlpha(theme.text.primary, 0.2) }]} />
          <Text style={[styles.title, { color: theme.text.secondary }]}>Settings</Text>

          {accentOptions && accentOptions.length > 0 && (
            <View style={[styles.themeSection, { borderBottomColor: theme.card.border }]}>
              <Text style={[styles.themeLabel, { color: theme.text.primary }]}>Theme Color</Text>
              <View style={styles.swatchRow}>
                {accentOptions.map((swatch) => {
                  const isActive = swatch.key === activeAccentKey;
                  return (
                    <PressableScale
                      key={swatch.key}
                      onPress={() => onSelectAccent?.(swatch.key)}
                      style={styles.swatchWrapper}
                    >
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: swatch.value,
                            borderWidth: isActive ? 2 : 1,
                            borderColor: isActive
                              ? theme.text.primary
                              : withAlpha(theme.text.primary, 0.15),
                          },
                        ]}
                      >
                        {isActive && (
                          <MaterialCommunityIcons
                            name="check"
                            size={16}
                            color={checkColorFor(swatch.value)}
                          />
                        )}
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          )}

          {options.map((option, index) => (
            <PressableScale
              key={option.key}
              style={[
                styles.optionRow,
                { borderBottomColor: theme.card.border },
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
                color={option.destructive ? "#FF6B6B" : theme.text.primary}
                style={styles.optionIcon}
              />
              <Text
                style={[
                  styles.optionText,
                  { color: theme.text.primary },
                  option.destructive && styles.optionTextDestructive,
                ]}
              >
                {option.label}
              </Text>
            </PressableScale>
          ))}

          <PressableScale
            style={[styles.cancelButton, { backgroundColor: withAlpha(theme.text.primary, 0.06) }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelButtonText, { color: theme.text.primary }]}>Cancel</Text>
          </PressableScale>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderWidth: 1,
    borderBottomWidth: 0,
  },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },

  title: {
    fontSize: 13,
    fontWeight: "700",
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
  },

  themeLabel: {
    fontSize: 15,
    fontWeight: "600",
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

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  },

  optionTextDestructive: {
    color: "#FF6B6B",
  },

  cancelButton: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },

  cancelButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
