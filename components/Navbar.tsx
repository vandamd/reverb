import { MaterialIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { StyleSheet, View } from "react-native";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { getInactiveNavbarIconColour } from "@/utils/colours";
import { n } from "@/utils/scaling";
import { HapticPressable } from "./HapticPressable";

export const NAVBAR_HEIGHT = n(70);

export interface TabConfigItem {
  iconName: keyof typeof MaterialIcons.glyphMap;
  name: string;
  screenName: string;
}

interface NavbarProps {
  currentScreenName: string;
  navigation: BottomTabBarProps["navigation"];
  tabsConfig?: readonly TabConfigItem[];
}

const getTabColor = (isActive: boolean, inverted: boolean) => {
  if (isActive) {
    return inverted ? "black" : "white";
  }
  return getInactiveNavbarIconColour(inverted);
};

export function Navbar({
  tabsConfig,
  currentScreenName,
  navigation,
}: NavbarProps) {
  const { invertColors } = useInvertColors();

  return (
    <View
      style={[
        styles.navbar,
        { backgroundColor: invertColors ? "white" : "black" },
      ]}
    >
      {tabsConfig?.map((tab) => (
        <HapticPressable
          key={tab.screenName}
          onPress={() => navigation.navigate(tab.screenName)}
        >
          <MaterialIcons
            color={getTabColor(
              tab.screenName === currentScreenName,
              invertColors
            )}
            name={tab.iconName}
            size={n(48)}
          />
        </HapticPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    height: NAVBAR_HEIGHT,
    justifyContent: "space-between",
    paddingVertical: n(11),
    paddingHorizontal: n(20),
  },
});
