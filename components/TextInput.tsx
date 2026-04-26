import { TextInput as RNTextInput, StyleSheet, View } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { MaterialIcon } from "@/components/MaterialIcon";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { getInactiveNavbarIconColour } from "@/utils/colours";
import { n } from "@/utils/scaling";

interface TextInputProps {
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  placeholder: string;
  value: string;
}

export function TextInput({
  value,
  onChangeText,
  placeholder,
  onSubmit,
}: TextInputProps) {
  const { invertColors } = useInvertColors();

  const textColor = invertColors ? "black" : "white";
  const borderColor = invertColors ? "black" : "white";
  const placeholderTextColor = getInactiveNavbarIconColour(invertColors);

  const handleClear = () => {
    onChangeText("");
  };

  return (
    <View style={[styles.container, { borderBottomColor: borderColor }]}>
      <RNTextInput
        allowFontScaling={false}
        autoCapitalize="none"
        autoCorrect={false}
        cursorColor={textColor}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        returnKeyType="search"
        selectionColor={textColor}
        style={[styles.input, { color: textColor }]}
        value={value}
      />
      {value.length > 0 && (
        <HapticPressable onPress={handleClear} style={styles.clearButton}>
          <MaterialIcon color={textColor} name="close" size={n(24)} />
        </HapticPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderBottomWidth: n(1),
  },
  input: {
    flex: 1,
    fontSize: n(24),
    fontFamily: "PublicSans-Regular",
    paddingVertical: n(2),
    paddingBottom: n(6),
  },
  clearButton: {
    padding: n(5),
  },
});
