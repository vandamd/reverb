import { type Href, router } from "expo-router";
import { useMemo } from "react";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { MediaListItem } from "@/components/MediaListItem";
import { useLibrary } from "@/contexts/LibraryContext";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { LocalAlbum } from "@/types/music";

type AlbumsSortOrder = "artist" | "title";

const compareAlbumsByArtist = (left: LocalAlbum, right: LocalAlbum) => {
  const artistDifference = left.artist.localeCompare(right.artist);
  if (artistDifference !== 0) {
    return artistDifference;
  }
  return left.title.localeCompare(right.title);
};

const compareAlbumsByTitle = (left: LocalAlbum, right: LocalAlbum) => {
  const titleDifference = left.title.localeCompare(right.title);
  if (titleDifference !== 0) {
    return titleDifference;
  }
  return left.artist.localeCompare(right.artist);
};

export default function AlbumsScreen() {
  const { albums, isLoading, isScanning } = useLibrary();
  const [sortOrder] = usePersistedState<AlbumsSortOrder>(
    "albums.sort",
    "artist"
  );
  const sortedAlbums = useMemo(
    () =>
      [...albums].sort((left, right) =>
        sortOrder === "title"
          ? compareAlbumsByTitle(left, right)
          : compareAlbumsByArtist(left, right)
      ),
    [albums, sortOrder]
  );

  return (
    <ContentContainer
      contentGap={8}
      contentWidth="wide"
      headerTitle="Albums"
      hideBackButton
      leftAction={{
        icon: "sort",
        onPress: () => {
          router.push("/albums-sort" as Href);
        },
      }}
      rightAction={{
        icon: "multitrack-audio",
        onPress: () => {
          router.push("/playing" as Href);
        },
      }}
      scrollable={sortedAlbums.length > 0}
      style={
        sortedAlbums.length === 0
          ? { alignItems: "center", justifyContent: "center" }
          : undefined
      }
    >
      {sortedAlbums.length === 0 ? (
        <EmptyState
          title={
            isLoading || isScanning
              ? "Scanning Music/Tunes..."
              : "No albums yet"
          }
        />
      ) : (
        sortedAlbums.map((album) => (
          <MediaListItem
            artworkUri={album.artworkUri}
            key={album.id}
            onPress={() =>
              router.push(`/album/${encodeURIComponent(album.id)}` as Href)
            }
            subtitle={album.artist}
            title={album.title}
          />
        ))
      )}
    </ContentContainer>
  );
}
