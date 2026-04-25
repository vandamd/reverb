import { type Href, router } from "expo-router";
import ContentContainer from "@/components/ContentContainer";
import { MediaListItem } from "@/components/MediaListItem";
import { useLibrary } from "@/contexts/LibraryContext";
import { summariseTracks } from "@/services/librarySelectors";

export default function PlaylistsScreen() {
  const { getPlaylistTracks, playlists } = useLibrary();

  return (
    <ContentContainer
      contentGap={8}
      contentWidth="wide"
      headerTitle="Playlists"
      hideBackButton
      rightAction={{
        icon: "multitrack-audio",
        onPress: () => {
          router.push("/playing" as Href);
        },
      }}
    >
      <MediaListItem
        fallbackIcon="add"
        onPress={() => router.push("/playlist/new" as Href)}
        title="Create new playlist"
      />
      {playlists.map((playlist) => {
        const tracks = getPlaylistTracks(playlist);
        return (
          <MediaListItem
            artworkUri={playlist.coverUri}
            fallbackIcon="queue-music"
            key={playlist.id}
            onPress={() =>
              router.push(
                `/playlist/${encodeURIComponent(playlist.id)}` as Href
              )
            }
            subtitle={summariseTracks(tracks)}
            title={playlist.name}
          />
        );
      })}
    </ContentContainer>
  );
}
