import { MaterialIcons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
} from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { HapticPressable } from "@/components/HapticPressable";
import { StyledText } from "@/components/StyledText";
import { TrackArtwork } from "@/components/TrackArtwork";
import { useCustomiseSettings } from "@/contexts/CustomiseSettingsContext";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useLibraryActions, useLibraryTracks } from "@/contexts/LibraryContext";
import {
  usePlaybackControls,
  usePlaybackProgress,
  usePlaybackStatus,
  usePlaybackTrack,
} from "@/contexts/PlaybackContext";
import { formatDuration, getAlbumId } from "@/services/librarySelectors";
import type { LocalTrack, RepeatMode } from "@/types/music";
import { n } from "@/utils/scaling";

function MarqueeText({
  children,
  delay = 1250,
  isActive = true,
  msPerChar = 250,
  style,
}: {
  children: string;
  delay?: number;
  isActive?: boolean;
  msPerChar?: number;
  style?: StyleProp<TextStyle>;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  const handleTextLayout = useCallback((event: LayoutChangeEvent) => {
    setTextWidth(event.nativeEvent.layout.width);
  }, []);

  const shouldScroll =
    isActive && textWidth > containerWidth + n(5) && containerWidth > 0;

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);

    if (!shouldScroll) {
      return;
    }

    const distance = textWidth - containerWidth + n(25);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(translateX, {
          duration: children.length * msPerChar,
          toValue: -distance,
          useNativeDriver: true,
        }),
        Animated.delay(500),
        Animated.timing(translateX, {
          duration: 0,
          toValue: 0,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [
    children,
    containerWidth,
    delay,
    msPerChar,
    shouldScroll,
    textWidth,
    translateX,
  ]);

  return (
    <View onLayout={handleContainerLayout} style={styles.marqueeContainer}>
      <View pointerEvents="none" style={styles.marqueeMeasuringContainer}>
        <StyledText onLayout={handleTextLayout} style={style}>
          {children}
        </StyledText>
      </View>

      {shouldScroll ? (
        <Animated.View
          style={[
            styles.marqueeScrollContainer,
            { transform: [{ translateX }] },
          ]}
        >
          <StyledText style={style}>{children}</StyledText>
        </Animated.View>
      ) : (
        <StyledText numberOfLines={1} style={style}>
          {children}
        </StyledText>
      )}
    </View>
  );
}

const repeatIcon = {
  off: "repeat",
  queue: "repeat",
  track: "repeat-one",
} as const;

const ProgressIndicator = memo(function ProgressIndicator({
  colour,
  fallbackDurationMs,
}: {
  colour: string;
  fallbackDurationMs: number;
}) {
  const { durationMs, progressMs } = usePlaybackProgress();
  const { isPlaying } = usePlaybackStatus();
  const { seekToPosition } = usePlaybackControls();
  const [displayProgressMs, setDisplayProgressMs] = useState(progressMs);
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const progressTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressBarWidthRef = useRef<number | null>(null);
  const activeDurationMs = durationMs || fallbackDurationMs;
  const progressRatio =
    activeDurationMs > 0 ? Math.min(progressMs / activeDurationMs, 1) : 0;
  const handleProgressBarLayout = useCallback((event: LayoutChangeEvent) => {
    progressBarWidthRef.current = event.nativeEvent.layout.width;
  }, []);

  useEffect(() => {
    setDisplayProgressMs(Math.min(progressMs, activeDurationMs));
  }, [activeDurationMs, progressMs]);

  useEffect(() => {
    progressAnimation.stopAnimation();

    if (!isPlaying || activeDurationMs <= 0) {
      progressAnimation.setValue(progressRatio);
      return;
    }

    progressAnimation.setValue(progressRatio);
    Animated.timing(progressAnimation, {
      duration: Math.max(activeDurationMs - progressMs, 0),
      easing: Easing.linear,
      toValue: 1,
      useNativeDriver: true,
    }).start();

    return () => {
      progressAnimation.stopAnimation();
    };
  }, [
    activeDurationMs,
    isPlaying,
    progressAnimation,
    progressMs,
    progressRatio,
  ]);

  useEffect(() => {
    if (progressTickRef.current !== null) {
      clearInterval(progressTickRef.current);
      progressTickRef.current = null;
    }

    if (!isPlaying || activeDurationMs <= 0) {
      return;
    }

    const startedAt = Date.now();
    const startedProgressMs = progressMs;
    progressTickRef.current = setInterval(() => {
      setDisplayProgressMs(
        Math.min(startedProgressMs + Date.now() - startedAt, activeDurationMs)
      );
    }, 1000);

    return () => {
      if (progressTickRef.current !== null) {
        clearInterval(progressTickRef.current);
        progressTickRef.current = null;
      }
    };
  }, [activeDurationMs, isPlaying, progressMs]);

  const handleProgressBarSeek = async (event: GestureResponderEvent) => {
    if (!(activeDurationMs > 0 && progressBarWidthRef.current)) {
      return;
    }

    const seekPositionMs =
      (event.nativeEvent.locationX / progressBarWidthRef.current) *
      activeDurationMs;
    await seekToPosition(seekPositionMs);
  };

  return (
    <View style={styles.timeIndicatorContainer}>
      <HapticPressable
        hitSlop={{ bottom: n(18), top: n(18) }}
        onPress={handleProgressBarSeek}
        style={styles.progressBarPressable}
      >
        <View
          onLayout={handleProgressBarLayout}
          style={[styles.progressBarBackground, { backgroundColor: colour }]}
        >
          <Animated.View
            style={[
              styles.progressBarForeground,
              {
                backgroundColor: colour,
                transform: [{ scaleX: progressAnimation }],
                transformOrigin: "left center",
              },
            ]}
          />
        </View>
      </HapticPressable>
      <View style={styles.progressBarInfo}>
        <StyledText style={styles.timeText}>
          {formatDuration(displayProgressMs)}
        </StyledText>
        <StyledText style={styles.timeText}>
          {formatDuration(activeDurationMs)}
        </StyledText>
      </View>
    </View>
  );
});

const TransportControls = memo(function TransportControls({
  colour,
  isPlaying,
  repeatMode,
  shuffle,
}: {
  colour: string;
  isPlaying: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
}) {
  const { setRepeatMode, setShuffle, skipNext, skipPrevious, togglePlayPause } =
    usePlaybackControls();

  const cycleRepeatMode = () => {
    if (repeatMode === "off") {
      setRepeatMode("queue");
      return;
    }
    if (repeatMode === "queue") {
      setRepeatMode("track");
      return;
    }
    setRepeatMode("off");
  };

  return (
    <View style={styles.controlsZone}>
      <View style={styles.musicControls}>
        <HapticPressable onPress={() => setShuffle(!shuffle)}>
          <MaterialIcons color={colour} name="shuffle" size={n(30)} />
          <View
            style={[
              styles.shuffleIndicator,
              shuffle && [
                styles.activeShuffleIndicator,
                { backgroundColor: colour },
              ],
            ]}
          />
        </HapticPressable>
        <HapticPressable
          onPress={async () => {
            await skipPrevious();
          }}
        >
          <MaterialIcons color={colour} name="skip-previous" size={n(52)} />
        </HapticPressable>
        <HapticPressable onPress={togglePlayPause}>
          <MaterialIcons
            color={colour}
            name={isPlaying ? "pause" : "play-arrow"}
            size={n(52)}
          />
        </HapticPressable>
        <HapticPressable
          onPress={async () => {
            await skipNext();
          }}
        >
          <MaterialIcons color={colour} name="skip-next" size={n(52)} />
        </HapticPressable>
        <HapticPressable onPress={cycleRepeatMode}>
          <MaterialIcons
            color={colour}
            name={repeatIcon[repeatMode]}
            size={n(30)}
          />
          <View
            style={[
              styles.shuffleIndicator,
              repeatMode !== "off" && [
                styles.activeShuffleIndicator,
                { backgroundColor: colour },
              ],
            ]}
          />
        </HapticPressable>
      </View>
    </View>
  );
});

const ExtraControls = memo(function ExtraControls({
  colour,
  onAddToPlaylist,
  onLyrics,
  onToggleLiked,
  track,
}: {
  colour: string;
  onAddToPlaylist: () => void;
  onLyrics: () => void;
  onToggleLiked: () => void;
  track: LocalTrack;
}) {
  const { hideLikedSongs, hideLyrics, hidePlaylists } = useCustomiseSettings();
  const visibleButtonCount = [
    !hideLikedSongs,
    !hideLyrics,
    !hidePlaylists,
  ].filter(Boolean).length;

  return (
    <View
      style={[
        styles.musicControlsExtra,
        visibleButtonCount === 1 && styles.centeredMusicControlsExtra,
        visibleButtonCount === 0 && styles.allHiddenMusicControlsExtra,
      ]}
    >
      {!hideLikedSongs && (
        <HapticPressable onPress={onToggleLiked}>
          <MaterialIcons
            color={colour}
            name={track.liked ? "favorite" : "favorite-outline"}
            size={n(30)}
          />
        </HapticPressable>
      )}
      {!hideLyrics && (
        <HapticPressable onPress={onLyrics}>
          <MaterialIcons color={colour} name="mic-external-on" size={n(30)} />
        </HapticPressable>
      )}
      {!hidePlaylists && (
        <HapticPressable onPress={onAddToPlaylist}>
          <MaterialIcons color={colour} name="add" size={n(30)} />
        </HapticPressable>
      )}
    </View>
  );
});

const EmptyExtraControls = memo(function EmptyExtraControls() {
  const { hideLikedSongs, hideLyrics, hidePlaylists } = useCustomiseSettings();
  const visibleButtonCount = [
    !hideLikedSongs,
    !hideLyrics,
    !hidePlaylists,
  ].filter(Boolean).length;

  return (
    <View
      style={[
        styles.musicControlsExtra,
        visibleButtonCount === 1 && styles.centeredMusicControlsExtra,
        visibleButtonCount === 0 && styles.allHiddenMusicControlsExtra,
        { opacity: 0 },
      ]}
    >
      {!hideLikedSongs && (
        <MaterialIcons
          color="transparent"
          name="favorite-outline"
          size={n(30)}
        />
      )}
      {!hideLyrics && (
        <MaterialIcons
          color="transparent"
          name="mic-external-on"
          size={n(30)}
        />
      )}
      {!hidePlaylists && (
        <MaterialIcons color="transparent" name="add" size={n(30)} />
      )}
    </View>
  );
});

export default function PlayingScreen() {
  const { invertColors } = useInvertColors();
  const { setTrackLiked } = useLibraryActions();
  const { trackById } = useLibraryTracks();
  const { currentTrack } = usePlaybackTrack();
  const { isPlaying } = usePlaybackStatus();
  const { repeatMode, shuffle } = usePlaybackControls();
  const colour = invertColors ? "black" : "white";
  const visibleTrack = currentTrack
    ? (trackById.get(currentTrack.id) ?? currentTrack)
    : null;

  const handleTitlePress = useCallback(() => {
    if (!visibleTrack) {
      return;
    }
    router.push(
      `/album/${encodeURIComponent(
        getAlbumId(visibleTrack.albumArtist, visibleTrack.album)
      )}` as Href
    );
  }, [visibleTrack]);

  const handleToggleLiked = useCallback(async () => {
    if (!visibleTrack) {
      return;
    }
    await setTrackLiked(visibleTrack.id, !visibleTrack.liked);
  }, [setTrackLiked, visibleTrack]);

  const handleNavigateToAddToPlaylist = useCallback(() => {
    if (!visibleTrack) {
      return;
    }
    router.push(
      `/add-to-playlist?trackId=${encodeURIComponent(visibleTrack.id)}` as Href
    );
  }, [visibleTrack]);

  const handleNavigateToLyrics = useCallback(() => {
    if (!visibleTrack) {
      return;
    }
    router.push(
      `/lyrics?trackId=${encodeURIComponent(visibleTrack.id)}` as Href
    );
  }, [visibleTrack]);

  const renderEmptyControls = () => (
    <>
      <View style={styles.timeIndicatorContainer}>
        <View style={styles.progressBarPressable}>
          <View style={[styles.progressBarBackground, { opacity: 0 }]} />
        </View>
        <View style={styles.progressBarInfo}>
          <StyledText style={[styles.timeText, { opacity: 0 }]}>
            0:00
          </StyledText>
          <StyledText style={[styles.timeText, { opacity: 0 }]}>
            0:00
          </StyledText>
        </View>
      </View>
      <View style={styles.controlsZone}>
        <View style={[styles.musicControls, { opacity: 0 }]}>
          <MaterialIcons color="transparent" name="shuffle" size={n(30)} />
          <MaterialIcons
            color="transparent"
            name="skip-previous"
            size={n(52)}
          />
          <MaterialIcons color="transparent" name="play-arrow" size={n(52)} />
          <MaterialIcons color="transparent" name="skip-next" size={n(52)} />
          <MaterialIcons color="transparent" name="repeat" size={n(30)} />
        </View>
      </View>
    </>
  );

  if (!visibleTrack) {
    return (
      <ContentContainer
        contentWidth="playing"
        headerTitle=" "
        scrollable={false}
      >
        <View style={styles.content}>
          <View style={styles.mainContent}>
            <View style={styles.placeholderImage} />
            <View style={styles.trackInfoContainer}>
              <StyledText numberOfLines={1} style={styles.trackName}>
                No song playing
              </StyledText>
              <StyledText numberOfLines={1} style={styles.artistName}>
                Go back and play something!
              </StyledText>
            </View>
            {renderEmptyControls()}
          </View>
          <EmptyExtraControls />
        </View>
      </ContentContainer>
    );
  }

  return (
    <ContentContainer contentWidth="playing" headerTitle=" " scrollable={false}>
      <View style={styles.content}>
        <View style={styles.mainContent}>
          <TrackArtwork
            recycleOnUriChange={false}
            size={200}
            style={styles.albumArt}
            uri={visibleTrack.artworkUri}
          />
          <View style={styles.trackInfoContainer}>
            <HapticPressable
              onPress={handleTitlePress}
              style={styles.trackTitlePressable}
            >
              <MarqueeText style={styles.trackName}>
                {visibleTrack.title}
              </MarqueeText>
            </HapticPressable>
            <StyledText numberOfLines={1} style={styles.artistName}>
              {visibleTrack.artist}
            </StyledText>
          </View>

          <ProgressIndicator
            colour={colour}
            fallbackDurationMs={visibleTrack.durationMs}
          />
          <TransportControls
            colour={colour}
            isPlaying={isPlaying}
            repeatMode={repeatMode}
            shuffle={shuffle}
          />
        </View>
        <ExtraControls
          colour={colour}
          onAddToPlaylist={handleNavigateToAddToPlaylist}
          onLyrics={handleNavigateToLyrics}
          onToggleLiked={handleToggleLiked}
          track={visibleTrack}
        />
      </View>
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  activeShuffleIndicator: {
    height: n(1),
    overflow: "visible",
    width: "100%",
  },
  albumArt: {
    backgroundColor: "#282828",
    height: n(200),
    marginBottom: n(20),
    width: n(200),
  },
  artistName: {
    fontSize: n(14),
    lineHeight: n(16),
    textAlign: "center",
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "space-between",
    width: "100%",
  },
  mainContent: {
    alignItems: "center",
    flex: 1,
    width: "100%",
  },
  controlsZone: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  marqueeContainer: {
    overflow: "hidden",
    width: "100%",
  },
  marqueeMeasuringContainer: {
    left: 0,
    opacity: 0,
    position: "absolute",
    top: 0,
  },
  marqueeScrollContainer: {
    width: "100%",
  },
  musicControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "92%",
  },
  musicControlsExtra: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "92%",
  },
  centeredMusicControlsExtra: {
    justifyContent: "center",
  },
  allHiddenMusicControlsExtra: {
    minHeight: n(31),
  },
  placeholderImage: {
    alignItems: "center",
    backgroundColor: "#282828",
    height: n(200),
    justifyContent: "center",
    marginBottom: n(20),
    width: n(200),
  },
  progressBarBackground: {
    height: n(2),
    marginBottom: n(3),
    overflow: "visible",
    width: "100%",
  },
  progressBarForeground: {
    height: n(6),
    position: "absolute",
    top: n(-2),
    width: "100%",
  },
  progressBarInfo: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: n(6),
    width: "90%",
  },
  progressBarPressable: {
    width: "90%",
  },
  shuffleIndicator: {
    height: n(1),
    overflow: "visible",
    width: "100%",
  },
  timeIndicatorContainer: {
    alignItems: "center",
    width: "100%",
  },
  timeText: {
    fontSize: n(12),
  },
  trackInfoContainer: {
    alignItems: "center",
    gap: n(2),
    marginBottom: n(20),
    width: "90%",
  },
  trackName: {
    fontSize: n(22),
    lineHeight: n(24),
    textAlign: "center",
  },
  trackTitlePressable: {
    width: "100%",
  },
});
