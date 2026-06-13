import { useCallback, useState } from "react";
import {
  type AnimatedStyle,
  type ScrollHandlerProcessed,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { n } from "@/utils/scaling";

interface UseScrollIndicatorReturn {
  contentHeight: number;
  handleScroll: ScrollHandlerProcessed;
  scrollIndicatorHeight: number;
  scrollIndicatorPosition: SharedValue<number>;
  scrollIndicatorStyle: AnimatedStyle<{
    height: number;
    transform: { translateY: number }[];
  }>;
  scrollViewHeight: number;
  setContentHeight: (height: number) => void;
  setScrollViewHeight: (height: number) => void;
}

const MIN_THUMB_HEIGHT = n(20);

export function useScrollIndicator(): UseScrollIndicatorReturn {
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [scrollViewHeight, setScrollViewHeight] = useState<number>(0);
  const contentHeightValue = useSharedValue(0);
  const scrollViewHeightValue = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const scrollIndicatorPosition = useSharedValue(0);

  const scrollIndicatorHeight =
    scrollViewHeight > 0 &&
    contentHeight > 0 &&
    contentHeight > scrollViewHeight
      ? Math.max(
          (scrollViewHeight * scrollViewHeight) / contentHeight,
          MIN_THUMB_HEIGHT
        )
      : 0;

  const scrollIndicatorHeightValue = useDerivedValue(() => {
    const viewportHeight = scrollViewHeightValue.value;
    const totalHeight = contentHeightValue.value;

    return viewportHeight > 0 && totalHeight > viewportHeight
      ? Math.max(
          (viewportHeight * viewportHeight) / totalHeight,
          MIN_THUMB_HEIGHT
        )
      : 0;
  });

  const handleScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const scrollIndicatorStyle = useAnimatedStyle(() => {
    const totalHeight = contentHeightValue.value;
    const viewportHeight = scrollViewHeightValue.value;
    const thumbHeight = scrollIndicatorHeightValue.value;

    if (totalHeight <= viewportHeight || thumbHeight <= 0) {
      scrollIndicatorPosition.value = 0;
      return {
        height: thumbHeight,
        transform: [{ translateY: 0 }],
      };
    }

    const maxScrollY = totalHeight - viewportHeight;
    const maxThumbY = viewportHeight - thumbHeight;
    const nextPosition = Math.max(
      0,
      Math.min((scrollY.value / maxScrollY) * maxThumbY, maxThumbY)
    );
    scrollIndicatorPosition.value = nextPosition;
    return {
      height: thumbHeight,
      transform: [{ translateY: nextPosition }],
    };
  });

  const setContentHeightValue = useCallback(
    (height: number) => {
      setContentHeight(height);
      contentHeightValue.value = height;
    },
    [contentHeightValue]
  );

  const setScrollViewHeightValue = useCallback(
    (height: number) => {
      setScrollViewHeight(height);
      scrollViewHeightValue.value = height;
    },
    [scrollViewHeightValue]
  );

  return {
    contentHeight,
    handleScroll,
    scrollIndicatorHeight,
    scrollIndicatorPosition,
    scrollIndicatorStyle,
    scrollViewHeight,
    setContentHeight: setContentHeightValue,
    setScrollViewHeight: setScrollViewHeightValue,
  };
}
