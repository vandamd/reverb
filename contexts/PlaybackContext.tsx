import { Image } from "expo-image";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
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
const restartTrackThresholdMs = 3000;
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

const applyShuffleOn = async (
  nativeActiveIndex: number | undefined,
  nextQueue: LocalTrack[]
) => {
  await TrackPlayer.removeUpcomingTracks();
  if (typeof nativeActiveIndex === "number" && nativeActiveIndex > 0) {
    const indicesToRemove = Array.from(
      { length: nativeActiveIndex },
      (_, i) => i
    );
    await TrackPlayer.remove(indicesToRemove);
  }
  const upcomingTracks = nextQueue.slice(1);
  if (upcomingTracks.length > 0) {
    await TrackPlayer.add(upcomingTracks.map(toTrackPlayerTrack));
  }
};

const applyShuffleOff = async (
  nativeActiveIndex: number | undefined,
  nextIndex: number,
  nextQueue: LocalTrack[]
) => {
  await TrackPlayer.removeUpcomingTracks();
  if (typeof nativeActiveIndex === "number" && nativeActiveIndex > 0) {
    const indicesToRemove = Array.from(
      { length: nativeActiveIndex },
      (_, i) => i
    );
    await TrackPlayer.remove(indicesToRemove);
  }
  const tracksAfter = nextQueue.slice(nextIndex + 1);
  if (tracksAfter.length > 0) {
    await TrackPlayer.add(tracksAfter.map(toTrackPlayerTrack));
  }
  const tracksBefore = nextQueue.slice(0, nextIndex);
  if (tracksBefore.length > 0) {
    await TrackPlayer.add(tracksBefore.map(toTrackPlayerTrack), 0);
  }
};

const shouldUpdateIndexOnTrackChange = (
  eventIndex: number,
  currentIndex: number,
  playbackState: State | undefined,
  eventTrack: Track | undefined,
  eventLastIndex: number | undefined,
  eventLastPosition: number | undefined,
  currentQueue: LocalTrack[],
  currentRepeatMode: RepeatMode
) =>
  eventIndex >= 0 &&
  (!looksLikeStopReset(eventIndex, currentIndex, playbackState) ||
    looksLikeQueueWrapToStart({
      candidateIndex: eventIndex,
      candidateTrack: eventTrack,
      lastIndex: eventLastIndex,
      lastPosition: eventLastPosition,
      queue: currentQueue,
      repeatMode: currentRepeatMode,
      trustedIndex: currentIndex,
    }));

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

const clampProgressMs = (progressMs: number, durationMs: number) => {
  const safeProgressMs = Math.max(0, progressMs);
  return durationMs > 0 ? Math.min(safeProgressMs, durationMs) : safeProgressMs;
};

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

interface PlaybackProviderState {
  error: string | null;
  index: number;
  isSeeking: boolean;
  playWhenReadyOverride: boolean | undefined;
  queue: LocalTrack[];
  repeatMode: RepeatMode;
  shuffle: boolean;
  sourceQueue: LocalTrack[];
  syncedPlaybackState: State | undefined;
  syncedPlayWhenReady: boolean | undefined;
  syncedProgress: {
    duration: number;
    position: number;
  } | null;
}

const initialPlaybackProviderState: PlaybackProviderState = {
  error: null,
  index: -1,
  isSeeking: false,
  playWhenReadyOverride: undefined,
  queue: [],
  repeatMode: "off",
  shuffle: false,
  sourceQueue: [],
  syncedPlaybackState: undefined,
  syncedPlayWhenReady: undefined,
  syncedProgress: null,
};

const playbackProviderReducer = (
  state: PlaybackProviderState,
  nextState: Partial<PlaybackProviderState>
): PlaybackProviderState => ({
  ...state,
  ...nextState,
});

function usePlaybackProviderValues() {
  const playbackState = usePlaybackState();
  const playWhenReady = usePlayWhenReady();
  const progress = useProgress(playbackProgressUpdateIntervalMs);
  const [
    {
      error,
      index,
      isSeeking,
      playWhenReadyOverride,
      queue,
      repeatMode,
      shuffle,
      sourceQueue,
      syncedPlaybackState,
      syncedPlayWhenReady,
      syncedProgress,
    },
    updatePlaybackState,
  ] = useReducer(playbackProviderReducer, initialPlaybackProviderState);
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
  const shuffleUpdateTokenRef = useRef(0);
  const isRebuildingQueueRef = useRef(false);
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
        updatePlaybackState({
          index: -1,
          queue: [],
          syncedProgress: { duration: 0, position: 0 },
        });
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
      updatePlaybackState({
        index: safeIndex,
        queue: tracks,
        syncedProgress: {
          duration: tracks[safeIndex].durationMs / 1000,
          position: startPositionMs / 1000,
        },
      });
    },
    [repeatMode]
  );

  const rebuildQueueForShuffle = useCallback(
    async (nextShuffle: boolean, updateToken: number) => {
      if (!currentTrack || index < 0 || sourceQueue.length === 0) {
        return;
      }

      const sourceIndex = sourceQueue.findIndex(
        (track) => track.id === currentTrack.id
      );
      if (sourceIndex < 0) {
        return;
      }

      const nextQueue = nextShuffle
        ? shuffledTracksAfterCurrent(sourceQueue, currentTrack.id)
        : sourceQueue;
      const nextIndex = nextQueue.findIndex(
        (track) => track.id === currentTrack.id
      );
      if (nextIndex < 0) {
        return;
      }

      if (shuffleUpdateTokenRef.current !== updateToken) {
        return;
      }

      await ensureTrackPlayerReady();
      const [nativeActiveIndex, nativeProgress] = await Promise.all([
        TrackPlayer.getActiveTrackIndex(),
        TrackPlayer.getProgress(),
      ]);

      isRebuildingQueueRef.current = true;
      try {
        if (nextShuffle) {
          await applyShuffleOn(nativeActiveIndex, nextQueue);
        } else {
          await applyShuffleOff(nativeActiveIndex, nextIndex, nextQueue);
        }

        const progressMs = Math.round(nativeProgress.position * 1000);
        const durationMs =
          Math.round(nativeProgress.duration * 1000) ||
          currentTrack.durationMs ||
          0;

        playbackTargetRef.current = {
          index: nextIndex,
          queue: nextQueue,
          repeatMode,
        };
        updatePlaybackState({
          index: nextIndex,
          queue: nextQueue,
          syncedProgress: {
            duration: nextQueue[nextIndex].durationMs / 1000,
            position: clampProgressMs(progressMs, durationMs) / 1000,
          },
        });
      } finally {
        isRebuildingQueueRef.current = false;
      }
    },
    [currentTrack, index, repeatMode, sourceQueue]
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
          updatePlaybackState({ queue: resolvedQueue });
        }
        updatePlaybackState({ index: syncIndex });
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

      updatePlaybackState({ syncedPlaybackState: nativePlaybackState.state });
      updatePlaybackState({ syncedPlayWhenReady: nativePlayWhenReady });
      updatePlaybackState({ syncedProgress: nextSyncedProgress });
      updatePlaybackState({ error: null });
    } catch (syncError) {
      if (isPlayerNotReadyError(syncError)) {
        playerSetupPromise = null;
      }
      updatePlaybackState({ error: getErrorMessage(syncError) });
    }
  }, [queue, replaceTrackPlayerQueue, sourceQueue]);

  useEffect(() => {
    if (
      syncedProgress &&
      !isSeeking &&
      (progress.position !== syncedProgress.position ||
        progress.duration !== syncedProgress.duration)
    ) {
      const progressDifference = Math.abs(
        progress.position - syncedProgress.position
      );
      const durationDifference = Math.abs(
        progress.duration - syncedProgress.duration
      );
      if (progressDifference < 0.75 && durationDifference < 0.75) {
        updatePlaybackState({ syncedProgress: null });
      }
    }
  }, [isSeeking, progress.duration, progress.position, syncedProgress]);

  useEffect(() => {
    if (
      syncedPlaybackState !== undefined &&
      playbackState.state !== undefined &&
      playbackState.state !== syncedPlaybackState
    ) {
      updatePlaybackState({ syncedPlaybackState: undefined });
    }
  }, [playbackState.state, syncedPlaybackState]);

  useEffect(() => {
    if (
      syncedPlayWhenReady !== undefined &&
      playWhenReady !== undefined &&
      playWhenReady !== syncedPlayWhenReady
    ) {
      updatePlaybackState({ syncedPlayWhenReady: undefined });
    }
  }, [playWhenReady, syncedPlayWhenReady]);

  useEffect(() => {
    if (
      playWhenReadyIntentRef.current?.pending === false &&
      playWhenReady === playWhenReadyIntentRef.current.value
    ) {
      playWhenReadyIntentRef.current = null;
      updatePlaybackState({ playWhenReadyOverride: undefined });
    }
  }, [playWhenReady]);

  const clearPlayWhenReady = useCallback(() => {
    playWhenReadyIntentRef.current = null;
    updatePlaybackState({ playWhenReadyOverride: undefined });
  }, []);

  const runWithPlayWhenReady = useCallback(
    async (nextPlayWhenReady: boolean, action: () => Promise<void>) => {
      playWhenReadyIntentRef.current = {
        pending: true,
        value: nextPlayWhenReady,
      };
      updatePlaybackState({ playWhenReadyOverride: nextPlayWhenReady });

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
        updatePlaybackState({ error: getErrorMessage(setupError) });
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

  const handlePlaybackPlayWhenReadyChanged = useCallback(
    (nextPlayWhenReady: boolean) => {
      updatePlaybackState({ syncedPlayWhenReady: undefined });
      const intent = playWhenReadyIntentRef.current;
      if (intent?.pending === false && nextPlayWhenReady === intent.value) {
        playWhenReadyIntentRef.current = null;
        updatePlaybackState({ playWhenReadyOverride: undefined });
      }
    },
    []
  );

  const handlePlaybackQueueEnded = useCallback(
    (eventTrack: number) => {
      updatePlaybackState({ index: eventTrack });
      playbackTargetRef.current = {
        index: eventTrack,
        queue,
        repeatMode,
      };
    },
    [queue, repeatMode]
  );

  useTrackPlayerEvents(playbackEvents, (event) => {
    if (event.type === Event.PlaybackActiveTrackChanged) {
      if (isRebuildingQueueRef.current) {
        return;
      }
      updatePlaybackState({ syncedProgress: null });
      if (
        typeof event.index === "number" &&
        shouldUpdateIndexOnTrackChange(
          event.index,
          index,
          effectivePlaybackState,
          event.track,
          event.lastIndex,
          event.lastPosition,
          queue,
          repeatMode
        )
      ) {
        updatePlaybackState({ index: event.index });
        playbackTargetRef.current = {
          index: event.index,
          queue,
          repeatMode,
        };
      }
      updatePlaybackState({ error: null });
      return;
    }

    if (event.type === Event.PlaybackState) {
      updatePlaybackState({ syncedPlaybackState: undefined });
      return;
    }

    if (event.type === Event.PlaybackPlayWhenReadyChanged) {
      handlePlaybackPlayWhenReadyChanged(event.playWhenReady);
      return;
    }

    if (event.type === Event.PlaybackError) {
      updatePlaybackState({ error: event.message });
      return;
    }

    if (
      event.type === Event.PlaybackQueueEnded &&
      typeof event.track === "number"
    ) {
      handlePlaybackQueueEnded(event.track);
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
        updatePlaybackState({ error: null });
        await runWithPlayWhenReady(true, async () => {
          updatePlaybackState({ sourceQueue: tracks });
          await replaceTrackPlayerQueue(nextQueue, queueIndex, true);
        });
      } catch (playbackError) {
        updatePlaybackState({ error: getErrorMessage(playbackError) });
      }
    },
    [replaceTrackPlayerQueue, runWithPlayWhenReady, shuffle]
  );

  const skipNext = useCallback(async () => {
    if (queue.length === 0 || index < 0) {
      return;
    }

    try {
      updatePlaybackState({ error: null });
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
          updatePlaybackState({ index: 0 });
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
      updatePlaybackState({ error: getErrorMessage(skipError) });
    }
  }, [index, queue, repeatMode, runWithPlayWhenReady]);

  const skipPrevious = useCallback(async () => {
    if (queue.length === 0 || index < 0) {
      return;
    }

    try {
      updatePlaybackState({ error: null });
      await ensureTrackPlayerReady();
      const currentDurationMs = durationMs || queue[index]?.durationMs || 0;
      const restartCurrentTrack =
        clampProgressMs(progressMs, currentDurationMs) >
        restartTrackThresholdMs;

      if (restartCurrentTrack) {
        updatePlaybackState({
          syncedProgress: {
            duration: currentDurationMs / 1000,
            position: 0,
          },
        });
        playbackSnapshotRef.current = {
          durationMs: currentDurationMs,
          progressMs: 0,
        };
        await TrackPlayer.seekTo(0);
        return;
      }

      const previousIndex = index > 0 ? index - 1 : 0;
      await runWithPlayWhenReady(true, async () => {
        await TrackPlayer.skip(previousIndex, 0);
        await TrackPlayer.play();
      });
      updatePlaybackState({
        index: previousIndex,
        syncedProgress: {
          duration: queue[previousIndex].durationMs / 1000,
          position: 0,
        },
      });
      playbackTargetRef.current = { index: previousIndex, queue, repeatMode };
    } catch (skipError) {
      updatePlaybackState({ error: getErrorMessage(skipError) });
    }
  }, [durationMs, index, progressMs, queue, repeatMode, runWithPlayWhenReady]);

  const togglePlayPause = useCallback(async () => {
    try {
      updatePlaybackState({ error: null });
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
      updatePlaybackState({ error: getErrorMessage(playbackError) });
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

  const seekToPosition = useCallback(
    async (nextProgressMs: number) => {
      const nextDurationMs = durationMs || currentTrack?.durationMs || 0;
      const clampedProgressMs = clampProgressMs(nextProgressMs, nextDurationMs);

      updatePlaybackState({
        error: null,
        isSeeking: true,
        syncedProgress: {
          duration: nextDurationMs / 1000,
          position: clampedProgressMs / 1000,
        },
      });
      playbackSnapshotRef.current = {
        durationMs: nextDurationMs,
        progressMs: clampedProgressMs,
      };

      try {
        await ensureTrackPlayerReady();
        await TrackPlayer.seekTo(clampedProgressMs / 1000);
      } catch (seekError) {
        updatePlaybackState({ error: getErrorMessage(seekError) });
      } finally {
        setTimeout(() => {
          updatePlaybackState({ isSeeking: false });
        }, 200);
      }
    },
    [currentTrack?.durationMs, durationMs]
  );

  const setRepeatMode = useCallback((nextRepeatMode: RepeatMode) => {
    updatePlaybackState({ repeatMode: nextRepeatMode });
    ensureTrackPlayerReady()
      .then(() =>
        TrackPlayer.setRepeatMode(toTrackPlayerRepeatMode(nextRepeatMode))
      )
      .catch((repeatError) => {
        updatePlaybackState({ error: getErrorMessage(repeatError) });
      });
  }, []);

  const setShuffle = useCallback(
    (nextShuffle: boolean) => {
      const updateToken = shuffleUpdateTokenRef.current + 1;
      shuffleUpdateTokenRef.current = updateToken;
      updatePlaybackState({ shuffle: nextShuffle });
      rebuildQueueForShuffle(nextShuffle, updateToken).catch((shuffleError) => {
        if (shuffleUpdateTokenRef.current !== updateToken) {
          return;
        }
        updatePlaybackState({ shuffle: !nextShuffle });
        updatePlaybackState({ error: getErrorMessage(shuffleError) });
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

  return {
    controlsValue,
    progressValue,
    statusValue,
    trackValue,
    value,
  };
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const { controlsValue, progressValue, statusValue, trackValue, value } =
    usePlaybackProviderValues();

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
