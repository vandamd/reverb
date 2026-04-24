import { type Href, router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { HapticPressable } from "@/components/HapticPressable";
import { Header } from "@/components/Header";
import { StyledText } from "@/components/StyledText";
import { SwipeBackContainer } from "@/components/SwipeBackContainer";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { n } from "@/utils/scaling";

export default function ConfirmScreen() {
  const { invertColors } = useInvertColors();
  const params = useLocalSearchParams<{
    title: string;
    message: string;
    confirmText: string;
    action: string;
    returnPath: string;
  }>();

  const handleConfirm = () => {
    const path = params.returnPath || "/(tabs)/settings";
    router.navigate(`${path}?confirmed=true&action=${encodeURIComponent(params.action ?? '')}` as Href);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  const textColor = invertColors ? "black" : "white";

  return (
    <SwipeBackContainer enabled onSwipeBack={handleBack}>
      <View
        style={[
          styles.container,
          { backgroundColor: invertColors ? "white" : "black" },
        ]}
      >
        <Header headerTitle={params.title || "Confirm"} />
        <View style={styles.content}>
          <StyledText style={styles.messageText}>{params.message}</StyledText>
          <View style={styles.spacer} />
          <HapticPressable onPress={handleConfirm} style={styles.button}>
            <StyledText style={[styles.buttonText, { color: textColor }]}>
              {params.confirmText || "Confirm"}
            </StyledText>
          </HapticPressable>
        </View>
      </View>
    </SwipeBackContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: n(37),
    paddingTop: n(20),
    paddingBottom: n(20),
  },
  messageText: {
    fontSize: n(18),
  },
  spacer: {
    flex: 1,
  },
  button: {
    alignItems: "center",
    minWidth: n(200),
  },
  buttonText: {
    fontSize: n(40),
    textTransform: "uppercase",
  },
});
