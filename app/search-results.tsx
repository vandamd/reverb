import { type Href, router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ContentList } from "@/components/ContentList";
import { EmptyState } from "@/components/EmptyState";
import { TrackListItem } from "@/components/TrackListItem";
import { useLibraryState } from "@/contexts/LibraryContext";
import { usePlaybackControls } from "@/contexts/PlaybackContext";
import type { LocalTrack } from "@/types/music";

export default function SearchResultsScreen() {
  const { query } = useLocalSearchParams<{ query: string }>();
  const { searchTracks } = useLibraryState();
  const { playQueue } = usePlaybackControls();
  const results = searchTracks(query ?? "");
  const renderTrack = useCallback(
    ({ index, item: track }: { index: number; item: LocalTrack }) => (
      <TrackListItem
        onPress={async () => {
          await playQueue(results, index);
          router.push("/playing" as Href);
        }}
        track={track}
      />
    ),
    [playQueue, results]
  );

  return (
    <ContentList
      contentGap={8}
      contentWidth="wide"
      data={results}
      emptyComponent={<EmptyState title="No results" />}
      headerTitle={query ? `Search: ${query}` : "Search"}
      keyExtractor={(track) => track.id}
      renderItem={renderTrack}
    />
  );
}
