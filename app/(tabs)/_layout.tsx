import { Tabs } from "expo-router";
import { Navbar, type TabConfigItem } from "@/components/Navbar";

export const TABS_CONFIG: readonly TabConfigItem[] = [
  { name: "Liked Songs", screenName: "index", iconName: "home" },
  { name: "Search", screenName: "search", iconName: "search" },
  { name: "Settings", screenName: "settings", iconName: "settings" },
] as const;

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => {
        const activeScreenName = props.state.routes[props.state.index].name;
        return (
          <Navbar
            currentScreenName={activeScreenName}
            navigation={props.navigation}
            tabsConfig={TABS_CONFIG}
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
