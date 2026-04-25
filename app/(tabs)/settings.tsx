import { nativeApplicationVersion } from "expo-application";
import { type Href, router } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { StyledButton } from "@/components/StyledButton";
import { useLibraryActions, useLibraryStatus } from "@/contexts/LibraryContext";

export default function SettingsScreen() {
  const { refreshLibrary } = useLibraryActions();
  const { isScanning } = useLibraryStatus();

  return (
    <ContentContainer
      headerTitle={`Settings (v${nativeApplicationVersion})`}
      hideBackButton
    >
      <StyledButton
        onPress={() => {
          router.push("/settings/customise" as Href);
        }}
        text="Customise"
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
