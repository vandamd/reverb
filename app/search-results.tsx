import { useLocalSearchParams } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { StyledButton } from "@/components/StyledButton";

export default function SearchResultsScreen() {
  const { query } = useLocalSearchParams<{ query: string }>();

  if (!query) {
    return <ContentContainer headerTitle=" " />;
  }

  return (
    <ContentContainer headerTitle={`Results for "${query}"`}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
        <StyledButton key={num} text={`${query} - Result ${num}`} />
      ))}
    </ContentContainer>
  );
}
