import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import TunesScanner from "@/modules/tunes-scanner/src/TunesScannerModule";
import type { LocalTrack, RepeatMode } from "@/types/music";

interface PlaybackContextValue {
  currentTrack: LocalTrack | null;
  durationMs: number;
  error: string | null;
  index: number;
  isPlaying: boolean;
  playQueue: (tracks: LocalTrack[], index?: number) => Promise<void>;
  progressMs: number;
  queue: LocalTrack[];
  repeatMode: RepeatMode;
  seekToPosition: (progressMs: number) => Promise<void>;
  setRepeatMode: (repeatMode: RepeatMode) => void;
  setShuffle: (shuffle: boolean) => void;
  shuffle: boolean;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
}

const PlaybackContext = createContext<PlaybackContextValue | undefined>(
  undefined
);
const PlaybackTrackContext = createContext<
  | Pick<
      PlaybackContextValue,
      "currentTrack" | "durationMs" | "error" | "index" | "queue"
    >
  | undefined
>(undefined);
const PlaybackProgressContext = createContext<
  | Pick<PlaybackContextValue, "durationMs" | "isPlaying" | "progressMs">
  | undefined
>(undefined);
const PlaybackStatusContext = createContext<
  Pick<PlaybackContextValue, "isPlaying"> | undefined
>(undefined);
const PlaybackControlsContext = createContext<
  | Pick<
      PlaybackContextValue,
      | "playQueue"
      | "repeatMode"
      | "seekToPosition"
      | "setRepeatMode"
      | "setShuffle"
      | "shuffle"
      | "skipNext"
      | "skipPrevious"
      | "togglePlayPause"
    >
  | undefined
>(undefined);

const initialStatus = {
  didJustFinish: false,
  durationMs: 0,
  isLoaded: false,
  isPlaying: false,
  playbackState: "idle",
  progressMs: 0,
};
const playbackStatusUpdateIntervalMs = 5000;

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [queue, setQueue] = useState<LocalTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const currentTrack = index >= 0 ? (queue[index] ?? null) : null;

  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: "doNotMix",
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    }).catch((audioModeError) => {
      setError(
        audioModeError instanceof Error
          ? audioModeError.message
          : String(audioModeError)
      );
    });
    TunesScanner.clearPlaybackCache(null).catch((cacheError) => {
      setError(
        cacheError instanceof Error ? cacheError.message : String(cacheError)
      );
    });

    const player = createAudioPlayer(null, {
      updateInterval: playbackStatusUpdateIntervalMs,
    });
    playerRef.current = player;
    player.setActiveForLockScreen(true);
    const subscription = player.addListener(
      "playbackStatusUpdate",
      (nextStatus: AudioStatus) => {
        setStatus((previousStatus) => {
          const stoppedExternally =
            nextStatus.playbackState === "idle" &&
            !nextStatus.isLoaded &&
            !nextStatus.didJustFinish;

          return {
            didJustFinish: nextStatus.didJustFinish,
            durationMs: stoppedExternally
              ? previousStatus.durationMs
              : Math.round(nextStatus.duration * 1000),
            isLoaded: nextStatus.isLoaded,
            isPlaying: nextStatus.playing,
            playbackState: nextStatus.playbackState,
            progressMs: stoppedExternally
              ? previousStatus.progressMs
              : Math.round(nextStatus.currentTime * 1000),
          };
        });
      }
    );

    return () => {
      subscription.remove();
      player.clearLockScreenControls();
      player.remove();
      playerRef.current = null;
    };
  }, []);

  const updateLockScreen = useCallback((track: LocalTrack) => {
    playerRef.current?.updateLockScreenMetadata({
      albumTitle: track.album,
      artist: track.artist,
      artworkUrl: track.artworkUri ?? undefined,
      title: track.title,
    });
  }, []);

  const loadTrack = useCallback(
    async (track: LocalTrack, shouldPlay: boolean, startPositionMs = 0) => {
      const player = playerRef.current;
      if (!player) {
        return;
      }
      setError(null);
      const initialProgressMs = Math.max(0, startPositionMs);
      setStatus({
        ...initialStatus,
        durationMs: track.durationMs,
        playbackState: "buffering",
        progressMs: initialProgressMs,
      });
      updateLockScreen(track);
      try {
        player.replace({ name: track.title, uri: track.uri });
      } catch {
        const cachedTrack = await TunesScanner.copyTrackToCache(
          track.uri,
          track.fileName
        );
        player.replace({ name: track.title, uri: cachedTrack.uri });
      }
      if (initialProgressMs > 0) {
        await player.seekTo(initialProgressMs / 1000);
      }
      if (shouldPlay) {
        player.play();
      }
    },
    [updateLockScreen]
  );

  const playQueue = useCallback(
    async (tracks: LocalTrack[], nextIndex = 0) => {
      if (tracks.length === 0) {
        return;
      }
      const clampedIndex = Math.min(Math.max(nextIndex, 0), tracks.length - 1);
      setQueue(tracks);
      setIndex(clampedIndex);
      await loadTrack(tracks[clampedIndex], true);
    },
    [loadTrack]
  );

  const resolveNextIndex = useCallback(() => {
    if (queue.length === 0) {
      return -1;
    }
    if (shuffle && queue.length > 1) {
      let randomIndex = index;
      while (randomIndex === index) {
        randomIndex = Math.floor(Math.random() * queue.length);
      }
      return randomIndex;
    }
    if (index + 1 < queue.length) {
      return index + 1;
    }
    return repeatMode === "queue" ? 0 : -1;
  }, [index, queue.length, repeatMode, shuffle]);

  const skipNext = useCallback(async () => {
    if (repeatMode === "track" && currentTrack) {
      await loadTrack(currentTrack, true);
      return;
    }
    const nextIndex = resolveNextIndex();
    if (nextIndex < 0) {
      playerRef.current?.pause();
      return;
    }
    setIndex(nextIndex);
    await loadTrack(queue[nextIndex], true);
  }, [currentTrack, loadTrack, queue, repeatMode, resolveNextIndex]);

  const skipPrevious = useCallback(async () => {
    if (queue.length === 0) {
      return;
    }
    const previousIndex = index > 0 ? index - 1 : 0;
    setIndex(previousIndex);
    await loadTrack(queue[previousIndex], true);
  }, [index, loadTrack, queue]);

  useEffect(() => {
    if (currentTrack && status.didJustFinish) {
      skipNext().catch((skipError) => {
        setError(
          skipError instanceof Error ? skipError.message : String(skipError)
        );
      });
    }
  }, [currentTrack, skipNext, status.didJustFinish]);

  const togglePlayPause = useCallback(async () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    if (status.isPlaying) {
      player.pause();
      return;
    }

    if (currentTrack && status.playbackState === "idle") {
      await loadTrack(currentTrack, true, status.progressMs);
      return;
    }

    player.play();
  }, [
    currentTrack,
    loadTrack,
    status.isPlaying,
    status.playbackState,
    status.progressMs,
  ]);

  const seekToPosition = useCallback(async (progressMs: number) => {
    await playerRef.current?.seekTo(Math.max(0, progressMs) / 1000);
  }, []);

  const durationMs = status.durationMs || currentTrack?.durationMs || 0;
  const trackValue = useMemo(
    () => ({
      currentTrack,
      durationMs,
      error,
      index,
      queue,
    }),
    [currentTrack, durationMs, error, index, queue]
  );
  const progressValue = useMemo(
    () => ({
      durationMs,
      isPlaying: status.isPlaying,
      progressMs: status.progressMs,
    }),
    [durationMs, status.isPlaying, status.progressMs]
  );
  const statusValue = useMemo(
    () => ({
      isPlaying: status.isPlaying,
    }),
    [status.isPlaying]
  );
  const controlsValue = useMemo(
    () => ({
      playQueue,
      repeatMode,
      seekToPosition,
      setRepeatMode,
      setShuffle,
      shuffle,
      skipNext,
      skipPrevious,
      togglePlayPause,
    }),
    [
      playQueue,
      repeatMode,
      seekToPosition,
      shuffle,
      skipNext,
      skipPrevious,
      togglePlayPause,
    ]
  );

  const value = useMemo(
    () => ({
      currentTrack,
      durationMs,
      error,
      index,
      isPlaying: status.isPlaying,
      playQueue,
      progressMs: status.progressMs,
      queue,
      repeatMode,
      seekToPosition,
      setRepeatMode,
      setShuffle,
      shuffle,
      skipNext,
      skipPrevious,
      togglePlayPause,
    }),
    [
      currentTrack,
      durationMs,
      error,
      index,
      playQueue,
      queue,
      repeatMode,
      seekToPosition,
      shuffle,
      skipNext,
      skipPrevious,
      status.isPlaying,
      status.progressMs,
      togglePlayPause,
    ]
  );

  return (
    <PlaybackControlsContext.Provider value={controlsValue}>
      <PlaybackTrackContext.Provider value={trackValue}>
        <PlaybackStatusContext.Provider value={statusValue}>
          <PlaybackProgressContext.Provider value={progressValue}>
            <PlaybackContext.Provider value={value}>
              {children}
            </PlaybackContext.Provider>
          </PlaybackProgressContext.Provider>
        </PlaybackStatusContext.Provider>
      </PlaybackTrackContext.Provider>
    </PlaybackControlsContext.Provider>
  );
}

export const usePlayback = () => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error("usePlayback must be used within PlaybackProvider");
  }
  return context;
};

export const usePlaybackTrack = () => {
  const context = useContext(PlaybackTrackContext);
  if (!context) {
    throw new Error("usePlaybackTrack must be used within PlaybackProvider");
  }
  return context;
};

export const usePlaybackProgress = () => {
  const context = useContext(PlaybackProgressContext);
  if (!context) {
    throw new Error("usePlaybackProgress must be used within PlaybackProvider");
  }
  return context;
};

export const usePlaybackStatus = () => {
  const context = useContext(PlaybackStatusContext);
  if (!context) {
    throw new Error("usePlaybackStatus must be used within PlaybackProvider");
  }
  return context;
};

export const usePlaybackControls = () => {
  const context = useContext(PlaybackControlsContext);
  if (!context) {
    throw new Error("usePlaybackControls must be used within PlaybackProvider");
  }
  return context;
};
