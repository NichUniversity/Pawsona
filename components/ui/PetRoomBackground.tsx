import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { PetCategory } from "../../data/petcategories";
import { findWalkFrames } from "../../data/walkAnimations";
import { findWalkVideo } from "../../data/walkVideos";
import { useTheme } from "../../context/ThemeContext";
import { AvatarDisplay, AVATAR_BACKDROP_COLOR } from "./AvatarDisplay";
import { WalkingSprite } from "./WalkingSprite";
import { WalkingVideo } from "./WalkingVideo";

// How far below the safe-area top the floor starts — clears the settings
// cog button (which floats at insets.top + 8, ~34px tall) plus a little
// breathing room. Exported so index.tsx can reserve exactly this much
// space above its scrollable content instead of the pet room and the
// header art overlapping — keep these two in sync the same way
// getTabBarStyle/TAB_BAR_HEIGHT are kept in sync for the tab bar.
export const ROOM_TOP_CLEARANCE = 54;
export const ROOM_HEIGHT = 148;
const PET_SIZE = 82;
const EDGE_PADDING = 22;

// Steady stroll speed in px/second, and how long the pet lingers between
// strolls. Kept gentle/slow on purpose — this is ambient life happening
// behind the app's real content, not something meant to grab attention.
const WALK_SPEED = 46;
const MIN_IDLE_MS = 2200;
const MAX_IDLE_MS = 5200;

type Props = {
  category: PetCategory | null | undefined;
  emoji: string | null | undefined;
  color?: string | null;
  /** Safe-area top inset (from useSafeAreaInsets), so the floor clears the
   *  status bar and the settings cog consistently on every device. */
  topInset: number;
};

/**
 * Replaces TabBackground on the Home tab: the same theme-reactive gradient
 * wash, plus a little "room" strip pinned near the top where the
 * currently-viewed pet (see index.tsx's currentEntry) ambles back and
 * forth on its own — a PokiPet-style touch of life behind the real UI.
 *
 * The floor is painted in AVATAR_BACKDROP_COLOR, the same tan "picture
 * frame mat" used everywhere else a pet avatar appears (AvatarDisplay,
 * the Daily Paw Log photo frame). That's deliberate, not just a style
 * match: WALK_VIDEOS clips are pre-baked onto that exact color as an
 * opaque rectangle (see data/walkVideos.ts), so painting the floor the
 * same color is what makes those clips blend in seamlessly instead of
 * showing as a floating colored box. It's what lets every breed roam
 * here today, including the ones that only have a video clip and no
 * transparent sprite frames yet.
 */
export function PetRoomBackground({ category, emoji, color, topInset }: Props) {
  const { theme } = useTheme();
  const { top, mid, bottom, sheenColor, sheenOpacity } = theme.background;

  const hasPet = !!category && !!emoji;
  const frames = hasPet ? findWalkFrames(emoji) : undefined;
  const videoSource = hasPet && !frames ? findWalkVideo(emoji) : undefined;

  const [floorWidth, setFloorWidth] = useState(0);
  const walkableWidthRef = useRef(0);
  const currentXRef = useRef(0);
  const posX = useRef(new Animated.Value(0)).current;
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [isWalking, setIsWalking] = useState(false);

  useEffect(() => {
    walkableWidthRef.current = Math.max(floorWidth - PET_SIZE - EDGE_PADDING * 2, 0);
  }, [floorWidth]);

  // Idle <-> stroll loop: wait a while, pick a random spot on the floor,
  // walk there at a steady pace, then wait again. Resets (new random
  // cadence, starts from wherever the floor currently measures) whenever
  // the pet being shown changes — e.g. the user swipes to a different pet
  // card — or the component (re)mounts.
  useEffect(() => {
    if (!hasPet) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const idleDelay = () => MIN_IDLE_MS + Math.random() * (MAX_IDLE_MS - MIN_IDLE_MS);

    const step = () => {
      if (cancelled) return;
      const bound = walkableWidthRef.current;
      if (bound <= 0) {
        timeoutId = setTimeout(step, 500);
        return;
      }

      const target = Math.random() * bound;
      const distance = Math.abs(target - currentXRef.current);

      if (distance < 16) {
        timeoutId = setTimeout(step, idleDelay());
        return;
      }

      setFacing(target >= currentXRef.current ? "right" : "left");
      setIsWalking(true);

      const duration = (distance / WALK_SPEED) * 1000;
      Animated.timing(posX, {
        toValue: target,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (cancelled) return;
        if (finished) currentXRef.current = target;
        setIsWalking(false);
        timeoutId = setTimeout(step, idleDelay());
      });
    };

    // Small initial pause so the pet doesn't bolt the instant the tab
    // appears.
    timeoutId = setTimeout(step, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      posX.stopAnimation();
      posX.setValue(0);
      currentXRef.current = 0;
      setIsWalking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPet, category, emoji, posX]);

  const roomTop = topInset + ROOM_TOP_CLEARANCE;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="roomFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.55" stopColor={mid} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>

          <RadialGradient id="roomSheen" cx="25%" cy="0%" rx="75%" ry="55%">
            <Stop offset="0" stopColor={sheenColor} stopOpacity={sheenOpacity} />
            <Stop offset="1" stopColor={sheenColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width="100%" height="100%" fill="url(#roomFade)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#roomSheen)" />
      </Svg>

      {hasPet && (
        <View
          style={[styles.floor, { top: roomTop, height: ROOM_HEIGHT }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setFloorWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
          }}
        >
          <Animated.View
            style={[
              styles.petColumn,
              { left: EDGE_PADDING, transform: [{ translateX: posX }] },
            ]}
          >
            <View style={styles.petShadow} />

            {isWalking && frames ? (
              <WalkingSprite frames={frames} size={PET_SIZE} facing={facing} />
            ) : isWalking && videoSource ? (
              <View
                style={[
                  styles.videoBox,
                  {
                    width: PET_SIZE,
                    height: PET_SIZE,
                    transform: facing === "left" ? [{ scaleX: -1 }] : undefined,
                  },
                ]}
              >
                <WalkingVideo
                  source={videoSource}
                  playing
                  style={StyleSheet.absoluteFill}
                />
              </View>
            ) : (
              <AvatarDisplay
                category={category}
                emoji={emoji}
                color={color}
                size={PET_SIZE}
                variant="full"
                transparentBackdrop
                style={
                  facing === "left"
                    ? { transform: [{ scaleX: -1 }] }
                    : undefined
                }
              />
            )}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  floor: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: AVATAR_BACKDROP_COLOR,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 3,
    overflow: "visible",
  },

  petColumn: {
    position: "absolute",
    bottom: 8,
    alignItems: "center",
  },

  petShadow: {
    position: "absolute",
    bottom: -2,
    width: PET_SIZE * 0.7,
    height: PET_SIZE * 0.16,
    borderRadius: PET_SIZE * 0.35,
    backgroundColor: "rgba(0,0,0,0.16)",
    alignSelf: "center",
  },

  videoBox: {
    borderRadius: 12,
    overflow: "hidden",
  },
});
