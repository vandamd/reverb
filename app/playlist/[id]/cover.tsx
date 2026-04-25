import {
  copyAsync,
  documentDirectory,
  makeDirectoryAsync,
} from "expo-file-system/legacy";
import {
  type ImagePickerAsset,
  launchImageLibraryAsync,
} from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { StyledButton } from "@/components/StyledButton";
import { TrackArtwork } from "@/components/TrackArtwork";
import { useLibrary } from "@/contexts/LibraryContext";

const getCoverExtension = (asset: ImagePickerAsset) => {
  if (asset.fileName?.includes(".")) {
    return asset.fileName.split(".").pop() ?? "jpg";
  }
  if (asset.mimeType === "image/png") {
    return "png";
  }
  return "jpg";
};

const saveCoverImage = async (playlistId: string, asset: ImagePickerAsset) => {
  if (!documentDirectory) {
    return asset.uri;
  }

  const directory = `${documentDirectory}playlist-covers/`;
  await makeDirectoryAsync(directory, { intermediates: true });
  const extension = getCoverExtension(asset);
  const destination = `${directory}${playlistId}-${Date.now()}.${extension}`;
  await copyAsync({ from: asset.uri, to: destination });
  return destination;
};

export default function PlaylistCoverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playlists, setPlaylistCover } = useLibrary();
  const playlist = playlists.find((item) => item.id === id);

  if (!playlist) {
    return (
      <ContentContainer
        headerTitle="Change Cover"
        scrollable={false}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState title="Playlist not found" />
      </ContentContainer>
    );
  }

  const chooseCover = async () => {
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
  };

  return (
    <ContentContainer contentGap={28} headerTitle="Change Cover">
      <View style={styles.preview}>
        <TrackArtwork
          fallbackIcon="queue-music"
          size={160}
          uri={playlist.coverUri}
        />
      </View>
      <StyledButton onPress={chooseCover} text="Choose Photo" />
      {playlist.coverUri ? (
        <StyledButton
          onPress={async () => {
            await setPlaylistCover(playlist.id, null);
            router.back();
          }}
          text="Remove Cover"
        />
      ) : null}
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignItems: "center",
    width: "100%",
  },
});
