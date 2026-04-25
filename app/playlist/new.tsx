import { type Href, router } from "expo-router";
import { useState } from "react";
import ContentContainer from "@/components/ContentContainer";
import { TextInput } from "@/components/TextInput";
import { useLibrary } from "@/contexts/LibraryContext";

export default function NewPlaylistScreen() {
  const [name, setName] = useState("");
  const { createPlaylist } = useLibrary();

  const save = async () => {
    if (!name.trim()) {
      return;
    }
    await createPlaylist(name);
    router.replace("/(tabs)/playlists" as Href);
  };

  return (
    <ContentContainer
      headerTitle="Create Playlist"
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
