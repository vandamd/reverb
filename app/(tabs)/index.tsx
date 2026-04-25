import { type Href, router } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { TrackListItem } from "@/components/TrackListItem";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePlayback } from "@/contexts/PlaybackContext";

export default function LikedSongsScreen() {
  const { isLoading, isScanning, likedTracks } = useLibrary();
  const { playQueue } = usePlayback();

  return (
    <ContentContainer
      contentGap={8}
      contentWidth="wide"
      headerTitle="Liked Songs"
      hideBackButton
      rightAction={{
        icon: "multitrack-audio",
        onPress: () => {
          router.push("/playing" as Href);
        },
      }}
      scrollable={likedTracks.length > 0}
      style={
        likedTracks.length === 0
          ? { alignItems: "center", justifyContent: "center" }
          : undefined
      }
    >
      {likedTracks.length === 0 ? (
        <EmptyState
          title={
            isLoading || isScanning
              ? "Scanning Music/Tunes..."
              : "No liked songs yet"
          }
        />
      ) : (
        likedTracks.map((track, index) => (
          <TrackListItem
            key={track.id}
            onPress={async () => {
              await playQueue(likedTracks, index);
              router.push("/playing" as Href);
            }}
            showLikedIndicator={false}
            track={track}
          />
        ))
      )}
    </ContentContainer>
  );
}
