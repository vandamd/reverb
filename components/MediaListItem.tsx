import { MaterialIcons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { StyledText } from "@/components/StyledText";
import { TrackArtwork } from "@/components/TrackArtwork";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { n } from "@/utils/scaling";

interface MediaListItemProps {
  artworkUri?: string | null;
  fallbackIcon?: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  subtitle?: string;
  title: string;
}

function MediaListItemComponent({
  artworkUri,
  fallbackIcon = "album",
  onPress,
  subtitle,
  title,
}: MediaListItemProps) {
  const { invertColors } = useInvertColors();
  const colour = invertColors ? "black" : "white";
  const showFallback = !artworkUri;

  return (
    <HapticPressable onPress={onPress} style={styles.container}>
      {artworkUri ? (
        <TrackArtwork
          size={50}
          style={styles.imageContainer}
          uri={artworkUri}
        />
      ) : null}
      {showFallback ? (
        <View style={styles.placeholderImageContainer}>
          <MaterialIcons color={colour} name={fallbackIcon} size={n(24)} />
        </View>
      ) : null}
      <View style={styles.textContainer}>
        <StyledText numberOfLines={1} style={styles.primaryText}>
          {title}
        </StyledText>
        {subtitle ? (
          <StyledText numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </StyledText>
        ) : null}
      </View>
    </HapticPressable>
  );
}

export const MediaListItem = memo(MediaListItemComponent);

const styles = StyleSheet.create({
  container: {
    minHeight: n(50),
    paddingVertical: n(0),
    alignItems: "center",
    flexDirection: "row",
    width: "100%",
  },
  textContainer: {
    flex: 1,
    gap: n(0),
    paddingRight: n(10),
  },
  placeholderImageContainer: {
    alignItems: "center",
    backgroundColor: "#282828",
    height: n(50),
    justifyContent: "center",
    marginRight: n(15),
    width: n(50),
  },
  imageContainer: {
    marginRight: n(15),
  },
  subtitle: {
    fontSize: n(16),
    lineHeight: n(18),
  },
  primaryText: {
    fontSize: n(22),
    lineHeight: n(24),
  },
});
