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

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { albums } = useLibrary();
  const { playQueue } = usePlayback();
  const album = albums.find((item) => item.id === id);

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
    <ContentContainer
      contentGap={28}
      contentWidth="wide"
      headerTitle={album.title}
    >
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
            {summariseTracks(album.tracks)}
          </StyledText>
        </View>
      </View>
      <View style={styles.tracks}>
        {album.tracks.map((track, index) => (
          <TrackListItem
            indexLabel={
              track.trackNumber ? track.trackNumber.toString() : `${index + 1}`
            }
            key={track.id}
            onLongPress={() => {
              router.push({
                pathname: "/track-actions",
                params: { trackId: track.id },
              });
            }}
            onPress={async () => {
              await playQueue(album.tracks, index);
              router.push("/playing" as Href);
            }}
            track={track}
          />
        ))}
      </View>
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
  subtitle: {
    fontSize: n(20),
    lineHeight: n(23),
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
