# App Template
Expo template with pre-built components and patterns.

## Rules
- Use `n()` for all numeric style values
- Use bun instead of npm
- Minimise `useEffect` - see [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- Readable code > comments

## Commands
- `bun dev` - Build and run
- `bun run sync-version` - Sync version from app.json to package.json + build.gradle
- `bun run generate-icon` - Generate app icon from first letter of app name
- `bun run generate-readme-image` - Generate README example image (requires A.png, B.png, C.png, D.png in assets/images/)
- `bun run check` - Lint
- `bun run fix` - Automatically fix linting issues

## Setup
Update `app.json`:
```json
{
  "expo": {
    "name": "App Name",
    "slug": "appname",
    "icon": "./assets/icon.png",
    "android": {
      "package": "com.vandam.appname"
    }
  }
}
```
Delete `/android` folder before first build (regenerates with your config).

## GitHub Actions
Workflow at `.github/workflows/build.yml` builds APK and creates release:
1. Triggered manually via `workflow_dispatch`
2. Builds production APK using EAS
3. Creates GitHub release with changelog

Requires `EXPO_TOKEN` secret in repo settings.

## Styling with `n()`
**Always use `n()` for sizes** - normalises across screen densities:
```tsx
import { n } from "@/utils/scaling";

const styles = StyleSheet.create({
  container: { padding: n(16) },
  text: { fontSize: n(18) },
  icon: { width: n(24), height: n(24) }
});
```

## ContentContainer
Wrap screen content in `ContentContainer` - handles scrolling, theming, padding, and scroll indicators automatically. No styling needed on children.
```tsx
import ContentContainer from "@/components/ContentContainer";

export default function MyScreen() {
  return (
    <ContentContainer headerTitle="My Screen">
      <MyComponent />
      <AnotherComponent />
    </ContentContainer>
  );
}
```

Props:
- `headerTitle` - Shows header with title (omit to hide)
- `hideBackButton` - Hide back arrow (default: false)
- `rightAction` - Header icon button: `{ icon: "share", onPress: () => {} }`
- `contentWidth` - `"normal"` (default) or `"wide"` for more horizontal space
- `contentGap` - Gap between children (default: 47)

## Tabs
To add a new tab:

1. Create screen file `app/(tabs)/search.tsx`
2. Add to `TABS_CONFIG` in `app/(tabs)/_layout.tsx`:
```tsx
export const TABS_CONFIG: ReadonlyArray<TabConfigItem> = [
  { name: "Home", screenName: "index", iconName: "home" },
  { name: "Search", screenName: "search", iconName: "search" },  // new
  { name: "Settings", screenName: "settings", iconName: "settings" },
] as const;
```
3. Add `<Tabs.Screen>` entry:
```tsx
<Tabs.Screen name="index" />
<Tabs.Screen name="search" />  // new
<Tabs.Screen name="settings" />
```

Icons: Use [MaterialIcons](https://icons.expo.fyi/Index) names.

## Settings Pattern
Settings use nested routes:
```
app/(tabs)/settings.tsx         → Main settings page
app/settings/customise.tsx      → Customise options
app/settings/option-example.tsx → Options page (example)
```

Use `SelectorButton` + `OptionsSelector` for option pickers:
```tsx
// In settings page
<SelectorButton
    label="Option Example"
    value={currentValue}
    href="/settings/option-example"
/>

// In options page (app/settings/option-example.tsx)
<OptionsSelector
    title="Option Example"
    options={[{ label: "Standard", value: "standard" }, ...]}
    selectedValue={optionValue}
    onSelect={(value) => setOptionValue(value)}
/>
```

## Confirmation Screen
For destructive actions, use the confirm screen pattern:
```tsx
router.push({
    pathname: "/confirm",
    params: {
        title: "Clear Cache",
        message: "Are you sure?",
        confirmText: "Clear",
        action: "clearCache",
        returnPath: "/(tabs)/settings",
    },
});

// Handle confirmation in useEffect
useEffect(() => {
    if (params.confirmed === "true" && params.action === "clearCache") {
        router.setParams({ confirmed: undefined, action: undefined });
        // Do the action
    }
}, [params.confirmed, params.action]);
```

## Contexts
Wrapped in `app/_layout.tsx`:
- `InvertColorsContext` - Theme toggle (black/white), persists to AsyncStorage
- `OptionExampleContext` - Example setting context (see `app/settings/option-example.tsx`)

Use: `const { invertColors } = useInvertColors();`

## Haptic Feedback
Use `HapticPressable` instead of `Pressable` for automatic haptic feedback on press.
