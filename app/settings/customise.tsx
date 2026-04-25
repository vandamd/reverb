import ContentContainer from "@/components/ContentContainer";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { useCustomiseSettings } from "@/contexts/CustomiseSettingsContext";
import { useInvertColors } from "@/contexts/InvertColorsContext";

export default function CustomiseScreen() {
  const { invertColors, setInvertColors } = useInvertColors();
  const {
    hideLikedSongs,
    hideLyrics,
    hidePlaylists,
    setHideLikedSongs,
    setHideLyrics,
    setHidePlaylists,
  } = useCustomiseSettings();

  return (
    <ContentContainer headerTitle="Customise">
      <ToggleSwitch
        label="Invert Colours"
        onValueChange={setInvertColors}
        value={invertColors}
      />
      <ToggleSwitch
        label="Hide Liked Songs"
        onValueChange={setHideLikedSongs}
        value={hideLikedSongs}
      />
      <ToggleSwitch
        label="Hide Lyrics"
        onValueChange={setHideLyrics}
        value={hideLyrics}
      />
      <ToggleSwitch
        label="Hide Playlists"
        onValueChange={setHidePlaylists}
        value={hidePlaylists}
      />
    </ContentContainer>
  );
}
