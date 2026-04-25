import { type Href, router } from "expo-router";
import { useCallback, useMemo } from "react";
import ContentContainer from "@/components/ContentContainer";
import { ContentList } from "@/components/ContentList";
import { EmptyState } from "@/components/EmptyState";
import { MediaListItem } from "@/components/MediaListItem";
import { useLibraryAlbums } from "@/contexts/LibraryContext";
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
  const { albums, isLoading, isScanning } = useLibraryAlbums();
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

  const renderAlbum = useCallback(
    ({ item: album }: { item: LocalAlbum }) => (
      <MediaListItem
        artworkUri={album.artworkUri}
        onPress={() =>
          router.push(`/album/${encodeURIComponent(album.id)}` as Href)
        }
        subtitle={album.artist}
        title={album.title}
      />
    ),
    []
  );

  const headerActions = {
    leftAction: {
      icon: "sort" as const,
      onPress: () => {
        router.push("/albums-sort" as Href);
      },
    },
    rightAction: {
      icon: "multitrack-audio" as const,
      onPress: () => {
        router.push("/playing" as Href);
      },
    },
  };

  if (sortedAlbums.length === 0) {
    return (
      <ContentContainer
        contentWidth="wide"
        headerTitle="Albums"
        hideBackButton
        leftAction={headerActions.leftAction}
        rightAction={headerActions.rightAction}
        scrollable={false}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState
          title={isLoading || isScanning ? "Loading..." : "No albums yet"}
        />
      </ContentContainer>
    );
  }

  return (
    <ContentList
      bottomPadding={0}
      contentGap={8}
      contentWidth="wide"
      data={sortedAlbums}
      headerTitle="Albums"
      hideBackButton
      keyExtractor={(album) => album.id}
      leftAction={headerActions.leftAction}
      renderItem={renderAlbum}
      rightAction={headerActions.rightAction}
    />
  );
}
