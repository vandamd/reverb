import { type Href, router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { StyledText } from "@/components/StyledText";
import { TrackArtwork } from "@/components/TrackArtwork";
import { TrackListItem } from "@/components/TrackListItem";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePlayback } from "@/contexts/PlaybackContext";
import { summariseTracks } from "@/services/librarySelectors";
import { n } from "@/utils/scaling";

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getPlaylistTracks, playlists } = useLibrary();
  const { playQueue } = usePlayback();
  const playlist = playlists.find((item) => item.id === id);
  const tracks = getPlaylistTracks(playlist);

  if (!playlist) {
    return (
      <ContentContainer
        headerTitle="Playlist"
        scrollable={false}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState title="Playlist not found" />
      </ContentContainer>
    );
  }

  return (
    <ContentContainer
      contentGap={28}
      contentWidth="wide"
      headerTitle={playlist.name}
      rightAction={{
        icon: "edit",
        onPress: () =>
          router.push(
            `/playlist/${encodeURIComponent(playlist.id)}/edit` as Href
          ),
      }}
    >
      <View style={styles.hero}>
        <TrackArtwork
          fallbackIcon="queue-music"
          size={126}
          uri={playlist.coverUri}
        />
        <View style={styles.heroCopy}>
          <StyledText numberOfLines={2} style={styles.title}>
            {playlist.name}
          </StyledText>
          <StyledText style={styles.meta}>{summariseTracks(tracks)}</StyledText>
        </View>
      </View>
      {tracks.length === 0 ? null : (
        <View style={styles.tracks}>
          {tracks.map((track, index) => (
            <TrackListItem
              key={track.id}
              onLongPress={() => {
                router.push({
                  pathname: "/track-actions",
                  params: {
                    playlistId: playlist.id,
                    trackId: track.id,
                  },
                });
              }}
              onPress={async () => {
                await playQueue(tracks, index);
                router.push("/playing" as Href);
              }}
              track={track}
            />
          ))}
        </View>
      )}
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    flexDirection: "row",
    gap: n(16),
    width: "100%",
  },
  heroCopy: {
    flex: 1,
    gap: n(7),
    minWidth: n(0),
  },
  meta: {
    fontSize: n(16),
    lineHeight: n(19),
  },
  title: {
    fontSize: n(28),
    lineHeight: n(31),
  },
  tracks: {
    gap: n(8),
    width: "100%",
  },
});
