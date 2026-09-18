import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

import { PetCategory } from "../../data/petcategories";
import { findWalkFrames } from "../../data/walkAnimations";
import { findWalkVideo } from "../../data/walkVideos";
import { AvatarDisplay } from "./AvatarDisplay";
import { WalkingSprite } from "./WalkingSprite";
import { WalkingVideo } from "./WalkingVideo";

const BACKYARD_IMAGE = require("../../assets/backgrounds/home_backyard_sunset.png");

// home_backyard_sunset.png is 941x1672 px — measure this again if the art changes size.
//
// This renders as a manual "cover" fit (fill the screen completely, crop whatever overflows)
// rather than resizeMode="contain". "contain" was tried first so the full picture is always
// visible, but this art (941x1672, aspect ~0.56) is noticeably shorter/wider than a typical
// phone screen (~0.46), so "contain" left a visible gap above and below it — filled with a flat
// LETTERBOX_FILL color — that read as the background being cut short. There's no taller version
// of the art to fix that at the source, so "cover" is the deliberate tradeoff: it always fills
// edge-to-edge (no gap, ever), at the cost of cropping a bit off the left/right on phones (the
// tree or house corner can get trimmed on unusually narrow/wide screens) instead of top/bottom.
// The fit math is done by hand (same approach as the territory-minigame house art) and the image
// is placed with explicit width/height/left/top, which is also what keeps it reliably *centered*
// on every platform — see the home-background centering fix earlier in this file's history for
// why resizeMode's own centering wasn't trustworthy on react-native-web.
const BACKYARD_IMAGE_ASPECT = 941 / 1672;

// Backdrop behind the image itself — with a cover fit this is only ever visible for the one
// frame before onLayout first measures the container (the image is sized to 0 until then), but
// it's kept as a safe fallback matching the art's own sky color.
const LETTERBOX_FILL = "#3A2F55";

// Fractions of the rendered image's height, read straight off the art: sky down to the
// fence/string-lights line, then lawn down to the foreground patio. The pet is placed by these
// fractions (not fixed px) so it tracks the artwork itself rather than the screen — the image is
// scaled uniformly, so a fraction of its height always lands on the same part of the picture
// regardless of device size, even where a cover-fit crop clips the sides.
const LAWN_TOP_FRACTION = 0.57;
const LAWN_BOTTOM_FRACTION = 0.94;

const PET_SIZE = 78;
const EDGE_PADDING = 26;

// Steady stroll speed and idle time between strolls — kept slow since this is ambient background life, not an attention-grabber.
const WALK_SPEED = 46;
const MIN_IDLE_MS = 2200;
const MAX_IDLE_MS = 5200;

type Props = {
  category: PetCategory | null | undefined;
  emoji: string | null | undefined;
  color?: string | null;
};

/**
 * Renders on the Home tab when "Living Home Screen" is on: the illustrated backyard-at-sunset
 * scene (assets/backgrounds/home_backyard_sunset.png) and the current pet ambling on the grass.
 * Toggling "Living Home Screen" off in Settings swaps this out for the plain TabBackground
 * gradient instead — see index.tsx.
 */
export function PetRoomBackground({ category, emoji, color }: Props) {
  const hasPet = !!category && !!emoji;
  const frames = hasPet ? findWalkFrames(emoji) : undefined;
  const videoSource = hasPet && !frames ? findWalkVideo(emoji) : undefined;

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const walkableWidthRef = useRef(0);
  const currentXRef = useRef(0);
  const posX = useRef(new Animated.Value(0)).current;
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [isWalking, setIsWalking] = useState(false);

  // Manual cover-fit: how big the art renders inside the measured container, and where its
  // top-left lands (usually off-screen negative on one axis, since cover overflows by design),
  // so the image (and everything anchored to it below) always fills the screen and stays
  // centered — see the BACKYARD_IMAGE_ASPECT comment above for why this isn't left to
  // resizeMode="cover" alone, and why cover instead of contain at all.
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
      // width-locked so it still fully covers the width, overflowing (and getting cropped)
      // top/bottom instead of leaving a gap there.
      width = containerWidth;
      height = width / BACKYARD_IMAGE_ASPECT;
    } else {
      // Container is relatively taller/narrower than the art (typical phone portrait) —
      // height-locked so it still fully covers the height, overflowing (and getting cropped)
      // left/right instead of leaving a gap there.
      height = containerHeight;
      width = height * BACKYARD_IMAGE_ASPECT;
    }

    return {
      width,
      height,
      offsetX: (containerWidth - width) / 2,
      offsetY: (containerHeight - height) / 2,
    };
  }, [containerSize]);

  // The pet's walking lane is bounded by the visible SCREEN width, not the rendered image's own
  // width — with a cover fit the image is often wider than the screen (that's the overflow that
  // gets cropped), and letting the pet roam that full width would walk it off into the cropped,
  // invisible part of the art.
  useEffect(() => {
    walkableWidthRef.current = Math.max(
      containerSize.width - PET_SIZE - EDGE_PADDING * 2,
      0
    );
  }, [containerSize.width]);

  // Idle <-> stroll loop: wait, pick a random lawn spot, walk there, repeat; resets when the
  // shown pet changes or the component remounts.
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

    // Small initial pause so the pet doesn't bolt the instant the tab appears.
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

  const { width: renderedWidth, height: renderedHeight, offsetX, offsetY } = renderedImage;
  // Anchored to the rendered art's own bounds (offset + fraction of its height), not the raw
  // container — otherwise this would drift off the actual picture whenever there's a letterbox
  // gap (top/bottom on a phone, left/right on a wide desktop browser).
  const lawnTop = offsetY + renderedHeight * LAWN_TOP_FRACTION;
  const lawnHeight = renderedHeight * (LAWN_BOTTOM_FRACTION - LAWN_TOP_FRACTION);

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

      {hasPet && renderedWidth > 0 && (
        <View style={[styles.lawn, { top: lawnTop, height: lawnHeight }]}>
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

  lawn: {
    position: "absolute",
    left: 0,
    right: 0,
  },

  petColumn: {
    position: "absolute",
    bottom: 0,
    alignItems: "center",
  },

  petShadow: {
    position: "absolute",
    bottom: -2,
    width: PET_SIZE * 0.7,
    height: PET_SIZE * 0.16,
    borderRadius: PET_SIZE * 0.35,
    backgroundColor: "rgba(0,0,0,0.22)",
    alignSelf: "center",
  },

  videoBox: {
    borderRadius: 12,
    overflow: "hidden",
  },
});
