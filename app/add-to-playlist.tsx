import { type Href, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { ContentList } from "@/components/ContentList";
import { EmptyState } from "@/components/EmptyState";
import { HapticPressable } from "@/components/HapticPressable";
import { MaterialIcon } from "@/components/MaterialIcon";
import { StyledText } from "@/components/StyledText";
import { TrackArtwork } from "@/components/TrackArtwork";
import { useInvertColors } from "@/contexts/InvertColorsContext";
import {
  useLibraryActions,
  useLibraryPlaylists,
} from "@/contexts/LibraryContext";
import {
  planPlaylistMembershipChanges,
  summariseTracks,
} from "@/services/librarySelectors";
import type { LocalPlaylist } from "@/types/music";
import { n } from "@/utils/scaling";

export default function AddToPlaylistScreen() {
  const { trackId } = useLocalSearchParams<{ trackId: string }>();
  const { addTrackToPlaylist, removeTrackFromPlaylist } = useLibraryActions();
  const { getPlaylistTracks, playlists } = useLibraryPlaylists();
  const { invertColors } = useInvertColors();
  const [flippedIds, setFlippedIds] = useState<ReadonlySet<string>>(new Set());

  const textColor = invertColors ? "black" : "white";
  const canApply = Boolean(trackId) && flippedIds.size > 0;

  const togglePlaylist = useCallback((playlistId: string) => {
    setFlippedIds((current) => {
      const next = new Set(current);
      if (!next.delete(playlistId)) {
        next.add(playlistId);
      }
      return next;
    });
  }, []);

  const done = async () => {
    if (!canApply) {
      return;
    }

    const { addTo, removeFrom } = planPlaylistMembershipChanges(
      playlists,
      trackId,
      flippedIds
    );
    router.back();
    const changes = [
      ...removeFrom.map(
        (playlistId) => () => removeTrackFromPlaylist(playlistId, trackId)
      ),
      ...addTo.map(
        (playlistId) => () => addTrackToPlaylist(playlistId, trackId)
      ),
    ];
    for (const change of changes) {
      await change().catch(() => {
        // One failed playlist should not stop the rest from being saved.
      });
    }
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
            <TrackArtwork fallbackIcon="add" size={50} style={styles.artwork} />
            <View style={styles.textContainer}>
              <StyledText style={styles.listName}>
                Create new playlist
              </StyledText>
            </View>
          </HapticPressable>
        );
      }

      const tracks = getPlaylistTracks(item);
      const isMember = item.trackIds.includes(trackId);
      const isSelected = isMember !== flippedIds.has(item.id);

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
          <MaterialIcon
            color={textColor}
            name={
              isSelected ? "radio-button-checked" : "radio-button-unchecked"
            }
            size={n(24)}
          />
        </HapticPressable>
      );
    },
    [flippedIds, getPlaylistTracks, textColor, togglePlaylist, trackId]
  );

  if (!trackId) {
    return (
      <ContentContainer
        headerTitle="Playlists"
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
            disabled={!canApply}
            onPress={done}
            style={[styles.doneButton, !canApply && styles.disabledButton]}
          >
            <StyledText style={styles.doneButtonText}>Done</StyledText>
          </HapticPressable>
        </View>
      }
      headerTitle="Playlists"
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
