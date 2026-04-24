import { useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Animated } from "react-native";
import { n } from "@/utils/scaling";

interface UseScrollIndicatorReturn {
  contentHeight: number;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollIndicatorHeight: number;
  scrollIndicatorPosition:
    | Animated.Value
    | Animated.AnimatedInterpolation<number>;
  scrollViewHeight: number;
  setContentHeight: (height: number) => void;
  setScrollViewHeight: (height: number) => void;
}

export function useScrollIndicator(): UseScrollIndicatorReturn {
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [scrollViewHeight, setScrollViewHeight] = useState<number>(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const fallbackScrollValue = useRef(new Animated.Value(0)).current;

  const scrollIndicatorHeight =
    scrollViewHeight > 0 &&
    contentHeight > 0 &&
    contentHeight > scrollViewHeight
      ? Math.max((scrollViewHeight * scrollViewHeight) / contentHeight, n(20))
      : 0;

  const scrollIndicatorPosition =
    contentHeight > scrollViewHeight && scrollIndicatorHeight > 0
      ? scrollY.interpolate({
          inputRange: [0, contentHeight - scrollViewHeight],
          outputRange: [0, scrollViewHeight - scrollIndicatorHeight],
          extrapolate: "clamp",
        })
      : fallbackScrollValue;

  const handleScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
      }),
    [scrollY]
  );

  return {
    contentHeight,
    handleScroll,
    scrollIndicatorHeight,
    scrollIndicatorPosition,
    scrollViewHeight,
    setContentHeight,
    setScrollViewHeight,
  };
}
