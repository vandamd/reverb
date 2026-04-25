import { type Href, router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { ContentList } from "@/components/ContentList";
import { EmptyState } from "@/components/EmptyState";
import { StyledText } from "@/components/StyledText";
import { TrackArtwork } from "@/components/TrackArtwork";
import { TrackListItem } from "@/components/TrackListItem";
import { useLibraryState } from "@/contexts/LibraryContext";
import { usePlaybackControls } from "@/contexts/PlaybackContext";
import { summariseTracks } from "@/services/librarySelectors";
import type { LocalTrack } from "@/types/music";
import { n } from "@/utils/scaling";

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getPlaylistTracks, playlists } = useLibraryState();
  const { playQueue } = usePlaybackControls();
  const playlist = playlists.find((item) => item.id === id);
  const tracks = getPlaylistTracks(playlist);
  const renderTrack = useCallback(
    ({ index, item: track }: { index: number; item: LocalTrack }) => (
      <TrackListItem
        onLongPress={() => {
          if (!playlist) {
            return;
          }
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
    ),
    [playQueue, playlist, tracks]
  );

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
    <ContentList
      contentGap={8}
      contentWidth="wide"
      data={tracks}
      headerComponent={
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
            <StyledText style={styles.meta}>
              {summariseTracks(tracks)}
            </StyledText>
          </View>
        </View>
      }
      headerTitle={playlist.name}
      keyExtractor={(track) => track.id}
      renderItem={renderTrack}
      rightAction={{
        icon: "edit",
        onPress: () =>
          router.push(
            `/playlist/${encodeURIComponent(playlist.id)}/edit` as Href
          ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    flexDirection: "row",
    gap: n(16),
    marginBottom: n(20),
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
});
