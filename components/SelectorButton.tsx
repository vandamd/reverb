import { type Href, router } from "expo-router";
import { StyleSheet } from "react-native";
import { n } from "@/utils/scaling";
import { HapticPressable } from "./HapticPressable";
import { StyledText } from "./StyledText";

interface SelectorButtonProps {
  href: Href;
  label: string;
  value: string;
}

export function SelectorButton({ label, value, href }: SelectorButtonProps) {
  return (
    <HapticPressable onPress={() => router.push(href)} style={styles.button}>
      <StyledText numberOfLines={1} style={styles.label}>
        {label}
      </StyledText>
      <StyledText style={styles.value}>{value}</StyledText>
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "column",
  },
  label: {
    fontSize: n(20),
    paddingTop: n(7.5),
    lineHeight: n(20),
  },
  value: {
    fontSize: n(30),
    paddingBottom: n(10),
  },
});
