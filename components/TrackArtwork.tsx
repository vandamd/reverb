import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { n } from "@/utils/scaling";

interface TrackArtworkProps {
  fallbackIcon?: keyof typeof MaterialIcons.glyphMap;
  size: number;
  style?: StyleProp<ViewStyle>;
  uri?: string | null;
}

function TrackArtworkComponent({
  fallbackIcon = "music-note",
  size,
  style,
  uri,
}: TrackArtworkProps) {
  const { invertColors } = useInvertColors();
  const colour = invertColors ? "black" : "white";
  const backgroundColour = invertColors ? "#EFEFEF" : "#181818";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: backgroundColour,
          borderColor: colour,
          height: n(size),
          width: n(size),
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          cachePolicy="disk"
          contentFit="cover"
          recyclingKey={uri}
          source={uri}
          style={styles.image}
          transition={0}
        />
      ) : (
        <MaterialIcons
          color={colour}
          name={fallbackIcon}
          size={n(size * 0.54)}
        />
      )}
    </View>
  );
}

export const TrackArtwork = memo(TrackArtworkComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    height: "100%",
    width: "100%",
  },
});
