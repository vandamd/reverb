import { StyleSheet } from "react-native";
import { StyledText } from "@/components/StyledText";
import { n } from "@/utils/scaling";

interface EmptyStateProps {
  title: string;
}

export function EmptyState({ title }: EmptyStateProps) {
  return <StyledText style={styles.title}>{title}</StyledText>;
}

const styles = StyleSheet.create({
  title: {
    fontSize: n(18),
    lineHeight: n(22),
    textAlign: "center",
  },
});
