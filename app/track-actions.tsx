import { type Href, router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { StyledButton } from "@/components/StyledButton";
import { useCustomiseSettings } from "@/contexts/CustomiseSettingsContext";
import {
  useLibraryActions,
  useLibraryPlaylists,
  useLibraryTracks,
  useTrackLiked,
} from "@/contexts/LibraryContext";

export default function TrackActionsScreen() {
  const { action, confirmed, playlistId, trackId } = useLocalSearchParams<{
    action?: string;
    confirmed?: string;
    playlistId?: string;
    trackId: string;
  }>();
  const { movePlaylistTrack, removeTrackFromPlaylist, setTrackLiked } =
    useLibraryActions();
  const { hideLikedSongs, hideLyrics, hidePlaylists } = useCustomiseSettings();
  const { getPlaylistTracks, playlists } = useLibraryPlaylists();
  const { trackById } = useLibraryTracks();
  const track = trackById.get(trackId);
  const isTrackLiked = useTrackLiked(track?.id, track?.liked ?? false);
  const playlist = playlists.find((item) => item.id === playlistId);
  const playlistTracks = getPlaylistTracks(playlist);
  const playlistTrackIndex = playlistTracks.findIndex(
    (item) => item.id === trackId
  );
  const canMoveUp = playlistTrackIndex > 0;
  const canMoveDown =
    playlistTrackIndex >= 0 && playlistTrackIndex < playlistTracks.length - 1;

  useEffect(() => {
    if (
      confirmed !== "true" ||
      action !== "removeFromPlaylist" ||
      !playlist ||
      !track
    ) {
      return;
    }

    removeTrackFromPlaylist(playlist.id, track.id).then(() => {
      router.dismissTo(`/playlist/${encodeURIComponent(playlist.id)}` as Href);
    });
  }, [action, confirmed, playlist, removeTrackFromPlaylist, track]);

  if (!track) {
    return (
      <ContentContainer
        headerTitle="Track Actions"
        scrollable={false}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <EmptyState title="Track not found" />
      </ContentContainer>
    );
  }

  return (
    <ContentContainer headerTitle={track.title}>
      {hideLikedSongs ? null : (
        <StyledButton
          onPress={async () => {
            await setTrackLiked(track.id, !isTrackLiked);
          }}
          text={isTrackLiked ? "Unlike Track" : "Like Track"}
        />
      )}
      {playlist || hidePlaylists ? null : (
        <StyledButton
          onPress={() =>
            router.push({
              pathname: "/add-to-playlist",
              params: { trackId: track.id },
            })
          }
          text="Add to Playlist"
        />
      )}
      {hideLyrics ? null : (
        <StyledButton
          onPress={() =>
            router.push({
              pathname: "/lyrics",
              params: { trackId: track.id },
            })
          }
          text="Show Lyrics"
        />
      )}
      {playlist && canMoveUp && !hidePlaylists ? (
        <StyledButton
          onPress={async () => {
            await movePlaylistTrack(playlist.id, track.id, "up");
            router.back();
          }}
          text="Move Up"
        />
      ) : null}
      {playlist && canMoveDown && !hidePlaylists ? (
        <StyledButton
          onPress={async () => {
            await movePlaylistTrack(playlist.id, track.id, "down");
            router.back();
          }}
          text="Move Down"
        />
      ) : null}
      {playlist && !hidePlaylists ? (
        <StyledButton
          onPress={() => {
            router.push({
              pathname: "/confirm",
              params: {
                action: "removeFromPlaylist",
                confirmText: "DELETE",
                message: `Remove ${track.title} from ${playlist.name}?`,
                returnPath: `/track-actions?trackId=${encodeURIComponent(track.id)}&playlistId=${encodeURIComponent(playlist.id)}`,
                title: "Remove Track",
              },
            });
          }}
          text="Remove"
        />
      ) : null}
    </ContentContainer>
  );
}
