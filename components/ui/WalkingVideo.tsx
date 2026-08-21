import React, { useEffect } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { useVideoPlayer, VideoSource, VideoView } from "expo-video";

type Props = {
  /** A require()'d local video asset — see data/walkVideos.ts. */
  source: VideoSource;
  /** True while the avatar is being held down. */
  playing: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Plays a real video clip in a loop while `playing` is true — the video
 * counterpart to WalkingSprite, for pets that have an actual filmed/rendered
 * walk clip instead of a hand-cut frame sequence (see data/walkVideos.ts).
 *
 * The player is created once and kept alive for the component's whole
 * lifetime (rather than created fresh on every hold) so there's no
 * decode/buffer startup lag the second time a pet is held — only the very
 * first hold pays that cost. Pairs with daily_log_tab.tsx keeping this
 * component permanently mounted (just opacity-swapped with the static
 * avatar) rather than mounting it fresh per hold.
 */
export function WalkingVideo({ source, playing, style }: Props) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true; // the clip has no audio track, but this is the safe default
  });

  useEffect(() => {
    if (playing) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [playing, player]);

  return (
    <View style={style} pointerEvents="none">
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        pointerEvents="none"
      />
    </View>
  );
}
