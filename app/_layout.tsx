import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CustomiseSettingsProvider } from "@/contexts/CustomiseSettingsContext";
import {
  InvertColorsProvider,
  useInvertColors,
} from "@/contexts/InvertColorsContext";
import { LibraryProvider } from "@/contexts/LibraryContext";
import { PlaybackProvider } from "@/contexts/PlaybackContext";

function RootLayout() {
  const { invertColors } = useInvertColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
        contentStyle: {
          backgroundColor: invertColors ? "white" : "black",
        },
      }}
    />
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <InvertColorsProvider>
        <CustomiseSettingsProvider>
          <LibraryProvider>
            <PlaybackProvider>
              <StatusBar hidden />
              <RootLayout />
            </PlaybackProvider>
          </LibraryProvider>
        </CustomiseSettingsProvider>
      </InvertColorsProvider>
    </GestureHandlerRootView>
  );
}
