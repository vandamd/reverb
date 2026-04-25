import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import ContentContainer from "@/components/ContentContainer";
import { EmptyState } from "@/components/EmptyState";
import { StyledText } from "@/components/StyledText";
import { useLibraryTracks } from "@/contexts/LibraryContext";
import { usePlaybackTrack } from "@/contexts/PlaybackContext";
import {
  fetchPlainLyrics,
  getLyricsTrackKey,
  type LyricsTrackInfo,
} from "@/services/lyrics";
import type { LocalTrack } from "@/types/music";
import { n } from "@/utils/scaling";

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

const toLyricsTrackInfo = (track: LocalTrack): LyricsTrackInfo => ({
  albumName: track.album,
  artistName: track.artist,
  durationMs: track.durationMs,
  name: track.title,
});

export default function LyricsScreen() {
  const { trackId } = useLocalSearchParams<{ trackId?: string }>();
  const { trackById } = useLibraryTracks();
  const { currentTrack } = usePlaybackTrack();
  const routeTrack = trackId ? (trackById.get(trackId) ?? null) : null;
  const playbackTrack = currentTrack
    ? (trackById.get(currentTrack.id) ?? currentTrack)
    : null;
  const track = trackId ? routeTrack : playbackTrack;
  const lyricsTrack = useMemo(
    () => (track ? toLyricsTrackInfo(track) : null),
    [track]
  );
  const trackKey = getLyricsTrackKey(lyricsTrack);
  const [lyricsLines, setLyricsLines] = useState<string[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    if (!(lyricsTrack && trackKey)) {
      setLyricsLines(null);
      setHasError(false);
      setIsLoading(false);
      setIsResolved(false);
      return;
    }

    const controller = new AbortController();
    setLyricsLines(null);
    setHasError(false);
    setIsLoading(true);
    setIsResolved(false);

    fetchPlainLyrics(lyricsTrack, controller.signal)
      .then((nextLyricsLines) => {
        if (!controller.signal.aborted) {
          setLyricsLines(nextLyricsLines);
        }
      })
      .catch((error) => {
        if (!(controller.signal.aborted || isAbortError(error))) {
          setLyricsLines(null);
          setHasError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsResolved(true);
        }
      });

    return () => {
      controller.abort();
    };
  }, [lyricsTrack, trackKey]);

  if (!track) {
    return (
      <ContentContainer
        headerTitle=" "
        scrollable={false}
        style={styles.messageContainer}
      >
        <EmptyState title="Track not found" />
      </ContentContainer>
    );
  }

  const hasLyrics = lyricsLines && lyricsLines.length > 0;

  if (isLoading) {
    return (
      <ContentContainer
        headerTitle=" "
        scrollable={false}
        style={styles.messageContainer}
      >
        <EmptyState title="Loading..." />
      </ContentContainer>
    );
  }

  if (hasError) {
    return (
      <ContentContainer
        headerTitle=" "
        scrollable={false}
        style={styles.messageContainer}
      >
        <EmptyState title="Couldn't load lyrics" />
      </ContentContainer>
    );
  }

  if (isResolved && !hasLyrics) {
    return (
      <ContentContainer
        headerTitle=" "
        scrollable={false}
        style={styles.messageContainer}
      >
        <EmptyState title="No lyrics found" />
      </ContentContainer>
    );
  }

  return (
    <ContentContainer contentGap={14} headerTitle=" ">
      <View style={styles.lyrics}>
        {lyricsLines?.map((line, index) => (
          <StyledText
            key={`${line}-${index.toString()}`}
            selectable
            style={styles.lyricLine}
          >
            {line}
          </StyledText>
        ))}
      </View>
    </ContentContainer>
  );
}

const styles = StyleSheet.create({
  lyricLine: {
    fontSize: n(24),
    lineHeight: n(32),
  },
  lyrics: {
    gap: n(14),
  },
  messageContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
});
