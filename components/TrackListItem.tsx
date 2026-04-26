import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { StyledText } from "@/components/StyledText";
import { TrackArtwork } from "@/components/TrackArtwork";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useTrackLiked } from "@/contexts/LibraryContext";
import { formatDuration } from "@/services/librarySelectors";
import type { LocalTrack } from "@/types/music";
import { n } from "@/utils/scaling";

interface TrackListItemProps {
  indexLabel?: string;
  onLongPress?: () => void;
  onPress: () => void;
  onRightPress?: () => void;
  rightIcon?: keyof typeof MaterialIcons.glyphMap;
  showLikedIndicator?: boolean;
  track: LocalTrack;
}

function TrackListItemComponent({
  indexLabel,
  onLongPress,
  onPress,
  onRightPress,
  rightIcon,
  showLikedIndicator = true,
  track,
}: TrackListItemProps) {
  const { invertColors } = useInvertColors();
  const colour = invertColors ? "black" : "white";
  const isLiked = useTrackLiked(track.id, track.liked);

  return (
    <HapticPressable
      onLongPress={onLongPress}
      onPress={onPress}
      style={[styles.container, !indexLabel && styles.mediaContainer]}
    >
      {indexLabel ? (
        <StyledText style={styles.trackNumber}>{indexLabel}.</StyledText>
      ) : (
        <TrackArtwork
          size={50}
          style={styles.imageContainer}
          uri={track.artworkUri}
        />
      )}
      <View style={styles.textContainer}>
        <StyledText
          numberOfLines={1}
          style={[
            styles.trackName,
            indexLabel ? styles.numberedTrackName : styles.mediaTrackName,
          ]}
        >
          {track.title}
        </StyledText>
        <View
          style={[styles.subtitleRow, indexLabel && styles.numberedSubtitleRow]}
        >
          <StyledText
            numberOfLines={1}
            style={[styles.subtitle, styles.subtitleText]}
          >
            {track.artist} • {formatDuration(track.durationMs)}
          </StyledText>
          {showLikedIndicator && isLiked ? (
            <>
              <StyledText style={[styles.subtitle, styles.likedSeparator]}>
                {" • "}
              </StyledText>
              <View style={styles.likedIconContainer}>
                <MaterialIcons color="white" name="favorite" size={n(10)} />
              </View>
            </>
          ) : null}
        </View>
      </View>
      {rightIcon ? (
        <HapticPressable onPress={onRightPress} style={styles.rightAction}>
          <MaterialIcons color={colour} name={rightIcon} size={n(26)} />
        </HapticPressable>
      ) : null}
    </HapticPressable>
  );
}

export const TrackListItem = memo(TrackListItemComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
  },
  mediaContainer: {
    alignItems: "center",
    minHeight: n(50),
  },
  textContainer: {
    flex: 1,
    alignItems: "flex-start",
    minWidth: n(0),
    paddingRight: n(10),
  },
  trackNumber: {
    fontSize: n(22),
    lineHeight: n(24),
    paddingRight: n(8),
    textAlign: "center",
    width: n(56),
  },
  rightAction: {
    alignItems: "center",
    height: n(36),
    justifyContent: "center",
    width: n(36),
  },
  imageContainer: {
    marginRight: n(15),
  },
  subtitle: {
    fontSize: n(16),
    lineHeight: n(18),
  },
  subtitleRow: {
    alignItems: "center",
    flexDirection: "row",
    width: "100%",
  },
  numberedSubtitleRow: {
    paddingBottom: n(6),
  },
  subtitleText: {
    flexShrink: 1,
  },
  likedIconContainer: {
    alignItems: "center",
    height: n(18),
    justifyContent: "center",
    marginTop: n(1),
  },
  likedSeparator: {
    paddingLeft: n(1),
  },
  trackName: {
    lineHeight: n(24),
  },
  numberedTrackName: {
    fontSize: n(22),
  },
  mediaTrackName: {
    fontSize: n(22),
    lineHeight: n(24),
  },
});
