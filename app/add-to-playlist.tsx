import { MaterialIcons } from "@expo/vector-icons";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { ContentList } from "@/components/ContentList";
import { EmptyState } from "@/components/EmptyState";
import { HapticPressable } from "@/components/HapticPressable";
import { StyledText } from "@/components/StyledText";
import { TrackArtwork } from "@/components/TrackArtwork";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import { useLibraryActions, useLibraryState } from "@/contexts/LibraryContext";
import { summariseTracks } from "@/services/librarySelectors";
import type { LocalPlaylist } from "@/types/music";
import { n } from "@/utils/scaling";

export default function AddToPlaylistScreen() {
  const { trackId } = useLocalSearchParams<{ trackId: string }>();
  const { addTrackToPlaylist } = useLibraryActions();
  const { getPlaylistTracks, playlists } = useLibraryState();
  const { invertColors } = useInvertColors();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const textColor = invertColors ? "black" : "white";
  const canAdd = Boolean(trackId) && selectedIds.length > 0;

  const togglePlaylist = useCallback((playlistId: string) => {
    setSelectedIds((current) =>
      current.includes(playlistId)
        ? current.filter((id) => id !== playlistId)
        : [...current, playlistId]
    );
  }, []);

  const done = () => {
    if (!canAdd) {
      return;
    }

    router.back();
    setTimeout(() => {
      for (const playlistId of selectedIds) {
        addTrackToPlaylist(playlistId, trackId);
      }
    }, 0);
  };

  const data = useMemo(
    () => [{ id: "create", kind: "create" as const }, ...playlists],
    [playlists]
  );
  const renderPlaylist = useCallback(
    ({ item }: { item: LocalPlaylist | { id: string; kind: "create" } }) => {
      if ("kind" in item) {
        return (
          <HapticPressable
            onPress={() => router.push("/playlist/new" as Href)}
            style={styles.listItem}
          >
            <View
              style={[
                styles.iconBox,
                { backgroundColor: invertColors ? "black" : "#282828" },
              ]}
            >
              <MaterialIcons color="white" name="add" size={n(24)} />
            </View>
            <View style={styles.textContainer}>
              <StyledText style={styles.listName}>
                Create new playlist
              </StyledText>
            </View>
          </HapticPressable>
        );
      }

      const tracks = getPlaylistTracks(item);
      const isSelected = selectedIds.includes(item.id);

      return (
        <HapticPressable
          onPress={() => togglePlaylist(item.id)}
          style={styles.listItem}
        >
          <TrackArtwork
            fallbackIcon="queue-music"
            size={50}
            style={styles.artwork}
            uri={item.coverUri}
          />
          <View style={styles.textContainer}>
            <StyledText numberOfLines={1} style={styles.listName}>
              {item.name}
            </StyledText>
            <StyledText numberOfLines={1} style={styles.subtitle}>
              {summariseTracks(tracks)}
            </StyledText>
          </View>
          <MaterialIcons
            color={textColor}
            name={
              isSelected ? "radio-button-checked" : "radio-button-unchecked"
            }
            size={n(24)}
          />
        </HapticPressable>
      );
    },
    [getPlaylistTracks, invertColors, selectedIds, textColor, togglePlaylist]
  );

  if (!trackId) {
    return (
      <ContentContainer
        headerTitle="Add to Playlist"
        scrollable={false}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState title="No track to add" />
      </ContentContainer>
    );
  }

  return (
    <ContentList
      bottomPadding={0}
      contentGap={8}
      contentWidth="wide"
      data={data}
      footer={
        <View style={styles.doneContainer}>
          <HapticPressable
            disabled={!canAdd}
            onPress={done}
            style={[styles.doneButton, !canAdd && styles.disabledButton]}
          >
            <StyledText style={styles.doneButtonText}>Done</StyledText>
          </HapticPressable>
        </View>
      }
      headerTitle="Add to Playlist"
      keyExtractor={(item) => item.id}
      renderItem={renderPlaylist}
    />
  );
}

const styles = StyleSheet.create({
  artwork: {
    marginRight: n(15),
  },
  disabledButton: {
    opacity: 0.35,
  },
  doneButton: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: n(200),
    paddingVertical: n(15),
  },
  doneButtonText: {
    fontSize: n(40),
    textTransform: "uppercase",
  },
  doneContainer: {
    alignItems: "center",
    justifyContent: "flex-end",
    width: "100%",
  },
  iconBox: {
    alignItems: "center",
    height: n(50),
    justifyContent: "center",
    marginRight: n(15),
    width: n(50),
  },
  listItem: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: n(50),
    width: "100%",
  },
  listName: {
    fontSize: n(22),
    lineHeight: n(24),
  },
  subtitle: {
    fontSize: n(16),
    lineHeight: n(18),
  },
  textContainer: {
    flex: 1,
    marginRight: n(15),
    minWidth: n(0),
  },
});
