import { type Href, router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { StyledButton } from "@/components/StyledButton";
import { useLibrary } from "@/contexts/LibraryContext";

export default function TrackActionsScreen() {
  const { action, confirmed, playlistId, trackId } = useLocalSearchParams<{
    action?: string;
    confirmed?: string;
    playlistId?: string;
    trackId: string;
  }>();
  const {
    getPlaylistTracks,
    movePlaylistTrack,
    playlists,
    removeTrackFromPlaylist,
    setTrackLiked,
    tracks,
  } = useLibrary();
  const track = tracks.find((item) => item.id === trackId);
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
      router.replace(`/playlist/${encodeURIComponent(playlist.id)}` as Href);
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
      <StyledButton
        onPress={async () => {
          await setTrackLiked(track.id, !track.liked);
        }}
        text={track.liked ? "Unlike Track" : "Like Track"}
      />
      {!playlist ? (
        <StyledButton
          onPress={() =>
            router.push({
              pathname: "/add-to-playlist",
              params: { trackId: track.id },
            })
          }
          text="Add to Playlist"
        />
      ) : null}
      {playlist && canMoveUp ? (
        <StyledButton
          onPress={async () => {
            await movePlaylistTrack(playlist.id, track.id, "up");
            router.back();
          }}
          text="Move Up"
        />
      ) : null}
      {playlist && canMoveDown ? (
        <StyledButton
          onPress={async () => {
            await movePlaylistTrack(playlist.id, track.id, "down");
            router.back();
          }}
          text="Move Down"
        />
      ) : null}
      {playlist ? (
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
