import { MaterialIcons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { n } from "@/utils/scaling";

interface IconButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress?: () => void;
  selected?: boolean;
  size?: number;
}

export function IconButton({
  icon,
  onPress,
  selected = false,
  size = 32,
}: IconButtonProps) {
  const { invertColors } = useInvertColors();
  const colour = invertColors ? "black" : "white";

  return (
    <HapticPressable
      onPress={onPress}
      style={[styles.button, selected && { borderColor: colour }]}
    >
      <MaterialIcons color={colour} name={icon} size={n(size)} />
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: n(4),
    borderWidth: n(0),
    height: n(48),
    justifyContent: "center",
    width: n(48),
  },
});
