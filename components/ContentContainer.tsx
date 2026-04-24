import type { MaterialIcons } from "@expo/vector-icons";
import { router, useSegments } from "expo-router";
import type { ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Header } from "@/components/Header";
import { SwipeBackContainer } from "@/components/SwipeBackContainer";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useScrollIndicator } from "@/hooks/useScrollIndicator";
import { n } from "@/utils/scaling";

interface RightAction {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  show?: boolean;
}

interface ContentContainerProps {
  children?: ReactNode;
  contentGap?: number;
  contentWidth?: "wide" | "normal";
  headerTitle?: string;
  hideBackButton?: boolean;
  rightAction?: RightAction;
}

export default function ContentContainer({
  headerTitle,
  children,
  hideBackButton = false,
  rightAction,
  contentWidth = "normal",
  contentGap = 47,
}: ContentContainerProps) {
  const segments = useSegments();
  const hasNavbar = segments?.[0] === "(tabs)";
  const { invertColors } = useInvertColors();
  const {
    handleScroll,
    scrollIndicatorHeight,
    scrollIndicatorPosition,
    setContentHeight,
    setScrollViewHeight,
  } = useScrollIndicator();

  const canSwipeBack = Boolean(headerTitle) && !hideBackButton;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <SwipeBackContainer enabled={canSwipeBack} onSwipeBack={handleBack}>
      <View
        style={[
          styles.container,
          { backgroundColor: invertColors ? "white" : "black" },
        ]}
      >
        {headerTitle && (
          <Header
            headerTitle={headerTitle}
            hideBackButton={hideBackButton}
            rightAction={rightAction}
          />
        )}
        <View
          style={[
            styles.scrollWrapper,
            { paddingBottom: hasNavbar ? undefined : n(20) },
          ]}
        >
          <Animated.ScrollView
            onLayout={(event) =>
              setScrollViewHeight(event.nativeEvent.layout.height)
            }
            onScroll={handleScroll}
            overScrollMode="never"
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            <View
              onLayout={(event) =>
                setContentHeight(event.nativeEvent.layout.height)
              }
              style={[
                styles.content,
                {
                  gap: n(contentGap),
                  paddingLeft: contentWidth === "wide" ? n(20) : n(37),
                  paddingRight: contentWidth === "wide" ? n(32) : n(46),
                },
              ]}
            >
              {children ?? null}
            </View>
          </Animated.ScrollView>
          {scrollIndicatorHeight > 0 && (
            <View
              style={[
                styles.scrollIndicatorTrack,
                {
                  right: contentWidth === "wide" ? n(18) : n(34),
                  backgroundColor: invertColors ? "black" : "white",
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.scrollIndicatorThumb,
                  {
                    backgroundColor: invertColors ? "black" : "white",
                  },
                  {
                    height: scrollIndicatorHeight,
                    transform: [
                      {
                        translateY: scrollIndicatorPosition,
                      },
                    ],
                  },
                ]}
              />
            </View>
          )}
        </View>
      </View>
    </SwipeBackContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    gap: n(14),
  },
  scrollWrapper: {
    flex: 1,
    flexDirection: "row",
    width: "100%",
    position: "relative",
  },
  content: {
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingHorizontal: n(37),
    gap: n(47),
  },
  scrollIndicatorTrack: {
    width: n(1),
    height: "100%",
    position: "absolute",
  },
  scrollIndicatorThumb: {
    width: n(5),
    position: "absolute",
    right: n(-2),
  },
});
