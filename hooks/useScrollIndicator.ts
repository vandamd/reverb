import { useCallback, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import {
  type AnimatedStyle,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { n } from "@/utils/scaling";

interface UseScrollIndicatorReturn {
  contentHeight: number;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollIndicatorHeight: number;
  scrollIndicatorPosition: SharedValue<number>;
  scrollIndicatorStyle: AnimatedStyle<{
    transform: { translateY: number }[];
  }>;
  scrollViewHeight: number;
  setContentHeight: (height: number) => void;
  setScrollViewHeight: (height: number) => void;
}

export function useScrollIndicator(): UseScrollIndicatorReturn {
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [scrollViewHeight, setScrollViewHeight] = useState<number>(0);
  const scrollY = useRef(0);
  const scrollIndicatorPosition = useSharedValue(0);

  const scrollIndicatorHeight =
    scrollViewHeight > 0 &&
    contentHeight > 0 &&
    contentHeight > scrollViewHeight
      ? Math.max((scrollViewHeight * scrollViewHeight) / contentHeight, n(20))
      : 0;

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = event.nativeEvent.contentOffset.y;

      const position =
        contentHeight > scrollViewHeight && scrollIndicatorHeight > 0
          ? Math.max(
              0,
              Math.min(
                (scrollY.current / (contentHeight - scrollViewHeight)) *
                  (scrollViewHeight - scrollIndicatorHeight),
                scrollViewHeight - scrollIndicatorHeight
              )
            )
          : 0;

      scrollIndicatorPosition.value = position;
    },
    [
      contentHeight,
      scrollIndicatorHeight,
      scrollIndicatorPosition,
      scrollViewHeight,
    ]
  );

  const scrollIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollIndicatorPosition.value }],
  }));

  return {
    contentHeight,
    handleScroll,
    scrollIndicatorHeight,
    scrollIndicatorPosition,
    scrollIndicatorStyle,
    scrollViewHeight,
    setContentHeight,
    setScrollViewHeight,
  };
}
