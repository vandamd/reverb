import ContentContainer from "@/components/ContentContainer";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { useInvertColors } from "@/contexts/InvertColorsContext";

export default function CustomiseTabsScreen() {
  const { invertColors, setInvertColors } = useInvertColors();

  return (
    <ContentContainer headerTitle="Customise Interface">
      <ToggleSwitch
        label="Invert Colours"
        onValueChange={setInvertColors}
        value={invertColors}
      />
    </ContentContainer>
  );
}
