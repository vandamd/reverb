import { type Href, router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { StyledButton } from "@/components/StyledButton";
import { useLibrary } from "@/contexts/LibraryContext";

export default function EditPlaylistScreen() {
  const { action, confirmed, id } = useLocalSearchParams<{
    action?: string;
    confirmed?: string;
    id: string;
  }>();
  const { deletePlaylist, playlists } = useLibrary();
  const playlist = playlists.find((item) => item.id === id);
  const isDeletingPlaylist =
    confirmed === "true" && action === "deletePlaylist";

  useEffect(() => {
    if (!(isDeletingPlaylist && id)) {
      return;
    }

    deletePlaylist(id).then(() => {
      router.dismissTo("/(tabs)/playlists" as Href);
    });
  }, [deletePlaylist, id, isDeletingPlaylist]);

  if (isDeletingPlaylist) {
    return null;
  }

  if (!playlist) {
    return (
      <ContentContainer
        headerTitle="Edit Playlist"
        scrollable={false}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState title="Playlist not found" />
      </ContentContainer>
    );
  }

  const playlistPath = `/playlist/${encodeURIComponent(playlist.id)}`;

  return (
    <ContentContainer headerTitle="Edit Playlist">
      <StyledButton
        onPress={() => router.push(`${playlistPath}/rename` as Href)}
        text="Rename"
      />
      <StyledButton
        onPress={() => router.push(`${playlistPath}/cover` as Href)}
        text="Change Cover"
      />
      <StyledButton
        onPress={() => {
          router.push({
            pathname: "/confirm",
            params: {
              action: "deletePlaylist",
              confirmText: "DELETE",
              message: `Delete ${playlist.name}?`,
              returnPath: `${playlistPath}/edit`,
              title: "Delete Playlist",
            },
          });
        }}
        text="Delete"
      />
    </ContentContainer>
  );
}
