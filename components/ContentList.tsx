import type { MaterialIcons } from "@expo/vector-icons";
import { router, useSegments } from "expo-router";
import type { ReactElement, ReactNode } from "react";
import {
  Animated,
  FlatList,
  type FlatListProps,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { Header } from "@/components/Header";
import { SwipeBackContainer } from "@/components/SwipeBackContainer";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useScrollIndicator } from "@/hooks/useScrollIndicator";
import { n } from "@/utils/scaling";

interface Action {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  show?: boolean;
}

interface ContentListProps<ItemT>
  extends Omit<
    FlatListProps<ItemT>,
    | "contentContainerStyle"
    | "data"
    | "ItemSeparatorComponent"
    | "ListHeaderComponent"
  > {
  bottomPadding?: number;
  contentGap?: number;
  contentWidth?: "normal" | "wide";
  data: ItemT[];
  emptyComponent?: ReactElement | null;
  footer?: ReactNode;
  headerComponent?: ReactElement | null;
  headerTitle?: string;
  hideBackButton?: boolean;
  leftAction?: Action;
  listStyle?: ViewStyle;
  onBackPress?: () => void;
  rightAction?: Action;
}

export function ContentList<ItemT>({
  bottomPadding,
  contentGap = 8,
  contentWidth = "normal",
  data,
  emptyComponent,
  footer,
  headerComponent,
  headerTitle,
  hideBackButton = false,
  leftAction,
  listStyle,
  onBackPress,
  renderItem,
  rightAction,
  ...listProps
}: ContentListProps<ItemT>) {
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
  const padding =
    contentWidth === "wide"
      ? { paddingLeft: n(20), paddingRight: n(32) }
      : { paddingLeft: n(37), paddingRight: n(46) };
  const scrollIndicatorRight = contentWidth === "wide" ? n(18) : n(34);
  const resolvedBottomPadding = bottomPadding ?? (hasNavbar ? 0 : 20);

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
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
        {headerTitle ? (
          <Header
            headerTitle={headerTitle}
            hideBackButton={hideBackButton}
            leftAction={leftAction}
            onBackPress={handleBack}
            rightAction={rightAction}
          />
        ) : null}
        <View
          style={[
            styles.listWrapper,
            { paddingBottom: n(footer ? 0 : resolvedBottomPadding) },
          ]}
        >
          <FlatList
            contentInsetAdjustmentBehavior="never"
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.content,
              padding,
              {
                gap: n(contentGap),
              },
              data.length === 0 && !headerComponent
                ? styles.emptyContent
                : null,
              listStyle,
            ]}
            data={data}
            initialNumToRender={16}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={emptyComponent}
            ListHeaderComponent={headerComponent}
            maxToRenderPerBatch={24}
            onContentSizeChange={(_, height) => setContentHeight(height)}
            onLayout={(event) =>
              setScrollViewHeight(event.nativeEvent.layout.height)
            }
            onScroll={handleScroll as FlatListProps<ItemT>["onScroll"]}
            overScrollMode="never"
            renderItem={renderItem}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            windowSize={9}
            {...listProps}
          />
          {scrollIndicatorHeight > 0 ? (
            <View
              style={[
                styles.scrollIndicatorTrack,
                {
                  backgroundColor: invertColors ? "black" : "white",
                  right: scrollIndicatorRight,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.scrollIndicatorThumb,
                  {
                    backgroundColor: invertColors ? "black" : "white",
                    height: scrollIndicatorHeight,
                    transform: [{ translateY: scrollIndicatorPosition }],
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
        {footer ? (
          <View
            style={[
              styles.footer,
              padding,
              { paddingBottom: n(resolvedBottomPadding) },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </View>
    </SwipeBackContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: n(14),
    width: "100%",
  },
  content: {
    alignItems: "flex-start",
    flexGrow: 1,
    justifyContent: "flex-start",
    width: "100%",
  },
  emptyContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    width: "100%",
  },
  listWrapper: {
    flex: 1,
    position: "relative",
    width: "100%",
  },
  scrollIndicatorThumb: {
    left: n(-2.2),
    position: "absolute",
    width: n(5),
  },
  scrollIndicatorTrack: {
    height: "100%",
    position: "absolute",
    width: n(1),
  },
});
