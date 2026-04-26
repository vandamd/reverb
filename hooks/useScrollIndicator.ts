import { useMemo, useRef, useState } from "react";
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { n } from "@/utils/scaling";

interface UseScrollIndicatorReturn {
  contentHeight: number;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollIndicatorHeight: number;
  scrollIndicatorPosition: Animated.Value;
  scrollViewHeight: number;
  setContentHeight: (height: number) => void;
  setScrollViewHeight: (height: number) => void;
}

export function useScrollIndicator(): UseScrollIndicatorReturn {
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [scrollViewHeight, setScrollViewHeight] = useState<number>(0);
  const scrollY = useRef(0);
  const scrollIndicatorPosition = useRef(new Animated.Value(0)).current;

  const scrollIndicatorHeight =
    scrollViewHeight > 0 &&
    contentHeight > 0 &&
    contentHeight > scrollViewHeight
      ? Math.max((scrollViewHeight * scrollViewHeight) / contentHeight, n(20))
      : 0;

  const handleScroll = useMemo(
    () => (event: NativeSyntheticEvent<NativeScrollEvent>) => {
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

      scrollIndicatorPosition.setValue(position);
    },
    [
      contentHeight,
      scrollIndicatorHeight,
      scrollIndicatorPosition.setValue,
      scrollViewHeight,
    ]
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
