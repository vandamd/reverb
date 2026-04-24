import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { triggerHaptic } from "@/utils/haptics";

const EDGE_THRESHOLD = 30;
const DRAG_THRESHOLD = 80;

interface SwipeBackContainerProps {
  children: ReactNode;
  enabled?: boolean;
  onSwipeBack: () => void;
}

export function SwipeBackContainer({
  children,
  enabled = true,
  onSwipeBack,
}: SwipeBackContainerProps) {
  const triggeredRef = useRef(false);

  const swipeBackGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .hitSlop({ left: 0, width: EDGE_THRESHOLD })
        .activeOffsetX(12)
        .onBegin(() => {
          triggeredRef.current = false;
        })
        .onUpdate((event) => {
          if (triggeredRef.current) {
            return;
          }

          const absX = Math.abs(event.translationX);
          const absY = Math.abs(event.translationY);

          if (absY > absX * 1.5) {
            return;
          }

          if (event.translationX > DRAG_THRESHOLD) {
            triggeredRef.current = true;
            triggerHaptic();
            onSwipeBack();
          }
        })
        .onFinalize(() => {
          triggeredRef.current = false;
        })
        .runOnJS(true),
    [enabled, onSwipeBack]
  );

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View style={styles.container}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
