import { launchImageLibraryAsync } from "expo-image-picker";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { StyledButton } from "@/components/StyledButton";
import { useLibrary } from "@/contexts/LibraryContext";
import { saveCoverImage } from "@/utils/cover";

export default function EditPlaylistScreen() {
  const { action, confirmed, id } = useLocalSearchParams<{
    action?: string;
    confirmed?: string;
    id: string;
  }>();
  const { deletePlaylist, playlists, setPlaylistCover } = useLibrary();
  const playlist = playlists.find((item) => item.id === id);

  useEffect(() => {
    if (confirmed !== "true" || action !== "deletePlaylist" || !id) {
      return;
    }

    deletePlaylist(id).then(() => {
      router.dismissTo("/(tabs)/playlists" as Href);
    });
  }, [action, confirmed, deletePlaylist, id]);

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
        onPress={async () => {
          const result = await launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            mediaTypes: ["images"],
            quality: 1,
          });

          if (result.canceled || result.assets.length === 0) {
            return;
          }

          const coverUri = await saveCoverImage(playlist.id, result.assets[0]);
          await setPlaylistCover(playlist.id, coverUri);
          router.back();
        }}
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
