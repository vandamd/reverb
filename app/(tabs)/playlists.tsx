import { type Href, router } from "expo-router";
import { useCallback, useMemo } from "react";
import { ContentList } from "@/components/ContentList";
import { MediaListItem } from "@/components/MediaListItem";
import { useLibraryPlaylists } from "@/contexts/LibraryContext";
import { usePersistedState } from "@/hooks/usePersistedState";
import { summariseTracks } from "@/services/librarySelectors";
import type { LocalPlaylist } from "@/types/music";

type PlaylistsSortOrder = "name" | "createdAt";

const comparePlaylistsByName = (left: LocalPlaylist, right: LocalPlaylist) =>
  left.name.localeCompare(right.name);

const comparePlaylistsByCreatedAt = (
  left: LocalPlaylist,
  right: LocalPlaylist
) => right.createdAt - left.createdAt;

export default function PlaylistsScreen() {
  const { getPlaylistTracks, playlists } = useLibraryPlaylists();
  const [sortOrder] = usePersistedState<PlaylistsSortOrder>(
    "playlists.sort",
    "name"
  );

  const sortedPlaylists = useMemo(
    () =>
      [...playlists].sort((left, right) =>
        sortOrder === "createdAt"
          ? comparePlaylistsByCreatedAt(left, right)
          : comparePlaylistsByName(left, right)
      ),
    [playlists, sortOrder]
  );

  const data = useMemo(
    () => [{ id: "create", kind: "create" as const }, ...sortedPlaylists],
    [sortedPlaylists]
  );

  const renderPlaylist = useCallback(
    ({ item }: { item: LocalPlaylist | { id: string; kind: "create" } }) => {
      if ("kind" in item) {
        return (
          <MediaListItem
            fallbackIcon="add"
            onPress={() => router.push("/playlist/new" as Href)}
            title="Create new playlist"
          />
        );
      }
      const tracks = getPlaylistTracks(item);
      return (
        <MediaListItem
          artworkUri={item.coverUri}
          fallbackIcon="queue-music"
          onPress={() =>
            router.push(`/playlist/${encodeURIComponent(item.id)}` as Href)
          }
          subtitle={summariseTracks(tracks)}
          title={item.name}
        />
      );
    },
    [getPlaylistTracks]
  );

  return (
    <ContentList
      contentGap={8}
      contentWidth="wide"
      data={data}
      headerTitle="Playlists"
      hideBackButton
      keyExtractor={(item) => item.id}
      leftAction={{
        icon: "sort" as const,
        onPress: () => {
          router.push("/playlists-sort" as Href);
        },
      }}
      renderItem={renderPlaylist}
      rightAction={{
        icon: "multitrack-audio",
        onPress: () => {
          router.push("/playing" as Href);
        },
      }}
    />
  );
}
