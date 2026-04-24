import ContentContainer from "./ContentContainer";
import { StyledButton } from "./StyledButton";

interface Option {
  label: string;
  value: string;
}

interface OptionsSelectorProps {
  onSelect: (value: string) => void;
  options: Option[];
  selectedValue: string;
  title: string;
}

export function OptionsSelector({
  title,
  options,
  selectedValue,
  onSelect,
}: OptionsSelectorProps) {
  return (
    <ContentContainer headerTitle={title}>
      {options.map((option) => (
        <StyledButton
          key={option.value}
          onPress={() => onSelect(option.value)}
          selected={selectedValue === option.value}
          text={option.label}
        />
      ))}
    </ContentContainer>
  );
}
