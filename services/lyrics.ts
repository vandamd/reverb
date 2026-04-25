export interface LyricsTrackInfo {
  albumName?: string;
  artistName: string;
  durationMs: number;
  name: string;
}

interface LrcLibResponse {
  instrumental: boolean;
  plainLyrics: string | null;
}

const LRC_HEADERS = {
  "User-Agent": "Reverb (https://github.com/vandamd/reverb)",
};

export const getLyricsTrackKey = (track: LyricsTrackInfo | null) => {
  if (!track) {
    return null;
  }

  return [
    track.name,
    track.artistName,
    track.albumName ?? "",
    track.durationMs.toString(),
  ].join("::");
};

const buildFetchParams = (track: LyricsTrackInfo) => {
  const params = new URLSearchParams();
  params.append("track_name", track.name);
  params.append("artist_name", track.artistName);

  if (track.albumName) {
    params.append("album_name", track.albumName);
  }

  params.append("duration", Math.round(track.durationMs / 1000).toString());

  return params;
};

const fetchLyricsResponse = async (
  track: LyricsTrackInfo,
  signal?: AbortSignal
) => {
  const params = buildFetchParams(track);
  const cachedResponse = await fetch(
    `https://lrclib.net/api/get-cached?${params.toString()}`,
    {
      headers: LRC_HEADERS,
      signal,
    }
  );

  if (cachedResponse.ok) {
    return (await cachedResponse.json()) as LrcLibResponse;
  }

  const response = await fetch(
    `https://lrclib.net/api/get?${params.toString()}`,
    {
      headers: LRC_HEADERS,
      signal,
    }
  );

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as LrcLibResponse;
};

export const fetchPlainLyrics = async (
  track: LyricsTrackInfo,
  signal?: AbortSignal
) => {
  const response = await fetchLyricsResponse(track, signal);

  if (!response || response.instrumental || !response.plainLyrics) {
    return null;
  }

  return response.plainLyrics.split("\n").filter((line) => line.trim());
};
