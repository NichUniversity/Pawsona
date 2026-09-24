// Full-screen layout for background art that the UI is lined up with (the arcade cabinet's screen
// glass, the notebook's ruled lines) — without stretching or cropping it.
//
// The art is scaled uniformly to the screen's width (never distorted, nothing cut off the sides).
// Phones are taller than the art, so that leaves a gap; instead of stretching the whole picture, the
// art is *lengthened*: it's split at `cutY` (a row where the art is plain and vertically uniform),
// the top part stays pinned to the top of the screen, the bottom part to the bottom, and the gap
// between them is filled with
//   - whole copies of a repeating band (`repeatPeriod` rows ending at cutY — e.g. one ruled line of
//     notebook paper, so the lines just continue), then
//   - a thin plain band stretched to cover whatever is left (see ExtendedArtBackground).
// On screens *wider* than the art (iPad) it falls back to fitting the height, centered, with the
// caller's letterbox color at the sides.
//
// Overlays position themselves with mapX / mapY (image pixel -> screen point), which account for
// the inserted gap below cutY.
export type ArtLayout = {
  scale: number;
  offsetX: number;
  width: number;
  /** Height of the unmodified art at `scale`. */
  artHeight: number;
  cutY: number;
  /** Total extra height inserted at cutY (0 when the art already fills the screen). */
  gap: number;
  repeatPeriod: number;
  repeats: number;
  /** Part of the gap left after the repeats, filled by a stretched plain band. */
  fillerHeight: number;
  mapX: (imageX: number) => number;
  mapY: (imageY: number) => number;
};

export function computeArtLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  options: { cutY: number; repeatPeriod?: number }
): ArtLayout {
  const { cutY } = options;
  const repeatPeriod = options.repeatPeriod ?? 0;

  let scale = containerWidth / imageWidth;
  if (imageHeight * scale > containerHeight) scale = containerHeight / imageHeight;

  const width = imageWidth * scale;
  const artHeight = imageHeight * scale;
  const offsetX = (containerWidth - width) / 2;
  const gap = Math.max(0, containerHeight - artHeight);
  const repeats = repeatPeriod > 0 ? Math.floor(gap / (repeatPeriod * scale)) : 0;
  const fillerHeight = gap - repeats * repeatPeriod * scale;

  return {
    scale,
    offsetX,
    width,
    artHeight,
    cutY,
    gap,
    repeatPeriod,
    repeats,
    fillerHeight,
    mapX: (imageX) => offsetX + imageX * scale,
    mapY: (imageY) => imageY * scale + (imageY >= cutY ? gap : 0),
  };
}
