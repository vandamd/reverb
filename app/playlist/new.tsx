import { type Href, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { StyledButton } from "@/components/StyledButton";
import { TextInput } from "@/components/TextInput";
import { useLibraryActions } from "@/contexts/LibraryContext";
import { n } from "@/utils/scaling";

export default function NewPlaylistScreen() {
  const { coverUri } = useLocalSearchParams<{ coverUri?: string }>();
  const [name, setName] = useState("");
  const { createPlaylist } = useLibraryActions();

  const save = async () => {
    if (!name.trim()) {
      return;
    }
    await createPlaylist(name, coverUri ?? null);
    router.replace("/(tabs)/playlists" as Href);
  };

  const handleChangeCover = () => {
    router.push({
      pathname: "/playlist/[id]/cover",
      params: {
        id: "draft",
        returnPath: "/playlist/new",
      },
    });
  };

  const handleRemoveCover = () => {
    router.setParams({ coverUri: undefined });
  };

  return (
    <ContentContainer
      contentGap={24}
      headerTitle="Create Playlist"
      rightAction={{
        icon: "check",
        onPress: save,
        show: name.trim().length > 0,
      }}
    >
      {coverUri ? (
        <View style={styles.coverSection}>
          <View style={styles.coverActions}>
            <StyledButton onPress={handleChangeCover} text="Change Cover" />
            <StyledButton onPress={handleRemoveCover} text="Remove Cover" />
          </View>
        </View>
      ) : null}
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

const styles = StyleSheet.create({
  coverActions: {
    alignItems: "flex-start",
    gap: n(8),
  },
  coverSection: {
    alignItems: "center",
    gap: n(16),
    width: "100%",
  },
});
