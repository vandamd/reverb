import { MaterialIcons } from "@expo/vector-icons";
import {
  Image,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { n } from "@/utils/scaling";

interface TrackArtworkProps {
  fallbackIcon?: keyof typeof MaterialIcons.glyphMap;
  size: number;
  style?: StyleProp<ViewStyle>;
  uri?: string | null;
}

export function TrackArtwork({
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
        <Image fadeDuration={0} source={{ uri }} style={styles.image} />
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
