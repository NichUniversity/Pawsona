import React from "react";
import { Image, ImageSourcePropType, View } from "react-native";

import { ArtLayout } from "../../utils/artFit";

// Draws background art per an ArtLayout (utils/artFit.ts): top part pinned to the top, bottom part
// pinned to the bottom, and the gap between them filled by repeating a band of the art and then a
// stretched plain band — so the art fills the screen without being distorted or cropped.
//
// Each slice is a clipping View holding the full-size Image, offset so the wanted rows show
// (RN has no native image cropping).
type Props = {
  source: ImageSourcePropType;
  layout: ArtLayout;
  /**
   * What fills the leftover gap after the repeats. Either a separate filler image (stretched to fit;
   * best for textured art — e.g. a median-smoothed strip so no streaks show), or a band of rows of
   * `source` itself ([startY, endY) in image pixels) that is plain enough to stretch.
   */
  filler: { source: ImageSourcePropType } | { band: [number, number] };
};

export function ExtendedArtBackground({ source, layout, filler }: Props) {
  const { scale, offsetX, width, artHeight, cutY, gap, repeatPeriod, repeats, fillerHeight } = layout;
  const cutPx = cutY * scale;

  const slice = (key: string, top: number, height: number, imageTop: number, imageHeight = artHeight) => (
    <View
      key={key}
      style={{ position: "absolute", left: offsetX, top, width, height, overflow: "hidden" }}
    >
      <Image
        source={source}
        resizeMode="stretch"
        style={{ position: "absolute", left: 0, top: imageTop, width, height: imageHeight }}
      />
    </View>
  );

  const pieces: React.ReactNode[] = [];

  // Top part, rows [0, cutY).
  pieces.push(slice("top", 0, cutPx, 0));

  // Whole repeats of rows [cutY - period, cutY).
  const periodPx = repeatPeriod * scale;
  for (let i = 0; i < repeats; i++) {
    pieces.push(slice(`repeat-${i}`, cutPx + i * periodPx, periodPx, -(cutY - repeatPeriod) * scale));
  }

  // Stretched plain filler for the rest of the gap.
  if (fillerHeight > 0.5) {
    const fillerTop = cutPx + repeats * periodPx;
    if ("source" in filler) {
      pieces.push(
        <Image
          key="filler"
          source={filler.source}
          resizeMode="stretch"
          style={{ position: "absolute", left: offsetX, top: fillerTop, width, height: fillerHeight + 1 }}
        />
      );
    } else {
      const [bandStart, bandEnd] = filler.band;
      // Scale the whole image vertically so the band alone spans fillerHeight.
      const k = fillerHeight / ((bandEnd - bandStart) * scale);
      pieces.push(slice("filler", fillerTop, fillerHeight + 1, -bandStart * scale * k, artHeight * k));
    }
  }

  // Bottom part, rows [cutY, end), pinned to the bottom of the screen.
  pieces.push(slice("bottom", cutPx + gap, artHeight - cutPx, -cutPx));

  return <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>{pieces}</View>;
}
