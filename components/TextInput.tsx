import { MaterialIcons } from "@expo/vector-icons";
import { TextInput as RNTextInput, StyleSheet, View } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { n } from "@/utils/scaling";

interface TextInputProps {
  autoFocus?: boolean;
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
  autoFocus = false,
}: TextInputProps) {
  const { invertColors } = useInvertColors();

  const textColor = invertColors ? "black" : "white";
  const borderColor = invertColors ? "black" : "white";

  const handleClear = () => {
    onChangeText("");
  };

  return (
    <View style={[styles.container, { borderBottomColor: borderColor }]}>
      <RNTextInput
        allowFontScaling={false}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        cursorColor={textColor}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={textColor}
        returnKeyType="search"
        selectionColor={textColor}
        style={[styles.input, { color: textColor }]}
        value={value}
      />
      {value.length > 0 && (
        <HapticPressable onPress={handleClear} style={styles.clearButton}>
          <MaterialIcons color={textColor} name="close" size={n(24)} />
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
