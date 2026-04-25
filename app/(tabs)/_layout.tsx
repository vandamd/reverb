import { Tabs } from "expo-router";
import { Navbar, type TabConfigItem } from "@/components/Navbar";
import { useCustomiseSettings } from "@/contexts/CustomiseSettingsContext";

export const TABS_CONFIG: readonly TabConfigItem[] = [
  { name: "Albums", screenName: "index", iconName: "album" },
  { name: "Playlists", screenName: "playlists", iconName: "queue-music" },
  { name: "Liked Songs", screenName: "liked", iconName: "favorite" },
  { name: "Search", screenName: "search", iconName: "search" },
  { name: "Settings", screenName: "settings", iconName: "settings" },
] as const;

export default function TabLayout() {
  const { hideLikedSongs, hidePlaylists } = useCustomiseSettings();
  const visibleTabsConfig = TABS_CONFIG.filter((tab) => {
    if (tab.screenName === "liked") {
      return !hideLikedSongs;
    }
    if (tab.screenName === "playlists") {
      return !hidePlaylists;
    }
    return true;
  });

  return (
    <Tabs
      tabBar={(props) => {
        const activeScreenName = props.state.routes[props.state.index].name;
        return (
          <Navbar
            currentScreenName={activeScreenName}
            navigation={props.navigation}
            tabsConfig={visibleTabsConfig}
          />
        );
      }}
    >
      {TABS_CONFIG.map((tab) => (
        <Tabs.Screen
          key={tab.screenName}
          name={tab.screenName}
          options={{ header: () => null }}
        />
      ))}
    </Tabs>
  );
}
