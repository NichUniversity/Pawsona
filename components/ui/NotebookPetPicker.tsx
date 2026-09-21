import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { WOOD_DARK } from "../../constants/pet-log-theme";
import { PetEntry } from "../../context/PetInformation";
import { AvatarDisplay } from "./AvatarDisplay";
import { CoinIcon } from "./CoinIcon";
import { PressableScale } from "./PressableScale";

// The "Choose your pet" screen, written *on* the notebook-paper art
// (assets/backgrounds/daily_log_notebook_paper.png) instead of floating dark cards over it: the
// title and every pet are handwritten entries sitting on the notebook's own ruled lines, and tapping
// an entry opens that pet's almanac page.
//
// Alignment works the same way the Minigames tab lines content up with its arcade-cabinet screen
// glass: nothing is measured at runtime. The background Image uses resizeMode="contain", so the
// on-screen position of every ruled line is computed from the window size with the same contain-fit
// math (useWindowDimensions is the one layout source this codebase trusts inside the tab pager).
// The measurements below were taken directly off the 852x1846 asset — if the art is ever swapped,
// re-measure them: 19 ruled lines from y=266.5 to y=1540.5, the red margin line at x~69, ruled
// lines running x~14 to x~836, and the paw stamp in the top-right corner (y~110-245, x~665-830).
export const NOTEBOOK_IMAGE_WIDTH = 852;
export const NOTEBOOK_IMAGE_HEIGHT = 1846;

const FIRST_RULE_Y = 266.5;
const RULE_COUNT = 19;
const RULE_PITCH = (1540.5 - 266.5) / (RULE_COUNT - 1); // ~70.78px between ruled lines
const TEXT_LEFT_X = 92; // clears the red margin line with a little breathing room
const TEXT_RIGHT_X = 815; // just inside where the ruled lines end
const TITLE_RIGHT_X = 640; // stops short of the paw stamp in the top-right corner
const MARGIN_NUMBER_X = 10; // numbers live in the margin, left of the red line
const MARGIN_NUMBER_WIDTH = 40; // right edge lands at x~50, clear of the red line at x~69

// Pen for the entries, darker pencil-brown for the title (matches the almanac's wood tones).
const INK_COLOR = "#2B3A6B";
const PENCIL_COLOR = "#9C8E7A";
const HIGHLIGHTER_COLOR = "rgba(255, 221, 87, 0.5)";

// Handwriting faces that ship with the OS, so this needs no extra font dependency.
const HANDWRITING_FONT = Platform.select({
  ios: "Noteworthy-Bold",
  android: "cursive",
  default: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
});

// Tiny per-row tilt so the list reads as hand-written rather than typeset (deterministic, no flicker).
const WOBBLE_DEGREES = [-0.8, 0.5, -0.4, 0.9, -0.6, 0.3, -0.9, 0.6];

type NotebookGeometry = ReturnType<typeof computeNotebookGeometry>;

function computeNotebookGeometry(width: number, height: number) {
  const scale = Math.min(
    width / NOTEBOOK_IMAGE_WIDTH,
    height / NOTEBOOK_IMAGE_HEIGHT
  );
  const offsetX = (width - NOTEBOOK_IMAGE_WIDTH * scale) / 2;
  const offsetY = (height - NOTEBOOK_IMAGE_HEIGHT * scale) / 2;

  return {
    width,
    height,
    pitch: RULE_PITCH * scale,
    firstRuleY: offsetY + FIRST_RULE_Y * scale,
    textLeft: offsetX + TEXT_LEFT_X * scale,
    textRight: offsetX + TEXT_RIGHT_X * scale,
    titleRight: offsetX + TITLE_RIGHT_X * scale,
    marginNumberLeft: offsetX + MARGIN_NUMBER_X * scale,
    marginNumberWidth: MARGIN_NUMBER_WIDTH * scale,
  };
}

type Props = {
  /** Already filtered to confirmed pets. */
  pets: PetEntry[];
  coins: number;
  accentColor: string;
  /** Space to keep clear at the bottom for the floating tab bar. */
  bottomClearance: number;
  onSelect: (pet: PetEntry) => void;
};

export function NotebookPetPicker({
  pets,
  coins,
  accentColor,
  bottomClearance,
  onSelect,
}: Props) {
  const { width, height } = useWindowDimensions();
  const geo = computeNotebookGeometry(width, height);
  const { pitch, firstRuleY } = geo;

  // Entries sit in the row *above* each ruled line, starting with the row under the title. Only as
  // many rows as fit above the last ruled line (and clear of the tab bar) are shown at once; more
  // pets than that scroll in whole-row steps so entries always land back on a line.
  const lastRuleY = firstRuleY + (RULE_COUNT - 1) * pitch;
  const listBottom = Math.min(lastRuleY, height - bottomClearance);
  const visibleRows = Math.max(1, Math.floor((listBottom - firstRuleY) / pitch + 0.01));

  const titleFontSize = Math.max(18, Math.min(30, pitch * 0.86));
  const entryFontSize = Math.max(14, Math.min(26, pitch * 0.66));

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>
      <View
        style={[
          styles.coinBadge,
          { left: geo.textLeft, top: firstRuleY - pitch - 36 },
        ]}
      >
        <CoinIcon size={16} />
        <Text style={[styles.coinText, { color: accentColor }]}> {coins}</Text>
      </View>

      {/* The title is "written" in the row above the first ruled line. */}
      <View
        style={[
          styles.titleRow,
          {
            pointerEvents: "none",
            left: geo.textLeft,
            width: geo.titleRight - geo.textLeft,
            top: firstRuleY - pitch,
            height: pitch,
          },
        ]}
      >
        <Text
          style={[
            styles.title,
            {
              fontSize: titleFontSize,
              fontFamily: HANDWRITING_FONT,
              transform: [{ rotate: "-1deg" }],
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          Choose your pet
        </Text>
      </View>

      <ScrollView
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: firstRuleY,
          height: visibleRows * pitch,
        }}
        scrollEnabled={pets.length > visibleRows}
        snapToInterval={pitch}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
      >
        {pets.length === 0 ? (
          <>
            <NotebookNote geo={geo} fontSize={entryFontSize}>
              No pets written down yet...
            </NotebookNote>
            <NotebookNote geo={geo} fontSize={entryFontSize}>
              Add one on the Home tab!
            </NotebookNote>
          </>
        ) : (
          pets.map((pet, index) => (
            <NotebookPetRow
              key={pet.id}
              pet={pet}
              index={index}
              geo={geo}
              fontSize={entryFontSize}
              onPress={() => onSelect(pet)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function NotebookNote({
  geo,
  fontSize,
  children,
}: {
  geo: NotebookGeometry;
  fontSize: number;
  children: string;
}) {
  return (
    <View
      style={{
        height: geo.pitch,
        paddingLeft: geo.textLeft,
        justifyContent: "center",
      }}
    >
      <Text
        style={[styles.note, { fontSize, fontFamily: HANDWRITING_FONT }]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </View>
  );
}

function NotebookPetRow({
  pet,
  index,
  geo,
  fontSize,
  onPress,
}: {
  pet: PetEntry;
  index: number;
  geo: NotebookGeometry;
  fontSize: number;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const name = pet.name || "Unnamed Pet";
  const wobble = WOBBLE_DEGREES[index % WOBBLE_DEGREES.length];

  return (
    <PressableScale
      scaleTo={0.985}
      style={{ width: geo.width, height: geo.pitch }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}'s page`}
    >
      {/* Highlighter swipe across the entry while it's held down. */}
      {pressed && (
        <View
          style={{
            pointerEvents: "none",
            position: "absolute",
            left: geo.textLeft - 8,
            right: geo.width - geo.textRight,
            top: geo.pitch * 0.1,
            bottom: geo.pitch * 0.04,
            borderRadius: 4,
            backgroundColor: HIGHLIGHTER_COLOR,
          }}
        />
      )}

      <Text
        style={[
          styles.marginNumber,
          {
            left: geo.marginNumberLeft,
            width: geo.marginNumberWidth,
            fontSize: Math.max(11, fontSize * 0.7),
            lineHeight: geo.pitch,
            fontFamily: HANDWRITING_FONT,
          },
        ]}
      >
        {index + 1}.
      </Text>

      <View
        style={[
          styles.entry,
          {
            left: geo.textLeft,
            right: geo.width - geo.textRight,
            height: geo.pitch,
            paddingBottom: geo.pitch * 0.04,
          },
        ]}
      >
        {/* Sticker-style face doodled on the page, a touch bigger than the row. */}
        <View style={{ marginRight: 10 }}>
          <AvatarDisplay
            category={pet.category}
            emoji={pet.selectedEmoji}
            color={pet.color}
            size={geo.pitch * 0.92}
            variant="face"
            transparentBackdrop
          />
        </View>

        <Text
          style={[
            styles.entryName,
            {
              fontSize,
              lineHeight: geo.pitch * 0.9,
              fontFamily: HANDWRITING_FONT,
              transform: [{ rotate: `${wobble}deg` }],
            },
          ]}
          numberOfLines={1}
        >
          {name}
        </Text>

        <MaterialCommunityIcons
          name="chevron-right"
          size={geo.pitch * 0.7}
          color={PENCIL_COLOR}
        />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  coinBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },

  coinText: {
    fontWeight: "800",
    fontSize: 14,
  },

  titleRow: {
    position: "absolute",
    justifyContent: "center",
  },

  title: {
    color: WOOD_DARK,
    fontWeight: "800",
  },

  note: {
    color: PENCIL_COLOR,
    fontWeight: "700",
  },

  marginNumber: {
    position: "absolute",
    top: 0,
    textAlign: "right",
    color: PENCIL_COLOR,
    fontWeight: "700",
  },

  entry: {
    position: "absolute",
    top: 0,
    flexDirection: "row",
    alignItems: "center",
  },

  entryName: {
    flex: 1,
    color: INK_COLOR,
    fontWeight: "700",
  },
});
