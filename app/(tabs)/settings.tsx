import { type Href, router } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { StyledButton } from "@/components/StyledButton";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useLibraryActions, useLibraryState } from "@/contexts/LibraryContext";

export default function SettingsScreen() {
  const { invertColors, setInvertColors } = useInvertColors();
  const { refreshLibrary } = useLibraryActions();
  const { isScanning } = useLibraryState();

  return (
    <ContentContainer
      headerTitle="Settings"
      hideBackButton
      rightAction={{
        icon: "multitrack-audio",
        onPress: () => {
          router.push("/playing" as Href);
        },
      }}
    >
      <ToggleSwitch
        label="Invert Colours"
        onValueChange={setInvertColors}
        value={invertColors}
      />
      <StyledButton
        onPress={async () => {
          await refreshLibrary();
        }}
        text={isScanning ? "Scanning..." : "Rescan Library"}
      />
    </ContentContainer>
  );
}
