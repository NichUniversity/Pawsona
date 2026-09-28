import React, { useEffect, useState } from "react";
import { Image, ImageSourcePropType, PixelRatio, StyleProp, View, ViewStyle } from "react-native";

import type { SheetAnimation } from "../../data/sheetAnimations";

type Props = {
  animation: SheetAnimation;
  style?: StyleProp<ViewStyle>;
};

/**
 * Loops a pre-rendered frame-by-frame animation (e.g. a Blender render) packed into ONE sprite
 * sheet image (see data/sheetAnimations.ts).
 *
 * Why a sheet instead of one <Image> per frame: the whole animation is a single decoded image,
 * so there's nothing to load mid-loop (swapping an Image's `source` flashes blank, especially on
 * web), and there is only one texture in memory instead of dozens.
 *
 * Playback: the sheet is drawn at full size inside a frame-sized window with overflow hidden and
 * shifted so the current frame's cell sits in the window. The current frame comes from a
 * requestAnimationFrame clock: frame = floor(elapsed * fps) % frameCount. It is computed from
 * elapsed time rather than counted up, so the loop can never stall, and it keeps real-time speed
 * even if the device drops frames. State only changes when the frame index changes (24x/s).
 *
 * (The first version drove this with Animated.loop on the native driver. That played one pass
 * and stopped on some setups, because the loop's reset-to-0 between iterations didn't take.)
 *
 * Sizing: give the container a width; its height follows the frame's aspect ratio.
 */
export function SpriteSheetPlayer({ animation, style }: Props) {
  const { sheet, frameCount, columns, cellWidth, cellHeight, frameWidth, frameHeight, padding, fps } = animation;
  const rows = Math.ceil(frameCount / columns);
  const [boxWidth, setBoxWidth] = useState(0);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    let last = -1;
    const tick = (now: number) => {
      if (start === null) start = now;
      const next = Math.floor(((now - start) * fps) / 1000) % frameCount;
      if (next !== last) {
        last = next;
        setFrame(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, frameCount]);

  // Pixel-snapped scale. Each cell's on-screen step is rounded to a whole number of DEVICE
  // pixels (separately for x and y; the <0.5px aspect change is invisible). Otherwise every
  // frame's offset (col * cellWidth * scale) has a different fractional part, so each frame lands
  // on a slightly different sub-pixel and is resampled differently, and the dog visibly shakes
  // by up to a pixel from frame to frame. With whole-pixel steps, every frame's origin differs
  // only by whole device pixels, so all frames are sampled identically.
  const pr = PixelRatio.get();
  const rawScale = boxWidth > 0 ? boxWidth / frameWidth : 0;
  const stepX = rawScale > 0 ? Math.max(1, Math.round(cellWidth * rawScale * pr)) / pr : 0;
  const stepY = rawScale > 0 ? Math.max(1, Math.round(cellHeight * rawScale * pr)) / pr : 0;
  const scaleX = stepX / cellWidth;
  const scaleY = stepY / cellHeight;
  const col = frame % columns;
  const row = Math.floor(frame / columns);

  return (
    <View
      pointerEvents="none"
      style={[{ aspectRatio: frameWidth / frameHeight, overflow: "hidden" }, style]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setBoxWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
      }}
    >
      {rawScale > 0 && (
        <Image
          source={sheet as ImageSourcePropType}
          resizeMode="stretch"
          fadeDuration={0}
          style={{
            position: "absolute",
            // Whole-device-pixel step per frame, plus a CONSTANT sub-pixel padding offset that
            // is identical for every frame, so it can't cause jitter.
            left: -col * stepX - padding * scaleX,
            top: -row * stepY - padding * scaleY,
            width: columns * stepX,
            height: rows * stepY,
          }}
        />
      )}
    </View>
  );
}
