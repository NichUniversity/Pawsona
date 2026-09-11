import React, { useEffect } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { useVideoPlayer, VideoSource, VideoView } from "expo-video";

import { AVATAR_BACKDROP_COLOR } from "./AvatarDisplay";

type Props = {
  /** A require()'d local video asset — see data/walkVideos.ts. */
  source: VideoSource;
  /** True while the avatar is being held down. */
  playing: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Plays a video clip in a loop while `playing` is true; pre-seeks to frame 0 on creation to avoid a black flash on first press. */
export function WalkingVideo({ source, playing, style }: Props) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true; // the clip has no audio track, but this is the safe default
    p.currentTime = 0; // pre-decode frame 0 now, while off-screen
  });

  useEffect(() => {
    if (playing) {
      player.play();
    } else {
      player.pause();
    }
  }, [playing, player]);

  return (
    <View style={[{ backgroundColor: AVATAR_BACKDROP_COLOR }, style]} pointerEvents="none">
      <VideoView
        player={player}
        // VideoView paints its own opaque (white) background under letterboxed gaps, so set the backdrop color directly to avoid a white sliver.
        style={{ width: "100%", height: "100%", backgroundColor: AVATAR_BACKDROP_COLOR }}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        pointerEvents="none"
      />
    </View>
  );
}
