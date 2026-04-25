import { Image } from "expo-image";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
  type Track,
  RepeatMode as TrackPlayerRepeatMode,
  usePlaybackState,
  usePlayWhenReady,
  useProgress,
  useTrackPlayerEvents,
} from "react-native-track-player";
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

const playbackProgressUpdateIntervalMs = 1000;
let playerSetupPromise: Promise<void> | null = null;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return String(error);
};

const isPlayerAlreadySetupError = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  const message = getErrorMessage(error).toLowerCase();
  return (
    code === "player_already_initialized" ||
    (message.includes("already") && message.includes("setupplayer"))
  );
};

const ensureTrackPlayerReady = () => {
  playerSetupPromise ??= (async () => {
    try {
      await TrackPlayer.setupPlayer({
        autoHandleInterruptions: true,
      });
    } catch (setupError) {
      if (!isPlayerAlreadySetupError(setupError)) {
        throw setupError;
      }
    }

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      progressUpdateEventInterval: 1,
    });
  })().catch((error) => {
    playerSetupPromise = null;
    throw error;
  });

  return playerSetupPromise;
};

const toTrackPlayerRepeatMode = (repeatMode: RepeatMode) => {
  if (repeatMode === "track") {
    return TrackPlayerRepeatMode.Track;
  }
  if (repeatMode === "queue") {
    return TrackPlayerRepeatMode.Queue;
  }
  return TrackPlayerRepeatMode.Off;
};

const toTrackPlayerTrack = (track: LocalTrack): Track => ({
  album: track.album,
  artist: track.artist,
  artwork: track.artworkUri ?? undefined,
  contentType: track.mimeType ?? undefined,
  duration: track.durationMs / 1000,
  id: track.id,
  title: track.title,
  url: track.uri,
});

const shuffledTracksAfterCurrent = (
  tracks: LocalTrack[],
  currentTrackId: string
) => {
  const currentTrack = tracks.find((track) => track.id === currentTrackId);
  if (!currentTrack) {
    return tracks;
  }

  const upcomingTracks = tracks.filter((track) => track.id !== currentTrackId);
  for (let index = upcomingTracks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [upcomingTracks[index], upcomingTracks[swapIndex]] = [
      upcomingTracks[swapIndex],
      upcomingTracks[index],
    ];
  }

  return [currentTrack, ...upcomingTracks];
};

const playbackIntentStates = new Set<State>([
  State.Buffering,
  State.Loading,
  State.Paused,
  State.Playing,
  State.Ready,
]);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const playbackState = usePlaybackState();
  const playWhenReady = usePlayWhenReady();
  const progress = useProgress(playbackProgressUpdateIntervalMs);
  const [sourceQueue, setSourceQueue] = useState<LocalTrack[]>([]);
  const [queue, setQueue] = useState<LocalTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [shuffle, setShuffleState] = useState(false);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>("off");
  const [error, setError] = useState<string | null>(null);
  const currentTrack = index >= 0 ? (queue[index] ?? null) : null;
  const isPlaying =
    playbackState.state === State.Playing ||
    (playWhenReady === true &&
      playbackState.state !== undefined &&
      playbackIntentStates.has(playbackState.state) &&
      currentTrack !== null);
  const durationMs =
    Math.round(progress.duration * 1000) || currentTrack?.durationMs || 0;
  const progressMs = Math.round(progress.position * 1000);

  const replaceTrackPlayerQueue = useCallback(
    async (
      tracks: LocalTrack[],
      nextIndex: number,
      shouldPlay: boolean,
      nextRepeatMode = repeatMode,
      startPositionMs = 0
    ) => {
      await ensureTrackPlayerReady();
      await TrackPlayer.reset();
      if (tracks.length === 0) {
        setQueue([]);
        setIndex(-1);
        return;
      }

      const safeIndex = Math.min(Math.max(nextIndex, 0), tracks.length - 1);
      await TrackPlayer.add(tracks.map(toTrackPlayerTrack));
      await TrackPlayer.setRepeatMode(toTrackPlayerRepeatMode(nextRepeatMode));
      if (safeIndex > 0) {
        await TrackPlayer.skip(safeIndex);
      }
      if (startPositionMs > 0) {
        await TrackPlayer.seekTo(startPositionMs / 1000);
      }
      if (shouldPlay) {
        await TrackPlayer.play();
      }

      setQueue(tracks);
      setIndex(safeIndex);
    },
    [repeatMode]
  );

  const rebuildQueueForShuffle = useCallback(
    async (nextShuffle: boolean) => {
      if (!currentTrack || index < 0 || sourceQueue.length === 0) {
        return;
      }

      const sourceIndex = sourceQueue.findIndex(
        (track) => track.id === currentTrack.id
      );
      if (sourceIndex < 0) {
        return;
      }

      const upcomingTracks = nextShuffle
        ? shuffledTracksAfterCurrent(sourceQueue, currentTrack.id).slice(1)
        : sourceQueue.slice(sourceIndex + 1);
      const currentAndPreviousTracks = queue.slice(0, index + 1);

      await ensureTrackPlayerReady();
      await TrackPlayer.removeUpcomingTracks();
      if (upcomingTracks.length > 0) {
        await TrackPlayer.add(upcomingTracks.map(toTrackPlayerTrack));
      }

      setQueue([...currentAndPreviousTracks, ...upcomingTracks]);
      setIndex(currentAndPreviousTracks.length - 1);
    },
    [currentTrack, index, queue, sourceQueue]
  );

  useEffect(() => {
    ensureTrackPlayerReady()
      .then(() =>
        TrackPlayer.setRepeatMode(toTrackPlayerRepeatMode(repeatMode))
      )
      .catch((setupError) => {
        setError(getErrorMessage(setupError));
      });
  }, [repeatMode]);

  useEffect(() => {
    const artworkUris = [queue[index - 1], queue[index], queue[index + 1]]
      .map((track) => track?.artworkUri)
      .filter((uri): uri is string => Boolean(uri));

    if (artworkUris.length === 0) {
      return;
    }

    Image.prefetch([...new Set(artworkUris)], {
      cachePolicy: "memory-disk",
    }).catch(() => {
      // Prefetching is only a visual warm-up; playback should never care.
    });
  }, [index, queue]);

  useTrackPlayerEvents(
    [
      Event.PlaybackActiveTrackChanged,
      Event.PlaybackError,
      Event.PlaybackQueueEnded,
    ],
    (event) => {
      if (event.type === Event.PlaybackActiveTrackChanged) {
        setIndex(typeof event.index === "number" ? event.index : -1);
        setError(null);
        return;
      }

      if (event.type === Event.PlaybackError) {
        setError(event.message);
        return;
      }

      if (event.type === Event.PlaybackQueueEnded) {
        setIndex(typeof event.track === "number" ? event.track : -1);
      }
    }
  );

  const playQueue = useCallback(
    async (tracks: LocalTrack[], nextIndex = 0) => {
      if (tracks.length === 0) {
        return;
      }

      const clampedIndex = Math.min(Math.max(nextIndex, 0), tracks.length - 1);
      const nextQueue = shuffle
        ? shuffledTracksAfterCurrent(tracks, tracks[clampedIndex].id)
        : tracks;
      const queueIndex = shuffle ? 0 : clampedIndex;

      try {
        setError(null);
        setSourceQueue(tracks);
        await replaceTrackPlayerQueue(nextQueue, queueIndex, true);
      } catch (playbackError) {
        setError(getErrorMessage(playbackError));
      }
    },
    [replaceTrackPlayerQueue, shuffle]
  );

  const skipNext = useCallback(async () => {
    if (queue.length === 0 || index < 0) {
      return;
    }

    try {
      setError(null);
      await ensureTrackPlayerReady();
      if (repeatMode === "track") {
        await TrackPlayer.skip(index, 0);
        await TrackPlayer.play();
        return;
      }

      if (index + 1 >= queue.length) {
        if (repeatMode === "queue") {
          await TrackPlayer.skip(0, 0);
          await TrackPlayer.play();
          setIndex(0);
          return;
        }
        await TrackPlayer.pause();
        return;
      }

      await TrackPlayer.skipToNext();
      await TrackPlayer.play();
    } catch (skipError) {
      setError(getErrorMessage(skipError));
    }
  }, [index, queue.length, repeatMode]);

  const skipPrevious = useCallback(async () => {
    if (queue.length === 0 || index < 0) {
      return;
    }

    try {
      setError(null);
      await ensureTrackPlayerReady();
      const previousIndex = index > 0 ? index - 1 : 0;
      await TrackPlayer.skip(previousIndex, 0);
      await TrackPlayer.play();
      setIndex(previousIndex);
    } catch (skipError) {
      setError(getErrorMessage(skipError));
    }
  }, [index, queue.length]);

  const togglePlayPause = useCallback(async () => {
    try {
      setError(null);
      await ensureTrackPlayerReady();
      if (isPlaying) {
        await TrackPlayer.pause();
        return;
      }
      await TrackPlayer.play();
    } catch (playbackError) {
      setError(getErrorMessage(playbackError));
    }
  }, [isPlaying]);

  const seekToPosition = useCallback(async (progressMs: number) => {
    try {
      setError(null);
      await ensureTrackPlayerReady();
      await TrackPlayer.seekTo(Math.max(0, progressMs) / 1000);
    } catch (seekError) {
      setError(getErrorMessage(seekError));
    }
  }, []);

  const setRepeatMode = useCallback((nextRepeatMode: RepeatMode) => {
    setRepeatModeState(nextRepeatMode);
    ensureTrackPlayerReady()
      .then(() =>
        TrackPlayer.setRepeatMode(toTrackPlayerRepeatMode(nextRepeatMode))
      )
      .catch((repeatError) => {
        setError(getErrorMessage(repeatError));
      });
  }, []);

  const setShuffle = useCallback(
    (nextShuffle: boolean) => {
      setShuffleState(nextShuffle);
      rebuildQueueForShuffle(nextShuffle).catch((shuffleError) => {
        setError(getErrorMessage(shuffleError));
      });
    },
    [rebuildQueueForShuffle]
  );

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
      isPlaying,
      progressMs,
    }),
    [durationMs, isPlaying, progressMs]
  );
  const statusValue = useMemo(
    () => ({
      isPlaying,
    }),
    [isPlaying]
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
      setRepeatMode,
      setShuffle,
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
      isPlaying,
      playQueue,
      progressMs,
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
      isPlaying,
      playQueue,
      progressMs,
      queue,
      repeatMode,
      seekToPosition,
      setRepeatMode,
      setShuffle,
      shuffle,
      skipNext,
      skipPrevious,
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
