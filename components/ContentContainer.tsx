import { router, useSegments } from "expo-router";
import type { ReactNode } from "react";
import {
  Animated,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { Header } from "@/components/Header";
import type { MaterialIconName } from "@/components/MaterialIcon";
import { SwipeBackContainer } from "@/components/SwipeBackContainer";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useScrollIndicator } from "@/hooks/useScrollIndicator";
import { n } from "@/utils/scaling";

interface RightAction {
  icon: MaterialIconName;
  onPress: () => void;
  show?: boolean;
}

interface LeftAction {
  icon: MaterialIconName;
  onPress: () => void;
  show?: boolean;
}

interface ContentContainerProps {
  bottomPadding?: number;
  children?: ReactNode;
  contentGap?: number;
  contentWidth?: "normal" | "playing" | "wide";
  footer?: ReactNode;
  headerTitle?: string;
  hideBackButton?: boolean;
  leftAction?: LeftAction;
  onBackPress?: () => void;
  rightAction?: RightAction;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function ContentContainer({
  headerTitle,
  children,
  bottomPadding,
  hideBackButton = false,
  leftAction,
  onBackPress,
  rightAction,
  scrollable = true,
  style,
  footer,
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
  let contentPadding = {
    paddingLeft: n(37),
    paddingRight: n(46),
  };
  let scrollIndicatorRight = n(34);

  if (contentWidth === "wide") {
    contentPadding = {
      paddingLeft: n(20),
      paddingRight: n(32),
    };
    scrollIndicatorRight = n(18);
  }

  if (contentWidth === "playing") {
    contentPadding = {
      paddingLeft: n(20),
      paddingRight: n(20),
    };
    scrollIndicatorRight = n(6);
  }

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }

    if (router.canGoBack()) {
      router.back();
    }
  };
  const resolvedBottomPadding = bottomPadding ?? (hasNavbar ? 0 : 20);

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
            leftAction={leftAction}
            onBackPress={handleBack}
            rightAction={rightAction}
          />
        )}
        <View style={styles.body}>
          <View
            style={[
              styles.scrollWrapper,
              { paddingBottom: footer ? 0 : n(resolvedBottomPadding) },
            ]}
          >
            {scrollable ? (
              <ScrollView
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
                      ...contentPadding,
                    },
                    style,
                  ]}
                >
                  {children ?? null}
                </View>
              </ScrollView>
            ) : (
              <View
                onLayout={(event) =>
                  setContentHeight(event.nativeEvent.layout.height)
                }
                style={[
                  styles.staticContent,
                  {
                    gap: n(contentGap),
                    ...contentPadding,
                  },
                  style,
                ]}
              >
                {children ?? null}
              </View>
            )}
            {scrollable && scrollIndicatorHeight > 0 && (
              <View
                style={[
                  styles.scrollIndicatorTrack,
                  {
                    right: scrollIndicatorRight,
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
          {footer ? (
            <View
              style={[
                styles.footer,
                contentPadding,
                {
                  gap: undefined,
                  paddingBottom: n(resolvedBottomPadding),
                },
              ]}
            >
              {footer}
            </View>
          ) : null}
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
  body: {
    flex: 1,
    width: "100%",
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
  footer: {
    width: "100%",
  },
  staticContent: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingHorizontal: n(37),
    gap: n(47),
    width: "100%",
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
