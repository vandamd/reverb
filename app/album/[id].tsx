import { type Href, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { ContentList } from "@/components/ContentList";
import { EmptyState } from "@/components/EmptyState";
import { StyledText } from "@/components/StyledText";
import { TrackArtwork } from "@/components/TrackArtwork";
import { TrackListItem } from "@/components/TrackListItem";
import { useLibraryAlbums } from "@/contexts/LibraryContext";
import { usePlaybackControls } from "@/contexts/PlaybackContext";
import { summariseTracks } from "@/services/librarySelectors";
import type { LocalTrack } from "@/types/music";
import { n } from "@/utils/scaling";

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { albums } = useLibraryAlbums();
  const { playQueue } = usePlaybackControls();
  const album = albums.find((item) => item.id === id);
  const albumTracks = useMemo(() => album?.tracks ?? [], [album?.tracks]);
  const renderTrack = useCallback(
    ({ index, item: track }: { index: number; item: LocalTrack }) => (
      <View
        style={[
          styles.trackRow,
          index > 0 &&
            track.discNumber !== albumTracks[index - 1]?.discNumber &&
            styles.discBreak,
        ]}
      >
        <TrackListItem
          indexLabel={
            track.trackNumber ? track.trackNumber.toString() : `${index + 1}`
          }
          onLongPress={() => {
            router.push({
              pathname: "/track-actions",
              params: { trackId: track.id },
            });
          }}
          onPress={async () => {
            await playQueue(albumTracks, index);
            router.push("/playing" as Href);
          }}
          track={track}
        />
      </View>
    ),
    [albumTracks, playQueue]
  );

  if (!album) {
    return (
      <ContentContainer
        headerTitle="Album"
        scrollable={false}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState title="Album not found" />
      </ContentContainer>
    );
  }

  return (
    <ContentList
      contentGap={8}
      contentWidth="wide"
      data={albumTracks}
      headerComponent={
        <View style={styles.hero}>
          <TrackArtwork size={126} uri={album.artworkUri} />
          <View style={styles.heroCopy}>
            <StyledText numberOfLines={2} style={styles.title}>
              {album.title}
            </StyledText>
            <StyledText numberOfLines={1} style={styles.subtitle}>
              {album.artist}
            </StyledText>
            <StyledText numberOfLines={1} style={styles.meta}>
              {summariseTracks(albumTracks)}
            </StyledText>
          </View>
        </View>
      }
      headerTitle={album.title}
      keyExtractor={(track) => track.id}
      renderItem={renderTrack}
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
    gap: n(2),
    minWidth: n(0),
  },
  discBreak: {
    paddingTop: n(20),
  },
  meta: {
    fontSize: n(16),
    lineHeight: n(19),
  },
  subtitle: {
    fontSize: n(20),
    lineHeight: n(23),
  },
  title: {
    fontSize: n(28),
    lineHeight: n(31),
  },
  trackRow: {
    width: "100%",
  },
});
