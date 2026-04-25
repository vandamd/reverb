import ContentContainer from "@/components/ContentContainer";
import { StyledButton } from "@/components/StyledButton";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useLibraryActions, useLibraryStatus } from "@/contexts/LibraryContext";

export default function SettingsScreen() {
  const { invertColors, setInvertColors } = useInvertColors();
  const { refreshLibrary } = useLibraryActions();
  const { isScanning } = useLibraryStatus();

  return (
    <ContentContainer headerTitle="Settings" hideBackButton>
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
