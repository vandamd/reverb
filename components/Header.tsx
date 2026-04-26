import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { MaterialIcon, type MaterialIconName } from "@/components/MaterialIcon";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { n } from "@/utils/scaling";
import { HapticPressable } from "./HapticPressable";
import { StyledText } from "./StyledText";

interface RightAction {
  icon: MaterialIconName;
  onPress: () => void;
  show?: boolean;
}

interface LeftAction {
  icon: MaterialIconName;
  onPress: () => void;
  show?: boolean;
}

interface HeaderProps {
  headerTitle?: string;
  hideBackButton?: boolean;
  leftAction?: LeftAction;
  onBackPress?: () => void;
  rightAction?: RightAction;
}

export function Header({
  headerTitle,
  hideBackButton = false,
  leftAction,
  onBackPress,
  rightAction,
}: HeaderProps) {
  const { invertColors } = useInvertColors();
  const iconColor = invertColors ? "black" : "white";

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    }
  };

  let leftButton = <View style={styles.button} />;
  if (hideBackButton && leftAction && leftAction.show !== false) {
    leftButton = (
      <HapticPressable onPress={leftAction.onPress}>
        <View style={styles.button}>
          <MaterialIcon color={iconColor} name={leftAction.icon} size={n(28)} />
        </View>
      </HapticPressable>
    );
  } else if (!hideBackButton) {
    leftButton = (
      <HapticPressable onPress={handleBack}>
        <View style={styles.button}>
          <MaterialIcon color={iconColor} name="arrow-back-ios" size={n(28)} />
        </View>
      </HapticPressable>
    );
  }

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: invertColors ? "white" : "black" },
      ]}
    >
      {leftButton}
      <View style={styles.titleWrapper}>
        <StyledText numberOfLines={1} style={styles.title}>
          {headerTitle}
        </StyledText>
      </View>
      {rightAction?.show !== false && rightAction?.icon ? (
        <HapticPressable onPress={rightAction.onPress}>
          <View style={styles.button}>
            <MaterialIcon
              color={iconColor}
              name={rightAction.icon}
              size={n(28)}
            />
          </View>
        </HapticPressable>
      ) : (
        <View style={styles.button} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: n(22),
    paddingVertical: n(5),
    zIndex: 1,
  },
  title: {
    fontSize: n(20),
    fontFamily: "PublicSans-Regular",
    paddingTop: n(2),
    maxWidth: "100%",
  },
  titleWrapper: {
    alignItems: "center",
    flex: 1,
  },
  button: {
    width: n(32),
    height: n(32),
    alignItems: "center",
    paddingTop: n(6),
    paddingRight: n(4),
  },
});
