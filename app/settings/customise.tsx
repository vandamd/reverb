import { type Href, router } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { SelectorButton } from "@/components/SelectorButton";
import { StyledButton } from "@/components/StyledButton";
import { useOptionExample } from "@/contexts/OptionExampleContext";

const OPTION_LABELS: Record<string, string> = {
  "option-1": "Option 1",
  "option-2": "Option 2",
  "option-3": "Option 3",
};

export default function CustomiseScreen() {
  const { optionExample } = useOptionExample();

  return (
    <ContentContainer headerTitle="Customise">
      <StyledButton
        onPress={() => router.push("/settings/customise-interface" as Href)}
        text="Interface"
      />
      <SelectorButton
        href="/settings/option-example"
        label="Option Example"
        value={OPTION_LABELS[optionExample]}
      />
    </ContentContainer>
  );
}
