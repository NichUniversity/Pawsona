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

/**
 * Plays a video clip in a loop while `playing` is true.
 *
 * Seeking a native video player mid-playback briefly blanks its render
 * surface to black while it decodes the target frame — invisible back when
 * the avatar box itself was black, but a visible flash now that it's
 * AVATAR_BACKDROP_COLOR. To avoid it: seek to frame 0 exactly once, right
 * when the player is created (while this view is still hidden behind the
 * static avatar — see the opacity swap in daily_log_tab.tsx), so a real
 * frame is already decoded before the user ever presses. Every later
 * press/release just resumes or pauses in place instead of re-seeking.
 */
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
        // The wrapping View's backgroundColor only shows through where the
        // VideoView itself is transparent — but the native video surface
        // paints its own opaque background (defaults to white) under any
        // letterboxed/gap area left by contentFit="contain". That white
        // sliver was showing along the bottom edge for landscape clips
        // that don't exactly fill this box's aspect ratio. Setting the
        // same color directly on the VideoView closes that gap.
        style={{ width: "100%", height: "100%", backgroundColor: AVATAR_BACKDROP_COLOR }}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        pointerEvents="none"
      />
    </View>
  );
}
