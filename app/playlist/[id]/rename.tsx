import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { TextInput } from "@/components/TextInput";
import {
  useLibraryActions,
  useLibraryPlaylists,
} from "@/contexts/LibraryContext";

export default function RenamePlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { renamePlaylist } = useLibraryActions();
  const { playlists } = useLibraryPlaylists();
  const playlist = playlists.find((item) => item.id === id);
  const [name, setName] = useState(playlist?.name ?? "");

  if (!playlist) {
    return (
      <ContentContainer
        headerTitle="Rename Playlist"
        scrollable={false}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState title="Playlist not found" />
      </ContentContainer>
    );
  }

  const save = async () => {
    if (!name.trim()) {
      return;
    }
    await renamePlaylist(playlist.id, name);
    router.back();
  };

  return (
    <ContentContainer
      headerTitle="Rename Playlist"
      rightAction={{
        icon: "check",
        onPress: save,
        show: name.trim().length > 0,
      }}
    >
      <TextInput
        autoFocus
        onChangeText={setName}
        onSubmit={save}
        placeholder="Playlist name"
        value={name}
      />
    </ContentContainer>
  );
}
