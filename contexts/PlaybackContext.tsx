import { Image } from "expo-image";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  type NowPlayingSnapshot,
  State,
  type Track,
  RepeatMode as TrackPlayerRepeatMode,
  useTrackPlayerEvents,
} from "react-native-track-player";
import {
  flushPlaybackSnapshot,
  getPlaybackSnapshot,
  getPlaybackSnapshotActiveTrack,
  getPlaybackSnapshotTrackIndex,
  getTrackId,
  hydratePlaybackSnapshot,
  type PlaybackSnapshot,
  playbackSnapshotEvents,
  publishPlaybackSnapshot,
  publishPlaybackSnapshotEvent,
  publishProjectedPlaybackSnapshot,
  setPlaybackSnapshotActiveTrackEventsSuppressed,
  subscribePlaybackSnapshot,
  trackPlayerPlayingStates,
} from "@/services/playbackSnapshotStore";
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

const clampProgressMs = (progressMs: number, durationMs: number) => {
  const safeProgressMs = Math.max(0, progressMs);
  return durationMs > 0 ? Math.min(safeProgressMs, durationMs) : safeProgressMs;
};

const getProgressMs = (positionSeconds: number) =>
  Math.max(0, Math.round(positionSeconds * 1000));

const getDurationMs = (durationSeconds: number, fallbackDurationMs: number) =>
  Math.round(durationSeconds * 1000) || fallbackDurationMs;

const getActiveTrackPatch = (
  queue: LocalTrack[],
  activeIndex: number,
  progressMs = 0
): Partial<PlaybackSnapshot> => {
  const activeTrack = queue[activeIndex];
  if (!activeTrack) {
    return {
      activeIndex: -1,
      activeTrackId: null,
      durationMs: 0,
      progressMs: 0,
    };
  }

  return {
    activeIndex,
    activeTrackId: activeTrack.id,
    durationMs: activeTrack.durationMs,
    progressMs,
  };
};

interface PlaybackRepairTarget {
  activeIndex: number;
  activeTrackId: string | null;
  queue: LocalTrack[];
}

const getRepairTargetFromQueue = (
  queue: LocalTrack[],
  nativeActiveTrackId: string | null,
  nativeActiveIndex: number | undefined
): PlaybackRepairTarget => {
  if (nativeActiveTrackId) {
    return {
      activeIndex: queue.findIndex((track) => track.id === nativeActiveTrackId),
      activeTrackId: nativeActiveTrackId,
      queue,
    };
  }

  if (typeof nativeActiveIndex === "number" && queue[nativeActiveIndex]) {
    return {
      activeIndex: nativeActiveIndex,
      activeTrackId: queue[nativeActiveIndex].id,
      queue,
    };
  }

  return {
    activeIndex: -1,
    activeTrackId: null,
    queue,
  };
};

const getLocalRepairTarget = (
  snapshot: PlaybackSnapshot,
  nativeActiveTrackId: string | null,
  nativeActiveIndex: number | undefined
) =>
  getRepairTargetFromQueue(
    snapshot.queue,
    nativeActiveTrackId,
    nativeActiveIndex
  );

const shouldFetchNativeQueueForRepair = (
  target: PlaybackRepairTarget,
  nativeActiveTrackId: string | null,
  nativeActiveIndex: number | undefined
) =>
  (nativeActiveTrackId !== null && target.activeIndex < 0) ||
  (nativeActiveTrackId === null &&
    typeof nativeActiveIndex === "number" &&
    !target.queue[nativeActiveIndex]);

const getNativeQueueRepairTarget = (
  snapshot: PlaybackSnapshot,
  nativeQueue: Track[],
  nativeActiveTrackId: string | null,
  nativeActiveIndex: number | undefined
): PlaybackRepairTarget | null => {
  const resolvedQueue = resolveNativeQueue(
    nativeQueue,
    getTrackMap([snapshot.sourceQueue, snapshot.queue])
  );

  if (
    resolvedQueue.length === 0 ||
    resolvedQueue.length !== nativeQueue.length
  ) {
    return null;
  }

  return getRepairTargetFromQueue(
    resolvedQueue,
    nativeActiveTrackId,
    nativeActiveIndex
  );
};

const getOptimisticPlaybackState = (
  nextPlayWhenReady: boolean,
  playbackState: State | undefined
) => {
  if (
    nextPlayWhenReady &&
    (playbackState === undefined ||
      !trackPlayerPlayingStates.has(playbackState))
  ) {
    return State.Ready;
  }

  return playbackState;
};

const getRepairSnapshotPatch = (snapshot: {
  currentSnapshot: PlaybackSnapshot;
  nativePlaybackState: State;
  nativePlayWhenReady: boolean;
  nativeProgress: Pick<NowPlayingSnapshot, "duration" | "position">;
  target: PlaybackRepairTarget;
}): Partial<PlaybackSnapshot> => {
  const activeTrack =
    snapshot.target.activeIndex >= 0
      ? snapshot.target.queue[snapshot.target.activeIndex]
      : null;
  const durationMs = getDurationMs(
    snapshot.nativeProgress.duration,
    activeTrack?.durationMs || snapshot.currentSnapshot.durationMs
  );
  const isStopped =
    snapshot.nativePlaybackState === State.Stopped ||
    snapshot.nativePlaybackState === State.None;

  return {
    activeIndex:
      snapshot.target.activeIndex >= 0
        ? snapshot.target.activeIndex
        : snapshot.currentSnapshot.activeIndex,
    activeTrackId:
      snapshot.target.activeTrackId ??
      snapshot.currentSnapshot.activeTrackId ??
      null,
    durationMs,
    error: null,
    playbackState: snapshot.nativePlaybackState,
    playWhenReady: snapshot.nativePlayWhenReady,
    progressMs: isStopped
      ? 0
      : clampProgressMs(
          getProgressMs(snapshot.nativeProgress.position),
          durationMs
        ),
    queue: snapshot.target.queue,
  };
};

const getSnapshotPlaybackValues = (snapshot: PlaybackSnapshot) => {
  const currentTrack = getPlaybackSnapshotActiveTrack(snapshot);
  const index = getPlaybackSnapshotTrackIndex(snapshot);
  const durationMs = snapshot.durationMs || currentTrack?.durationMs || 0;
  const isEffectivelyStopped =
    snapshot.playbackState === State.Stopped ||
    snapshot.playbackState === State.None;
  const progressMs = isEffectivelyStopped
    ? 0
    : clampProgressMs(snapshot.progressMs, durationMs);
  const isPlaying =
    currentTrack !== null &&
    snapshot.playWhenReady === true &&
    snapshot.playbackState !== undefined &&
    trackPlayerPlayingStates.has(snapshot.playbackState);

  return {
    currentTrack,
    durationMs,
    index,
    isPlaying,
    progressMs,
  };
};

const publishPlaybackError = (error: unknown) => {
  publishPlaybackSnapshot({ error: getErrorMessage(error) });
};

function usePlaybackProviderValues() {
  const snapshot = useSyncExternalStore(
    subscribePlaybackSnapshot,
    getPlaybackSnapshot,
    getPlaybackSnapshot
  );
  const shuffleUpdateTokenRef = useRef(0);
  const { currentTrack, durationMs, index, isPlaying, progressMs } =
    getSnapshotPlaybackValues(snapshot);

  const projectPlaybackSnapshotNow = useCallback(() => {
    publishProjectedPlaybackSnapshot(Date.now());
  }, []);

  const reconcilePlaybackSnapshotFromNative = useCallback(async () => {
    try {
      await ensureTrackPlayerReady();

      const nativeSnapshot = await TrackPlayer.getNowPlayingSnapshot();
      const receivedAtMs = Date.now();
      const currentSnapshot = getPlaybackSnapshot();
      const nativeActiveTrackId =
        nativeSnapshot.activeTrackId ?? getTrackId(nativeSnapshot.activeTrack);
      let target = getLocalRepairTarget(
        currentSnapshot,
        nativeActiveTrackId,
        nativeSnapshot.activeIndex
      );

      if (
        shouldFetchNativeQueueForRepair(
          target,
          nativeActiveTrackId,
          nativeSnapshot.activeIndex
        )
      ) {
        const nativeQueue = await TrackPlayer.getQueue();
        target =
          getNativeQueueRepairTarget(
            currentSnapshot,
            nativeQueue,
            nativeActiveTrackId,
            nativeSnapshot.activeIndex
          ) ?? target;
      }

      publishPlaybackSnapshot({
        ...getRepairSnapshotPatch({
          currentSnapshot,
          nativePlaybackState: nativeSnapshot.playbackState.state,
          nativePlayWhenReady: nativeSnapshot.playWhenReady,
          nativeProgress: nativeSnapshot,
          target,
        }),
        updatedAtMs: receivedAtMs,
      });
    } catch (syncError) {
      if (isPlayerNotReadyError(syncError)) {
        playerSetupPromise = null;
      }
      publishPlaybackError(syncError);
    }
  }, []);

  const repairPlaybackSnapshotFromNative = useCallback(async () => {
    projectPlaybackSnapshotNow();
    await reconcilePlaybackSnapshotFromNative();
  }, [projectPlaybackSnapshotNow, reconcilePlaybackSnapshotFromNative]);

  const runWithPlayWhenReady = useCallback(
    async (nextPlayWhenReady: boolean, action: () => Promise<void>) => {
      const previousSnapshot = getPlaybackSnapshot();
      publishPlaybackSnapshot({
        error: null,
        playbackState: getOptimisticPlaybackState(
          nextPlayWhenReady,
          previousSnapshot.playbackState
        ),
        playWhenReady: nextPlayWhenReady,
      });

      try {
        await action();
      } catch (error) {
        publishPlaybackSnapshot({
          playbackState: previousSnapshot.playbackState,
          playWhenReady: previousSnapshot.playWhenReady,
        });
        throw error;
      }
    },
    []
  );

  const replaceTrackPlayerQueue = useCallback(
    async (
      tracks: LocalTrack[],
      nextIndex: number,
      shouldPlay: boolean,
      nextRepeatMode: RepeatMode,
      startPositionMs = 0
    ) => {
      if (tracks.length === 0) {
        publishPlaybackSnapshot({
          activeIndex: -1,
          activeTrackId: null,
          durationMs: 0,
          progressMs: 0,
          queue: [],
        });
        return;
      }

      await ensureTrackPlayerReady();
      await TrackPlayer.reset();
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

      publishPlaybackSnapshot({
        ...getActiveTrackPatch(tracks, safeIndex, startPositionMs),
        error: null,
        playbackState: shouldPlay ? State.Loading : State.Ready,
        playWhenReady: shouldPlay,
        queue: tracks,
        repeatMode: nextRepeatMode,
      });
    },
    []
  );

  const rebuildQueueForShuffle = useCallback(
    async (nextShuffle: boolean, updateToken: number) => {
      const currentSnapshot = getPlaybackSnapshot();
      const activeTrack = getPlaybackSnapshotActiveTrack(currentSnapshot);
      if (!activeTrack || currentSnapshot.sourceQueue.length === 0) {
        return;
      }

      const sourceIndex = currentSnapshot.sourceQueue.findIndex(
        (track) => track.id === activeTrack.id
      );
      if (sourceIndex < 0) {
        return;
      }

      const nextQueue = nextShuffle
        ? shuffledTracksAfterCurrent(
            currentSnapshot.sourceQueue,
            activeTrack.id
          )
        : currentSnapshot.sourceQueue;
      const nextIndex = nextQueue.findIndex(
        (track) => track.id === activeTrack.id
      );
      if (nextIndex < 0 || shuffleUpdateTokenRef.current !== updateToken) {
        return;
      }

      await ensureTrackPlayerReady();
      const [nativeActiveIndex, nativeProgress] = await Promise.all([
        TrackPlayer.getActiveTrackIndex(),
        TrackPlayer.getProgress(),
      ]);

      setPlaybackSnapshotActiveTrackEventsSuppressed(true);
      try {
        if (nextShuffle) {
          await applyShuffleOn(nativeActiveIndex, nextQueue);
        } else {
          await applyShuffleOff(nativeActiveIndex, nextIndex, nextQueue);
        }
      } finally {
        setPlaybackSnapshotActiveTrackEventsSuppressed(false);
      }

      const nativeProgressMs = getProgressMs(nativeProgress.position);
      const nextDurationMs = getDurationMs(
        nativeProgress.duration,
        activeTrack.durationMs
      );

      publishPlaybackSnapshot({
        ...getActiveTrackPatch(
          nextQueue,
          nextIndex,
          clampProgressMs(nativeProgressMs, nextDurationMs)
        ),
        queue: nextQueue,
      });
    },
    []
  );

  useEffect(() => {
    let isMounted = true;
    const projectThenReconcile = () => {
      projectPlaybackSnapshotNow();
      reconcilePlaybackSnapshotFromNative().catch(publishPlaybackError);
    };
    const projectThenFlush = () => {
      projectPlaybackSnapshotNow();
      flushPlaybackSnapshot().catch(publishPlaybackError);
    };

    hydratePlaybackSnapshot()
      .then(() => {
        if (isMounted && AppState.currentState === "active") {
          projectThenReconcile();
        }
      })
      .catch(publishPlaybackError);

    if (AppState.currentState === "active") {
      projectThenReconcile();
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        projectThenReconcile();
        return;
      }

      if (nextState === "inactive" || nextState === "background") {
        projectThenFlush();
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [projectPlaybackSnapshotNow, reconcilePlaybackSnapshotFromNative]);

  useEffect(() => {
    const activeIndex = snapshot.activeTrackId
      ? snapshot.queue.findIndex((track) => track.id === snapshot.activeTrackId)
      : snapshot.activeIndex;
    const artworkUris = [
      snapshot.queue[activeIndex - 1],
      snapshot.queue[activeIndex],
      snapshot.queue[activeIndex + 1],
    ]
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
  }, [snapshot.activeIndex, snapshot.activeTrackId, snapshot.queue]);

  useTrackPlayerEvents(playbackSnapshotEvents, (event) => {
    publishPlaybackSnapshotEvent(event);
  });

  const playQueue = useCallback(
    async (tracks: LocalTrack[], nextIndex = 0) => {
      if (tracks.length === 0) {
        return;
      }

      const currentSnapshot = getPlaybackSnapshot();
      const clampedIndex = Math.min(Math.max(nextIndex, 0), tracks.length - 1);
      const nextQueue = currentSnapshot.shuffle
        ? shuffledTracksAfterCurrent(tracks, tracks[clampedIndex].id)
        : tracks;
      const queueIndex = currentSnapshot.shuffle ? 0 : clampedIndex;

      try {
        publishPlaybackSnapshot({ error: null, sourceQueue: tracks });
        await runWithPlayWhenReady(true, () =>
          replaceTrackPlayerQueue(
            nextQueue,
            queueIndex,
            true,
            currentSnapshot.repeatMode
          )
        );
      } catch (playbackError) {
        publishPlaybackError(playbackError);
        repairPlaybackSnapshotFromNative().catch(publishPlaybackError);
      }
    },
    [
      repairPlaybackSnapshotFromNative,
      replaceTrackPlayerQueue,
      runWithPlayWhenReady,
    ]
  );

  const skipNext = useCallback(async () => {
    const currentSnapshot = getPlaybackSnapshot();
    const currentIndex = getPlaybackSnapshotTrackIndex(currentSnapshot);
    if (currentSnapshot.queue.length === 0 || currentIndex < 0) {
      return;
    }

    try {
      publishPlaybackSnapshot({ error: null });
      if (currentSnapshot.repeatMode === "track") {
        await ensureTrackPlayerReady();
        await runWithPlayWhenReady(true, async () => {
          publishPlaybackSnapshot({
            ...getActiveTrackPatch(currentSnapshot.queue, currentIndex, 0),
          });
          await TrackPlayer.skip(currentIndex, 0);
          await TrackPlayer.play();
        });
        return;
      }

      if (currentIndex + 1 >= currentSnapshot.queue.length) {
        if (currentSnapshot.repeatMode === "queue") {
          await ensureTrackPlayerReady();
          await runWithPlayWhenReady(true, async () => {
            publishPlaybackSnapshot({
              ...getActiveTrackPatch(currentSnapshot.queue, 0, 0),
            });
            await TrackPlayer.skip(0, 0);
            await TrackPlayer.play();
          });
          return;
        }
        await ensureTrackPlayerReady();
        await runWithPlayWhenReady(false, () => TrackPlayer.pause());
        return;
      }

      await ensureTrackPlayerReady();
      await runWithPlayWhenReady(true, async () => {
        publishPlaybackSnapshot({
          ...getActiveTrackPatch(currentSnapshot.queue, currentIndex + 1, 0),
        });
        await TrackPlayer.skipToNext();
        await TrackPlayer.play();
      });
    } catch (skipError) {
      publishPlaybackError(skipError);
      repairPlaybackSnapshotFromNative().catch(publishPlaybackError);
    }
  }, [repairPlaybackSnapshotFromNative, runWithPlayWhenReady]);

  const skipPrevious = useCallback(async () => {
    const currentSnapshot = getPlaybackSnapshot();
    const currentIndex = getPlaybackSnapshotTrackIndex(currentSnapshot);
    if (currentSnapshot.queue.length === 0 || currentIndex < 0) {
      return;
    }

    try {
      publishPlaybackSnapshot({ error: null });
      const currentDurationMs =
        durationMs || currentSnapshot.queue[currentIndex]?.durationMs || 0;
      const restartCurrentTrack =
        clampProgressMs(progressMs, currentDurationMs) >
        restartTrackThresholdMs;

      if (restartCurrentTrack) {
        publishPlaybackSnapshot({
          durationMs: currentDurationMs,
          progressMs: 0,
        });
        await ensureTrackPlayerReady();
        await TrackPlayer.seekTo(0);
        return;
      }

      const previousIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      await ensureTrackPlayerReady();
      await runWithPlayWhenReady(true, async () => {
        publishPlaybackSnapshot({
          ...getActiveTrackPatch(currentSnapshot.queue, previousIndex, 0),
        });
        await TrackPlayer.skip(previousIndex, 0);
        await TrackPlayer.play();
      });
    } catch (skipError) {
      publishPlaybackError(skipError);
      repairPlaybackSnapshotFromNative().catch(publishPlaybackError);
    }
  }, [
    durationMs,
    progressMs,
    repairPlaybackSnapshotFromNative,
    runWithPlayWhenReady,
  ]);

  const togglePlayPause = useCallback(async () => {
    const currentSnapshot = getPlaybackSnapshot();
    const currentValues = getSnapshotPlaybackValues(currentSnapshot);
    const shouldRestartQueue =
      (currentSnapshot.playbackState === State.None ||
        currentSnapshot.playbackState === State.Stopped) &&
      currentSnapshot.queue.length > 0;

    try {
      publishPlaybackSnapshot({ error: null });
      if (currentValues.isPlaying) {
        await ensureTrackPlayerReady();
        await runWithPlayWhenReady(false, () => TrackPlayer.pause());
        return;
      }
      if (shouldRestartQueue) {
        const startPositionMs = Math.min(
          currentValues.progressMs,
          currentValues.durationMs
        );
        await runWithPlayWhenReady(true, () =>
          replaceTrackPlayerQueue(
            currentSnapshot.queue,
            Math.max(currentValues.index, 0),
            true,
            currentSnapshot.repeatMode,
            startPositionMs
          )
        );
        return;
      }
      await ensureTrackPlayerReady();
      await runWithPlayWhenReady(true, () => TrackPlayer.play());
    } catch (playbackError) {
      publishPlaybackError(playbackError);
      repairPlaybackSnapshotFromNative().catch(publishPlaybackError);
    }
  }, [
    repairPlaybackSnapshotFromNative,
    replaceTrackPlayerQueue,
    runWithPlayWhenReady,
  ]);

  const seekToPosition = useCallback(async (nextProgressMs: number) => {
    const currentSnapshot = getPlaybackSnapshot();
    const currentActiveTrack = getPlaybackSnapshotActiveTrack(currentSnapshot);
    const nextDurationMs =
      currentSnapshot.durationMs || currentActiveTrack?.durationMs || 0;
    const clampedProgressMs = clampProgressMs(nextProgressMs, nextDurationMs);

    publishPlaybackSnapshot({
      durationMs: nextDurationMs,
      error: null,
      progressMs: clampedProgressMs,
    });

    try {
      await ensureTrackPlayerReady();
      await TrackPlayer.seekTo(clampedProgressMs / 1000);
    } catch (seekError) {
      publishPlaybackError(seekError);
    }
  }, []);

  const setRepeatMode = useCallback((nextRepeatMode: RepeatMode) => {
    publishPlaybackSnapshot({ repeatMode: nextRepeatMode });
    ensureTrackPlayerReady()
      .then(() =>
        TrackPlayer.setRepeatMode(toTrackPlayerRepeatMode(nextRepeatMode))
      )
      .catch((repeatError) => {
        publishPlaybackError(repeatError);
      });
  }, []);

  const setShuffle = useCallback(
    (nextShuffle: boolean) => {
      const previousShuffle = getPlaybackSnapshot().shuffle;
      const updateToken = shuffleUpdateTokenRef.current + 1;
      shuffleUpdateTokenRef.current = updateToken;
      publishPlaybackSnapshot({ shuffle: nextShuffle });
      rebuildQueueForShuffle(nextShuffle, updateToken).catch((shuffleError) => {
        if (shuffleUpdateTokenRef.current !== updateToken) {
          return;
        }
        publishPlaybackSnapshot({ shuffle: previousShuffle });
        publishPlaybackError(shuffleError);
      });
    },
    [rebuildQueueForShuffle]
  );

  const trackValue = useMemo(
    () => ({
      currentTrack,
      durationMs,
      error: snapshot.error,
      index,
      queue: snapshot.queue,
    }),
    [currentTrack, durationMs, index, snapshot.error, snapshot.queue]
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
      repeatMode: snapshot.repeatMode,
      seekToPosition,
      setRepeatMode,
      setShuffle,
      shuffle: snapshot.shuffle,
      skipNext,
      skipPrevious,
      togglePlayPause,
    }),
    [
      playQueue,
      seekToPosition,
      setRepeatMode,
      setShuffle,
      snapshot.repeatMode,
      snapshot.shuffle,
      skipNext,
      skipPrevious,
      togglePlayPause,
    ]
  );

  const value = useMemo(
    () => ({
      currentTrack,
      durationMs,
      error: snapshot.error,
      index,
      isPlaying,
      playQueue,
      progressMs,
      queue: snapshot.queue,
      repeatMode: snapshot.repeatMode,
      seekToPosition,
      setRepeatMode,
      setShuffle,
      shuffle: snapshot.shuffle,
      skipNext,
      skipPrevious,
      togglePlayPause,
    }),
    [
      currentTrack,
      durationMs,
      index,
      isPlaying,
      playQueue,
      progressMs,
      seekToPosition,
      setRepeatMode,
      setShuffle,
      snapshot.error,
      snapshot.queue,
      snapshot.repeatMode,
      snapshot.shuffle,
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
  const context = use(PlaybackTrackContext);
  if (!context) {
    throw new Error("usePlaybackTrack must be used within PlaybackProvider");
  }
  return context;
};

export const usePlaybackProgress = () => {
  const context = use(PlaybackProgressContext);
  if (!context) {
    throw new Error("usePlaybackProgress must be used within PlaybackProvider");
  }
  return context;
};

export const usePlaybackStatus = () => {
  const context = use(PlaybackStatusContext);
  if (!context) {
    throw new Error("usePlaybackStatus must be used within PlaybackProvider");
  }
  return context;
};

export const usePlaybackControls = () => {
  const context = use(PlaybackControlsContext);
  if (!context) {
    throw new Error("usePlaybackControls must be used within PlaybackProvider");
  }
  return context;
};
