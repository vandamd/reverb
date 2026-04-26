import { type Href, router } from "expo-router";
import { useCallback } from "react";
import { ContentList } from "@/components/ContentList";
import { EmptyState } from "@/components/EmptyState";
import { TrackListItem } from "@/components/TrackListItem";
import {
  useLibraryLikedTracks,
  useLibraryStatus,
} from "@/contexts/LibraryContext";
import { usePlaybackControls } from "@/contexts/PlaybackContext";
import type { LocalTrack } from "@/types/music";

export default function LikedSongsScreen() {
  const likedTracks = useLibraryLikedTracks();
  const { isLoading, isScanning } = useLibraryStatus();
  const { playQueue } = usePlaybackControls();
  const renderTrack = useCallback(
    ({ index, item: track }: { index: number; item: LocalTrack }) => (
      <TrackListItem
        onPress={async () => {
          await playQueue(likedTracks, index);
          router.push("/playing" as Href);
        }}
        showLikedIndicator={false}
        track={track}
      />
    ),
    [likedTracks, playQueue]
  );

  return (
    <ContentList
      contentGap={8}
      contentWidth="wide"
      data={likedTracks}
      emptyComponent={
        <EmptyState
          title={isLoading || isScanning ? "Loading..." : "No liked songs yet"}
        />
      }
      headerTitle="Liked Songs"
      hideBackButton
      keyExtractor={(track) => track.id}
      renderItem={renderTrack}
      rightAction={{
        icon: "graphic-eq",
        onPress: () => {
          router.push("/playing" as Href);
        },
      }}
    />
  );
}
