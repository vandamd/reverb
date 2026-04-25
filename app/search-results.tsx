import { type Href, router, useLocalSearchParams } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { TrackListItem } from "@/components/TrackListItem";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePlayback } from "@/contexts/PlaybackContext";

export default function SearchResultsScreen() {
  const { query } = useLocalSearchParams<{ query: string }>();
  const { searchTracks } = useLibrary();
  const { playQueue } = usePlayback();
  const results = searchTracks(query ?? "");

  return (
    <ContentContainer
      contentGap={8}
      contentWidth="wide"
      headerTitle={query ? `Search: ${query}` : "Search"}
      scrollable={results.length > 0}
      style={
        results.length === 0
          ? { alignItems: "center", justifyContent: "center" }
          : undefined
      }
    >
      {results.length === 0 ? (
        <EmptyState title="No results" />
      ) : (
        results.map((track, index) => (
          <TrackListItem
            key={track.id}
            onPress={async () => {
              await playQueue(results, index);
              router.push("/playing" as Href);
            }}
            track={track}
          />
        ))
      )}
    </ContentContainer>
  );
}
