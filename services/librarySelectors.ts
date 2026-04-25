import type { LocalAlbum, LocalPlaylist, LocalTrack } from "@/types/music";

const collator = new Intl.Collator("en-GB", {
  numeric: true,
  sensitivity: "base",
});

export const sortTracks = (tracks: LocalTrack[]) =>
  [...tracks].sort((left, right) => {
    const disc = (left.discNumber ?? 0) - (right.discNumber ?? 0);
    if (disc !== 0) {
      return disc;
    }
    const track = (left.trackNumber ?? 9999) - (right.trackNumber ?? 9999);
    if (track !== 0) {
      return track;
    }
    return collator.compare(left.title, right.title);
  });

export const buildAlbums = (tracks: LocalTrack[]): LocalAlbum[] => {
  const albumsById = new Map<string, LocalTrack[]>();
  for (const track of tracks) {
    const id = getAlbumId(track.albumArtist, track.album);
    albumsById.set(id, [...(albumsById.get(id) ?? []), track]);
  }

  return [...albumsById.entries()]
    .map(([id, albumTracks]) => {
      const sortedTracks = sortTracks(albumTracks);
      const firstTrack = sortedTracks[0];
      return {
        id,
        title: firstTrack?.album ?? "Unknown Album",
        artist: firstTrack?.albumArtist ?? "Unknown Artist",
        artworkUri:
          sortedTracks.find((track) => track.artworkUri)?.artworkUri ?? null,
        durationMs: sortedTracks.reduce(
          (total, track) => total + track.durationMs,
          0
        ),
        trackCount: sortedTracks.length,
        tracks: sortedTracks,
      };
    })
    .sort((left, right) => {
      const artist = collator.compare(left.artist, right.artist);
      return artist === 0 ? collator.compare(left.title, right.title) : artist;
    });
};

export const getAlbumId = (artist: string, album: string) =>
  `${artist.trim().toLocaleLowerCase("en-GB")}::${album.trim().toLocaleLowerCase("en-GB")}`;

export const getPlaylistTracks = (
  playlist: LocalPlaylist | undefined,
  tracks: LocalTrack[],
  trackById = new Map(tracks.map((track) => [track.id, track]))
) => {
  if (!playlist) {
    return [];
  }
  return playlist.trackIds
    .map((trackId) => trackById.get(trackId))
    .filter((track): track is LocalTrack => Boolean(track));
};

export const buildTrackSearchIndex = (tracks: LocalTrack[]) =>
  tracks.map((track) => ({
    haystack: [
      track.title,
      track.artist,
      track.album,
      track.albumArtist,
      track.fileName,
    ]
      .join(" ")
      .toLocaleLowerCase("en-GB"),
    track,
  }));

export const searchTracks = (
  searchIndex: ReturnType<typeof buildTrackSearchIndex>,
  query: string
) => {
  const normalisedQuery = query.trim().toLocaleLowerCase("en-GB");
  if (!normalisedQuery) {
    return [];
  }
  return searchIndex
    .filter((entry) => entry.haystack.includes(normalisedQuery))
    .map((entry) => entry.track);
};

export const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const summariseTracks = (tracks: LocalTrack[]) => {
  const trackText = tracks.length === 1 ? "1 song" : `${tracks.length} songs`;
  const duration = formatDuration(
    tracks.reduce((total, track) => total + track.durationMs, 0)
  );
  return `${trackText} • ${duration}`;
};
