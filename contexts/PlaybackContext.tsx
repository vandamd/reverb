import { Image } from "expo-image";
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
import { AppState } from "react-native";
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

const getErrorCode = (error: unknown) => {
  if (typeof error === "object" && error && "code" in error) {
    return String(error.code);
  }
  return "";
};

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
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  return (
    code === "player_already_initialized" ||
    (message.includes("already") && message.includes("setupplayer"))
  );
};

const isPlayerNotReadyError = (error: unknown) => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error).toLowerCase();
  return (
    code === "player_not_initialized" ||
    code === "android_cannot_setup_player_in_background" ||
    message.includes("not initialized") ||
    message.includes("setupplayer first") ||
    message.includes("must be in the foreground")
  );
};

const createBackgroundSetupError = () =>
  new Error("TrackPlayer setup is only available while the app is active.");

const setupTrackPlayer = () =>
  (async () => {
    if (AppState.currentState !== "active") {
      throw createBackgroundSetupError();
    }

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
        Capability.Stop,
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
        Capability.Stop,
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

const ensureTrackPlayerReady = async (hasRetried = false): Promise<void> => {
  if (playerSetupPromise) {
    try {
      await playerSetupPromise;
      await TrackPlayer.getPlaybackState();
      return;
    } catch (error) {
      if (!(isPlayerNotReadyError(error) && !hasRetried)) {
        throw error;
      }
      playerSetupPromise = null;
    }
  }

  playerSetupPromise = setupTrackPlayer();
  await playerSetupPromise;
  if (!hasRetried) {
    await ensureTrackPlayerReady(true);
  }
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

const trackPlayerPlayingStates = new Set<State>([
  State.Buffering,
  State.Loading,
  State.Playing,
  State.Ready,
]);
const playbackEvents = [
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackError,
  Event.PlaybackPlayWhenReadyChanged,
  Event.PlaybackQueueEnded,
  Event.PlaybackState,
];

const getTrackId = (track: Track) => {
  if (typeof track.id === "string") {
    return track.id;
  }
  return null;
};

const getTrackMap = (trackGroups: LocalTrack[][]) =>
  new Map(
    trackGroups.flatMap((tracks) => tracks.map((track) => [track.id, track]))
  );

const resolveNativeQueue = (
  nativeQueue: Track[],
  tracksById: Map<string, LocalTrack>
) =>
  nativeQueue
    .map((track) => {
      const trackId = getTrackId(track);
      return trackId ? tracksById.get(trackId) : undefined;
    })
    .filter((track): track is LocalTrack => Boolean(track));

const getExistingQueueIndex = (
  nativeQueue: Track[],
  nativeActiveIndex: number | undefined,
  queue: LocalTrack[]
) => {
  if (typeof nativeActiveIndex !== "number" || nativeActiveIndex < 0) {
    return -1;
  }

  const nativeTrack = nativeQueue[nativeActiveIndex];
  const nativeTrackId = nativeTrack ? getTrackId(nativeTrack) : null;
  return nativeTrackId
    ? queue.findIndex((track) => track.id === nativeTrackId)
    : -1;
};

const looksLikeStopReset = (
  candidateIndex: number,
  trustedIndex: number,
  playbackState?: State
) =>
  candidateIndex === 0 &&
  trustedIndex > 0 &&
  (playbackState === undefined || !trackPlayerPlayingStates.has(playbackState));

const looksLikeQueueWrapToStart = (snapshot: {
  candidateIndex: number;
  candidateTrack?: Track;
  lastIndex?: number;
  lastPosition?: number;
  queue: LocalTrack[];
  repeatMode: RepeatMode;
  trustedIndex: number;
}) => {
  if (
    snapshot.repeatMode !== "queue" ||
    snapshot.candidateIndex !== 0 ||
    snapshot.trustedIndex !== snapshot.queue.length - 1 ||
    snapshot.queue.length < 2
  ) {
    return false;
  }

  const candidateTrackId = snapshot.candidateTrack
    ? getTrackId(snapshot.candidateTrack)
    : null;
  if (candidateTrackId && candidateTrackId !== snapshot.queue[0].id) {
    return false;
  }

  if (
    typeof snapshot.lastIndex === "number" &&
    snapshot.lastIndex !== snapshot.trustedIndex
  ) {
    return false;
  }

  const previousTrackDuration =
    snapshot.queue[snapshot.trustedIndex].durationMs;
  return (
    typeof snapshot.lastPosition !== "number" ||
    snapshot.lastPosition * 1000 >= previousTrackDuration - 2000
  );
};

const getStartPositionMs = (snapshot: {
  durationMs: number;
  progressMs: number;
}) => Math.min(snapshot.progressMs, snapshot.durationMs);

const getSyncIndex = (
  nativeQueue: Track[],
  resolvedQueue: LocalTrack[],
  nativeActiveIndex: number | undefined,
  existingQueueIndex: number,
  targetIndex: number,
  playbackState?: State
): number | null => {
  if (nativeQueue.length > 0 && resolvedQueue.length === nativeQueue.length) {
    const nativeIndexValid =
      typeof nativeActiveIndex === "number" &&
      nativeActiveIndex >= 0 &&
      nativeActiveIndex < resolvedQueue.length;
    if (!nativeIndexValid) {
      return null;
    }
    return looksLikeStopReset(nativeActiveIndex, targetIndex, playbackState)
      ? targetIndex
      : nativeActiveIndex;
  }

  if (existingQueueIndex >= 0) {
    return looksLikeStopReset(existingQueueIndex, targetIndex, playbackState)
      ? null
      : existingQueueIndex;
  }

  return null;
};

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const playbackState = usePlaybackState();
  const playWhenReady = usePlayWhenReady();
  const progress = useProgress(playbackProgressUpdateIntervalMs);
  const [syncedPlaybackState, setSyncedPlaybackState] = useState<
    State | undefined
  >(undefined);
  const [syncedPlayWhenReady, setSyncedPlayWhenReady] = useState<
    boolean | undefined
  >(undefined);
  const [syncedProgress, setSyncedProgress] = useState<{
    duration: number;
    position: number;
  } | null>(null);
  const [sourceQueue, setSourceQueue] = useState<LocalTrack[]>([]);
  const [queue, setQueue] = useState<LocalTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [shuffle, setShuffleState] = useState(false);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>("off");
  const [error, setError] = useState<string | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playWhenReadyOverride, setPlayWhenReadyOverride] = useState<
    boolean | undefined
  >(undefined);
  const playWhenReadyIntentRef = useRef<{
    pending: boolean;
    value: boolean;
  } | null>(null);
  const playbackSnapshotRef = useRef({ durationMs: 0, progressMs: 0 });
  const playbackTargetRef = useRef<{
    index: number;
    queue: LocalTrack[];
    repeatMode: RepeatMode;
  }>({ index: -1, queue: [], repeatMode: "off" });
  const currentTrack = index >= 0 ? (queue[index] ?? null) : null;
  const effectivePlaybackState = syncedPlaybackState ?? playbackState.state;
  const effectivePlayWhenReady =
    playWhenReadyOverride ?? syncedPlayWhenReady ?? playWhenReady;
  const isPlaying =
    currentTrack !== null &&
    ((isSeeking && effectivePlayWhenReady === true) ||
      (effectivePlayWhenReady === true &&
        effectivePlaybackState !== undefined &&
        trackPlayerPlayingStates.has(effectivePlaybackState)));
  const durationMs =
    Math.round((syncedProgress?.duration ?? progress.duration) * 1000) ||
    currentTrack?.durationMs ||
    0;
  const isEffectivelyStopped =
    effectivePlaybackState === State.Stopped ||
    effectivePlaybackState === State.None;
  const progressMs = isEffectivelyStopped
    ? 0
    : Math.round((syncedProgress?.position ?? progress.position) * 1000);

  useEffect(() => {
    playbackSnapshotRef.current = { durationMs, progressMs };
  }, [durationMs, progressMs]);

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

      playbackTargetRef.current = {
        index: safeIndex,
        queue: tracks,
        repeatMode: nextRepeatMode,
      };
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
      playbackTargetRef.current = {
        index: currentAndPreviousTracks.length - 1,
        queue: [...currentAndPreviousTracks, ...upcomingTracks],
        repeatMode,
      };
    },
    [currentTrack, index, queue, repeatMode, sourceQueue]
  );

  const syncPlaybackFromNative = useCallback(async () => {
    try {
      await ensureTrackPlayerReady();

      const [
        nativeQueue,
        nativeActiveIndex,
        nativeProgress,
        nativePlaybackState,
        nativePlayWhenReady,
      ] = await Promise.all([
        TrackPlayer.getQueue(),
        TrackPlayer.getActiveTrackIndex(),
        TrackPlayer.getProgress(),
        TrackPlayer.getPlaybackState(),
        TrackPlayer.getPlayWhenReady(),
      ]);

      const tracksById = getTrackMap([sourceQueue, queue]);
      const resolvedQueue = resolveNativeQueue(nativeQueue, tracksById);
      const existingQueueIndex = getExistingQueueIndex(
        nativeQueue,
        nativeActiveIndex,
        queue
      );
      let nextSyncedProgress = {
        duration: nativeProgress.duration,
        position: nativeProgress.position,
      };

      const syncIndex = getSyncIndex(
        nativeQueue,
        resolvedQueue,
        nativeActiveIndex,
        existingQueueIndex,
        playbackTargetRef.current.index,
        nativePlaybackState.state
      );

      if (syncIndex !== null) {
        if (resolvedQueue.length === nativeQueue.length) {
          setQueue(resolvedQueue);
        }
        setIndex(syncIndex);
      } else if (
        nativeQueue.length === 0 &&
        playbackTargetRef.current.queue.length > 0 &&
        playbackTargetRef.current.index >= 0
      ) {
        const snapshot = playbackSnapshotRef.current;
        const target = playbackTargetRef.current;
        const startPositionMs = getStartPositionMs(snapshot);
        await replaceTrackPlayerQueue(
          target.queue,
          target.index,
          false,
          target.repeatMode,
          startPositionMs
        );
        nextSyncedProgress = {
          duration: snapshot.durationMs / 1000,
          position: startPositionMs / 1000,
        };
      }

      const isStopped =
        nativePlaybackState.state === State.Stopped ||
        nativePlaybackState.state === State.None;

      if (isStopped) {
        nextSyncedProgress = {
          duration: nextSyncedProgress.duration,
          position: 0,
        };
      }

      setSyncedPlaybackState(nativePlaybackState.state);
      setSyncedPlayWhenReady(nativePlayWhenReady);
      setSyncedProgress(nextSyncedProgress);
      setError(null);
    } catch (syncError) {
      if (isPlayerNotReadyError(syncError)) {
        playerSetupPromise = null;
      }
      setError(getErrorMessage(syncError));
    }
  }, [queue, replaceTrackPlayerQueue, sourceQueue]);

  useEffect(() => {
    if (
      syncedProgress &&
      (progress.position !== syncedProgress.position ||
        progress.duration !== syncedProgress.duration)
    ) {
      setSyncedProgress(null);
    }
  }, [progress.duration, progress.position, syncedProgress]);

  useEffect(() => {
    if (
      syncedPlaybackState !== undefined &&
      playbackState.state !== undefined &&
      playbackState.state !== syncedPlaybackState
    ) {
      setSyncedPlaybackState(undefined);
    }
  }, [playbackState.state, syncedPlaybackState]);

  useEffect(() => {
    if (
      syncedPlayWhenReady !== undefined &&
      playWhenReady !== undefined &&
      playWhenReady !== syncedPlayWhenReady
    ) {
      setSyncedPlayWhenReady(undefined);
    }
  }, [playWhenReady, syncedPlayWhenReady]);

  useEffect(() => {
    if (
      playWhenReadyIntentRef.current?.pending === false &&
      playWhenReady === playWhenReadyIntentRef.current.value
    ) {
      playWhenReadyIntentRef.current = null;
      setPlayWhenReadyOverride(undefined);
    }
  }, [playWhenReady]);

  const clearPlayWhenReady = useCallback(() => {
    playWhenReadyIntentRef.current = null;
    setPlayWhenReadyOverride(undefined);
  }, []);

  const runWithPlayWhenReady = useCallback(
    async (nextPlayWhenReady: boolean, action: () => Promise<void>) => {
      playWhenReadyIntentRef.current = {
        pending: true,
        value: nextPlayWhenReady,
      };
      setPlayWhenReadyOverride(nextPlayWhenReady);

      try {
        await action();
      } catch (error) {
        clearPlayWhenReady();
        throw error;
      }

      const intent = playWhenReadyIntentRef.current;
      if (intent?.value !== nextPlayWhenReady) {
        return;
      }

      if (playWhenReady === nextPlayWhenReady) {
        clearPlayWhenReady();
        return;
      }

      playWhenReadyIntentRef.current = {
        pending: false,
        value: nextPlayWhenReady,
      };
    },
    [clearPlayWhenReady, playWhenReady]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        syncPlaybackFromNative();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncPlaybackFromNative]);

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

  useTrackPlayerEvents(playbackEvents, (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged) {
      setSyncedProgress(null);
      if (
        typeof event.index === "number" &&
        event.index >= 0 &&
        (!looksLikeStopReset(event.index, index, effectivePlaybackState) ||
          looksLikeQueueWrapToStart({
            candidateIndex: event.index,
            candidateTrack: event.track,
            lastIndex: event.lastIndex,
            lastPosition: event.lastPosition,
            queue,
            repeatMode,
            trustedIndex: index,
          }))
      ) {
        setIndex(event.index);
        playbackTargetRef.current = {
          index: event.index,
          queue,
          repeatMode,
        };
      }
      setError(null);
      return;
    }

    if (event.type === Event.PlaybackState) {
      setSyncedPlaybackState(undefined);
      return;
    }

    if (event.type === Event.PlaybackPlayWhenReadyChanged) {
      setSyncedPlayWhenReady(undefined);
      const intent = playWhenReadyIntentRef.current;
      if (intent?.pending === false && event.playWhenReady === intent.value) {
        playWhenReadyIntentRef.current = null;
        setPlayWhenReadyOverride(undefined);
      }
      return;
    }

    if (event.type === Event.PlaybackError) {
      setError(event.message);
      return;
    }

    if (
      event.type === Event.PlaybackQueueEnded &&
      typeof event.track === "number"
    ) {
      setIndex(event.track);
      playbackTargetRef.current = {
        index: event.track,
        queue,
        repeatMode,
      };
    }
  });

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
        await runWithPlayWhenReady(true, async () => {
          setSourceQueue(tracks);
          await replaceTrackPlayerQueue(nextQueue, queueIndex, true);
        });
      } catch (playbackError) {
        setError(getErrorMessage(playbackError));
      }
    },
    [replaceTrackPlayerQueue, runWithPlayWhenReady, shuffle]
  );

  const skipNext = useCallback(async () => {
    if (queue.length === 0 || index < 0) {
      return;
    }

    try {
      setError(null);
      await ensureTrackPlayerReady();
      if (repeatMode === "track") {
        await runWithPlayWhenReady(true, async () => {
          await TrackPlayer.skip(index, 0);
          await TrackPlayer.play();
        });
        return;
      }

      if (index + 1 >= queue.length) {
        if (repeatMode === "queue") {
          await runWithPlayWhenReady(true, async () => {
            await TrackPlayer.skip(0, 0);
            await TrackPlayer.play();
          });
          setIndex(0);
          playbackTargetRef.current = { index: 0, queue, repeatMode };
          return;
        }
        await runWithPlayWhenReady(false, () => TrackPlayer.pause());
        return;
      }

      await runWithPlayWhenReady(true, async () => {
        await TrackPlayer.skipToNext();
        await TrackPlayer.play();
      });
    } catch (skipError) {
      setError(getErrorMessage(skipError));
    }
  }, [index, queue, repeatMode, runWithPlayWhenReady]);

  const skipPrevious = useCallback(async () => {
    if (queue.length === 0 || index < 0) {
      return;
    }

    try {
      setError(null);
      await ensureTrackPlayerReady();
      const previousIndex = index > 0 ? index - 1 : 0;
      await runWithPlayWhenReady(true, async () => {
        await TrackPlayer.skip(previousIndex, 0);
        await TrackPlayer.play();
      });
      setIndex(previousIndex);
      playbackTargetRef.current = { index: previousIndex, queue, repeatMode };
    } catch (skipError) {
      setError(getErrorMessage(skipError));
    }
  }, [index, queue, repeatMode, runWithPlayWhenReady]);

  const togglePlayPause = useCallback(async () => {
    try {
      setError(null);
      await ensureTrackPlayerReady();
      if (isPlaying) {
        await runWithPlayWhenReady(false, () => TrackPlayer.pause());
        return;
      }
      if (
        (effectivePlaybackState === State.None ||
          effectivePlaybackState === State.Stopped) &&
        queue.length > 0
      ) {
        const target =
          playbackTargetRef.current.queue.length > 0
            ? playbackTargetRef.current
            : { index, queue, repeatMode };
        const startPositionMs = Math.min(progressMs, durationMs);
        await runWithPlayWhenReady(true, () =>
          replaceTrackPlayerQueue(
            target.queue,
            Math.max(target.index, 0),
            true,
            target.repeatMode,
            startPositionMs
          )
        );
        return;
      }
      await runWithPlayWhenReady(true, () => TrackPlayer.play());
    } catch (playbackError) {
      setError(getErrorMessage(playbackError));
    }
  }, [
    durationMs,
    effectivePlaybackState,
    index,
    isPlaying,
    progressMs,
    queue,
    repeatMode,
    replaceTrackPlayerQueue,
    runWithPlayWhenReady,
  ]);

  const seekToPosition = useCallback(async (progressMs: number) => {
    try {
      setIsSeeking(true);
      setError(null);
      await ensureTrackPlayerReady();
      await TrackPlayer.seekTo(Math.max(0, progressMs) / 1000);
    } catch (seekError) {
      setError(getErrorMessage(seekError));
    } finally {
      setTimeout(() => {
        setIsSeeking(false);
      }, 200);
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
