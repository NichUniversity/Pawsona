import React, { useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { PetCategory } from "../../data/petcategories";
import { AvatarDisplay } from "./AvatarDisplay";

const BACKYARD_IMAGE = require("../../assets/backgrounds/home_backyard_sunset.png");

// home_backyard_sunset.png is 941x1672 px — measure this again if the art changes size.
//
// This renders as a manual "contain" fit (the whole picture always visible, never cropped),
// matching the Daily Paw Log notebook and the standing preference for all Pawsona background
// art. It used to be a "cover" fit (fill edge-to-edge, crop the overflow) because this art
// (941x1672, aspect ~0.56) is shorter/wider than a typical phone (~0.46), so "contain" leaves a
// band above and below it on a phone. Those bands are now filled with colors sampled from the
// art's own edges -- sky on top (LETTERBOX_TOP), patio on the bottom (LETTERBOX_BOTTOM) -- so
// they read as the scene continuing rather than a cut-off. The fit math is done by hand and the
// image is placed with explicit width/height/left/top, which is also what keeps it reliably
// *centered* on every platform (resizeMode's own centering wasn't trustworthy on
// react-native-web).
const BACKYARD_IMAGE_ASPECT = 941 / 1672;

// Fills for the "contain" letterbox bands. Top/bottom (phones): sampled from the art's top
// edge (dusk sky) and bottom edge (patio) with Pillow. Sides (wide browser windows) fall back to
// LETTERBOX_FILL, a dark dusk tone.
const LETTERBOX_FILL = "#3A2F55";
const LETTERBOX_TOP = "#665492";
const LETTERBOX_BOTTOM = "#9E6F5C";

// --- Where pets stand, as fractions of the rendered art (read off home_backyard_sunset.png).
// Every confirmed pet with an avatar gets its own spot on the open lawn, in the order the pets
// were added: the first pet takes PET_SPOTS[0], the next one PET_SPOTS[1], and so on. Pets are
// stationary (no walking animation). Spots stay clear of the fence, the front bushes, the patio
// and the middle of the lawn just under the pet card / pager arrows. A spot's y is its depth:
// pets further back (smaller y) are drawn smaller, between FAR_SCALE at the fence line and
// NEAR_SCALE at the front of the lawn, so they read as standing IN the scene.
const PET_SPOTS: { x: number; y: number }[] = [
  { x: 0.55, y: 0.82 },
  { x: 0.28, y: 0.76 },
  { x: 0.76, y: 0.74 },
  { x: 0.14, y: 0.67 },
  { x: 0.87, y: 0.66 },
  { x: 0.4, y: 0.86 },
  { x: 0.7, y: 0.86 },
  { x: 0.42, y: 0.74 },
];
// More pets than spots: reuse the spots, nudged a little so they don't stack exactly.
function spotFor(index: number): { x: number; y: number } {
  const base = PET_SPOTS[index % PET_SPOTS.length];
  const round = Math.floor(index / PET_SPOTS.length);
  if (round === 0) return base;
  const nudge = round % 2 === 1 ? 0.06 : -0.06;
  return {
    x: Math.min(0.88, Math.max(0.12, base.x + nudge)),
    y: Math.min(0.86, Math.max(0.66, base.y - 0.02 * round)),
  };
}
const LAWN_FAR_Y = 0.635; // feet line nearest the fence
const LAWN_NEAR_Y = 0.865; // feet line nearest the viewer, just above the front bushes
const FAR_SCALE = 0.62;
const NEAR_SCALE = 1.05;

// Pet box size as a fraction of the art's width (78px on a 430pt-wide phone).
const PET_SIZE_FRAC = 78 / 430;

// Grass colors sampled from the lawn itself, for the contact shadow and the blades drawn in
// front of the paws.
const GRASS_DARK = "#2F4214";
const GRASS_MID = "#4A5A1A";
const GRASS_LIGHT = "#6B7420";

export type RoomPet = {
  id: string;
  category: PetCategory;
  emoji: string;
  color?: string | null;
};

type Props = {
  /** Pets to show on the lawn, in the order they were added (each gets the next spot). */
  pets: RoomPet[];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Renders on the Home tab when "Living Home Screen" is on: the illustrated backyard-at-sunset
 * scene (assets/backgrounds/home_backyard_sunset.png) with every pet standing on the grass.
 * Toggling "Living Home Screen" off in Settings swaps this out for the plain TabBackground
 * gradient instead — see index.tsx.
 *
 * Each pet stands still in its own spot on the lawn (scaled for its depth in the scene), with a
 * soft grass-tinted contact shadow and a few grass blades drawn over its paws so it looks like
 * it's standing IN the grass rather than floating on it.
 */
export function PetRoomBackground({ pets }: Props) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Manual contain-fit: how big the art renders inside the measured container (the whole
  // picture always fits) and where its top-left lands, so the image and everything anchored to
  // it below stay centered -- see the BACKYARD_IMAGE_ASPECT comment above.
  const renderedImage = useMemo(() => {
    const { width: containerWidth, height: containerHeight } = containerSize;
    if (containerWidth <= 0 || containerHeight <= 0) {
      return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
    }

    const containerAspect = containerWidth / containerHeight;
    let width: number;
    let height: number;
    if (containerAspect > BACKYARD_IMAGE_ASPECT) {
      // Container is relatively wider than the art (e.g. a wide desktop browser window) —
      // height-locked so the whole picture fits, with bands left/right.
      height = containerHeight;
      width = height * BACKYARD_IMAGE_ASPECT;
    } else {
      // Container is relatively taller/narrower than the art (typical phone portrait) —
      // width-locked so the whole picture fits, with bands above/below.
      width = containerWidth;
      height = width / BACKYARD_IMAGE_ASPECT;
    }

    return {
      width,
      height,
      offsetX: (containerWidth - width) / 2,
      offsetY: (containerHeight - height) / 2,
    };
  }, [containerSize]);

  const { width: renderedWidth, height: renderedHeight, offsetX, offsetY } = renderedImage;
  const petSize = Math.round(renderedWidth * PET_SIZE_FRAC);

  // Feet-anchored placement: each pet box's bottom-center sits on its spot, scaled for depth.
  // Drawn back-to-front (furthest first) so nearer pets overlap the ones behind them.
  const placedPets = pets
    .map((pet, index) => {
      const spot = spotFor(index);
      const depthT = (spot.y - LAWN_FAR_Y) / (LAWN_NEAR_Y - LAWN_FAR_Y);
      const petW = Math.round(petSize * lerp(FAR_SCALE, NEAR_SCALE, depthT));
      return {
        pet,
        petW,
        left: renderedWidth * spot.x - petW / 2,
        top: renderedHeight * spot.y - petW,
        y: spot.y,
      };
    })
    .sort((a, b) => a.y - b.y);

  return (
    <View
      style={[styles.fill, { backgroundColor: LETTERBOX_FILL, overflow: "hidden" }]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setContainerSize((prev) =>
          Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1
            ? { width, height }
            : prev
        );
      }}
    >
      {renderedWidth > 0 && offsetY > 0 && (
        <>
          {/* Letterbox bands above/below the art (phones): sky color on top, patio below. */}
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: offsetY + 1, backgroundColor: LETTERBOX_TOP }} />
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: offsetY + 1, backgroundColor: LETTERBOX_BOTTOM }} />
        </>
      )}

      {renderedWidth > 0 && (
        <Image
          source={BACKYARD_IMAGE}
          resizeMode="contain"
          style={{
            position: "absolute",
            left: offsetX,
            top: offsetY,
            width: renderedWidth,
            height: renderedHeight,
          }}
        />
      )}

      {pets.length > 0 && renderedWidth > 0 && (
        // A layer exactly over the art, so the pets' art-fraction coordinates map straight onto it.
        <View
          style={{
            position: "absolute",
            left: offsetX,
            top: offsetY,
            width: renderedWidth,
            height: renderedHeight,
          }}
        >
          {placedPets.map(({ pet, petW, left, top }) => (
            <View
              key={pet.id}
              style={{
                position: "absolute",
                left,
                top,
                width: petW,
                height: petW,
              }}
            >
              {/* Contact shadow: soft, grass-tinted, flattened ellipse right under the paws. */}
              <View style={[styles.petShadowOuter, { width: petW * 0.86, height: petW * 0.2, borderRadius: petW * 0.43, bottom: -petW * 0.07, left: petW * 0.07 }]} />
              <View style={[styles.petShadowInner, { width: petW * 0.56, height: petW * 0.12, borderRadius: petW * 0.28, bottom: -petW * 0.03, left: petW * 0.22 }]} />

              <AvatarDisplay
                category={pet.category}
                emoji={pet.emoji}
                color={pet.color}
                size={petW}
                variant="full"
                transparentBackdrop
                animated
              />

              {/* Grass blades drawn IN FRONT of the paws, so the feet sink slightly into the lawn. */}
              <Svg
                width={petW * 1.1}
                height={petW * 0.26}
                viewBox="0 0 110 26"
                style={{ position: "absolute", left: -petW * 0.05, bottom: -petW * 0.06 }}
              >
                <Path d="M4 26 C6 18 8 13 7 6 C10 13 11 19 11 26 Z" fill={GRASS_MID} />
                <Path d="M14 26 C15 20 18 15 21 11 C19 17 19 21 20 26 Z" fill={GRASS_DARK} />
                <Path d="M24 26 C25 19 24 14 22 8 C27 14 29 20 29 26 Z" fill={GRASS_LIGHT} />
                <Path d="M34 26 C35 21 37 17 40 14 C39 19 39 22 40 26 Z" fill={GRASS_MID} />
                <Path d="M44 26 C45 19 44 13 42 7 C48 13 50 20 50 26 Z" fill={GRASS_DARK} />
                <Path d="M54 26 C55 20 58 16 61 12 C59 18 59 22 60 26 Z" fill={GRASS_LIGHT} />
                <Path d="M64 26 C65 19 64 14 62 9 C67 15 69 20 69 26 Z" fill={GRASS_MID} />
                <Path d="M74 26 C75 21 78 17 81 13 C79 19 79 22 80 26 Z" fill={GRASS_DARK} />
                <Path d="M84 26 C85 19 84 13 82 7 C88 13 90 20 90 26 Z" fill={GRASS_LIGHT} />
                <Path d="M94 26 C95 20 98 16 101 12 C99 18 99 22 100 26 Z" fill={GRASS_MID} />
                <Path d="M102 26 C103 20 104 15 104 10 C107 16 108 21 107 26 Z" fill={GRASS_DARK} />
              </Svg>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Written out literally (rather than spreading StyleSheet.absoluteFillObject)
  // since that helper isn't declared in this project's installed react-native
  // type definitions (TS2551) — the literal object below is exactly what
  // absoluteFillObject itself is under the hood. Same fix already applied in
  // minigames.tsx and daily_log_tab.tsx.
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },

  petShadowOuter: {
    position: "absolute",
    backgroundColor: "rgba(20,34,8,0.22)",
  },

  petShadowInner: {
    position: "absolute",
    backgroundColor: "rgba(14,24,6,0.32)",
  },

});
