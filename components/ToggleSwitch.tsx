import { StyleSheet, View } from "react-native";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { n } from "@/utils/scaling";
import { HapticPressable } from "./HapticPressable";
import { StyledText } from "./StyledText";

const CIRCLE_DIAMETER = n(9.8);
const CIRCLE_BORDER = n(2.5);
const LINE_WIDTH = n(14.5);
const LINE_HEIGHT = n(2.22);

const graphicStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  circle: {
    width: CIRCLE_DIAMETER,
    height: CIRCLE_DIAMETER,
    borderRadius: CIRCLE_DIAMETER / 2,
  },
  hollowCircle: {
    width: CIRCLE_DIAMETER,
    height: CIRCLE_DIAMETER,
    borderRadius: CIRCLE_DIAMETER / 2,
    borderWidth: CIRCLE_BORDER,
  },
  line: {
    width: LINE_WIDTH,
    height: LINE_HEIGHT,
  },
});

const ToggleSwitchGraphic = ({ value }: { value: boolean }) => {
  const { invertColors } = useInvertColors();
  const switchColor = invertColors ? "black" : "white";

  return (
    <View style={graphicStyles.container}>
      {value ? (
        <>
          <View
            style={[graphicStyles.line, { backgroundColor: switchColor }]}
          />
          <View
            style={[graphicStyles.circle, { backgroundColor: switchColor }]}
          />
        </>
      ) : (
        <>
          <View
            style={[graphicStyles.hollowCircle, { borderColor: switchColor }]}
          />
          <View
            style={[graphicStyles.line, { backgroundColor: switchColor }]}
          />
        </>
      )}
    </View>
  );
};

interface ToggleSwitchProps {
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}

export function ToggleSwitch({
  label,
  value,
  onValueChange,
}: ToggleSwitchProps) {
  return (
    <HapticPressable
      onPress={() => onValueChange(!value)}
      style={styles.container}
    >
      <View style={styles.switchTouchable}>
        <ToggleSwitchGraphic value={value} />
      </View>
      <View style={styles.textTouchable}>
        <StyledText style={styles.label}>{label}</StyledText>
      </View>
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: n(9),
  },
  switchTouchable: {
    marginTop: n(13),
    marginRight: n(20),
    marginLeft: n(8.5),
  },
  textTouchable: {
    flex: 1,
  },
  label: {
    fontSize: n(30),
  },
});
