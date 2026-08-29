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
import type {
  NativePlaybackSnapshot,
  NativePlaybackTrack,
} from "@/modules/reverb-player/src/ReverbPlayer.types";
import ReverbPlayer from "@/modules/reverb-player/src/ReverbPlayerModule";
import {
  flushPlaybackSnapshot,
  getPlaybackSnapshot,
  getPlaybackSnapshotActiveTrack,
  getPlaybackSnapshotTrackIndex,
  hydratePlaybackSnapshot,
  type PlaybackSnapshot,
  publishPlaybackSnapshot,
  publishProjectedPlaybackSnapshot,
  restoreStoppedPlaybackSnapshot,
  subscribePlaybackSnapshot,
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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const toNativeTrack = (track: LocalTrack): NativePlaybackTrack => ({
  album: track.album,
  artist: track.artist,
  artworkUri: track.artworkUri ?? undefined,
  id: track.id,
  mimeType: track.mimeType ?? undefined,
  title: track.title,
  uri: track.uri,
});

const clampProgressMs = (progressMs: number, durationMs: number) => {
  const safeProgressMs = Math.max(0, progressMs);
  return durationMs > 0 ? Math.min(safeProgressMs, durationMs) : safeProgressMs;
};

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

const resolveNativeQueue = (snapshot: PlaybackSnapshot, queueIds: string[]) => {
  if (queueIds.length === 0) {
    return snapshot.queue;
  }

  const tracksById = new Map(
    [...snapshot.sourceQueue, ...snapshot.queue].map((track) => [
      track.id,
      track,
    ])
  );
  const queue = queueIds
    .map((trackId) => tracksById.get(trackId))
    .filter((track): track is LocalTrack => Boolean(track));

  return queue.length === queueIds.length ? queue : snapshot.queue;
};

const publishNativeSnapshot = (nativeSnapshot: NativePlaybackSnapshot) => {
  publishPlaybackSnapshot(
    (snapshot) => {
      if (nativeSnapshot.capturedAtMs < snapshot.updatedAtMs) {
        return {};
      }

      if (nativeSnapshot.queueIds.length === 0) {
        return {
          error: nativeSnapshot.error,
          playbackState: snapshot.queue.length > 0 ? "paused" : "idle",
          playWhenReady: false,
        };
      }

      const queue = resolveNativeQueue(snapshot, nativeSnapshot.queueIds);
      const nativeTrackIndex = nativeSnapshot.activeTrackId
        ? queue.findIndex((track) => track.id === nativeSnapshot.activeTrackId)
        : nativeSnapshot.activeIndex;
      const activeIndex =
        nativeTrackIndex >= 0 && nativeTrackIndex < queue.length
          ? nativeTrackIndex
          : snapshot.activeIndex;
      const activeTrack = queue[activeIndex];
      const durationMs =
        nativeSnapshot.durationMs ||
        activeTrack?.durationMs ||
        snapshot.durationMs;
      return {
        activeIndex,
        activeTrackId: activeTrack?.id ?? nativeSnapshot.activeTrackId ?? null,
        durationMs,
        error: nativeSnapshot.error,
        playbackState: nativeSnapshot.playbackState,
        playWhenReady: nativeSnapshot.playWhenReady,
        progressMs: clampProgressMs(nativeSnapshot.positionMs, durationMs),
        queue,
        repeatMode: nativeSnapshot.repeatMode,
      };
    },
    {
      observedAtMs: nativeSnapshot.capturedAtMs,
      projectBeforeUpdate: false,
    }
  );
};

const publishPlaybackError = (error: unknown) => {
  publishPlaybackSnapshot(
    { error: getErrorMessage(error) },
    { persist: false }
  );
};

const setNativeQueue = async (
  queue: LocalTrack[],
  activeIndex: number,
  positionMs: number,
  playWhenReady: boolean,
  repeatMode: RepeatMode
) => {
  const nativeSnapshot = await ReverbPlayer.setQueue(queue.map(toNativeTrack), {
    activeIndex,
    playWhenReady,
    positionMs,
    repeatMode,
  });

  publishNativeSnapshot(nativeSnapshot);
};

const nativeQueueMatches = (
  nativeSnapshot: NativePlaybackSnapshot,
  queue: LocalTrack[]
) =>
  nativeSnapshot.queueIds.length === queue.length &&
  nativeSnapshot.queueIds.every(
    (trackId, index) => trackId === queue[index]?.id
  );

const getPlaybackValues = (snapshot: PlaybackSnapshot) => {
  const currentTrack = getPlaybackSnapshotActiveTrack(snapshot);
  const index = getPlaybackSnapshotTrackIndex(snapshot);
  const durationMs = snapshot.durationMs || currentTrack?.durationMs || 0;
  return {
    currentTrack,
    durationMs,
    index,
    isPlaying:
      currentTrack !== null &&
      snapshot.playWhenReady &&
      (snapshot.playbackState === "buffering" ||
        snapshot.playbackState === "playing" ||
        snapshot.playbackState === "ready"),
    progressMs: clampProgressMs(snapshot.progressMs, durationMs),
  };
};

function usePlaybackProviderValues() {
  const snapshot = useSyncExternalStore(
    subscribePlaybackSnapshot,
    getPlaybackSnapshot,
    getPlaybackSnapshot
  );
  const shuffleUpdateTokenRef = useRef(0);
  const { currentTrack, durationMs, index, isPlaying, progressMs } =
    getPlaybackValues(snapshot);

  const reconcileFromNative = useCallback(async () => {
    try {
      const stoppedSnapshot = await ReverbPlayer.getLastStoppedSnapshot();
      if (stoppedSnapshot) {
        restoreStoppedPlaybackSnapshot(stoppedSnapshot);
      }
      publishNativeSnapshot(await ReverbPlayer.connect());
    } catch (error) {
      publishPlaybackError(error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const nativeSubscription = ReverbPlayer.addListener(
      "onPlaybackSnapshotChanged",
      ({ snapshot: nativeSnapshot }) => {
        if (isMounted) {
          publishNativeSnapshot(nativeSnapshot);
        }
      }
    );
    const initialisationPromise = hydratePlaybackSnapshot().then(() =>
      reconcileFromNative()
    );
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          publishProjectedPlaybackSnapshot();
          initialisationPromise
            .then(reconcileFromNative)
            .catch(publishPlaybackError);
          return;
        }
        if (nextState === "inactive" || nextState === "background") {
          flushPlaybackSnapshot().catch(publishPlaybackError);
        }
      }
    );

    return () => {
      isMounted = false;
      nativeSubscription.remove();
      appStateSubscription.remove();
    };
  }, [reconcileFromNative]);

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
    if (artworkUris.length > 0) {
      Image.prefetch([...new Set(artworkUris)], {
        cachePolicy: "memory-disk",
      }).catch(() => undefined);
    }
  }, [snapshot.activeIndex, snapshot.activeTrackId, snapshot.queue]);

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
      const activeTrack = nextQueue[queueIndex];

      publishPlaybackSnapshot({
        activeIndex: queueIndex,
        activeTrackId: activeTrack.id,
        durationMs: activeTrack.durationMs,
        error: null,
        playbackState: "buffering",
        playWhenReady: true,
        progressMs: 0,
        queue: nextQueue,
        sourceQueue: tracks,
      });
      try {
        await setNativeQueue(
          nextQueue,
          queueIndex,
          0,
          true,
          currentSnapshot.repeatMode
        );
      } catch (error) {
        publishPlaybackError(error);
        await reconcileFromNative();
      }
    },
    [reconcileFromNative]
  );

  const togglePlayPause = useCallback(async () => {
    const currentSnapshot = getPlaybackSnapshot();
    const values = getPlaybackValues(currentSnapshot);
    if (!values.currentTrack) {
      return;
    }

    try {
      if (values.isPlaying) {
        publishPlaybackSnapshot({ playWhenReady: false });
        publishNativeSnapshot(await ReverbPlayer.pause());
        return;
      }

      const nativeSnapshot = await ReverbPlayer.getSnapshot();
      publishPlaybackSnapshot({
        error: null,
        playbackState: "buffering",
        playWhenReady: true,
      });
      if (nativeQueueMatches(nativeSnapshot, currentSnapshot.queue)) {
        if (currentSnapshot.playbackState === "ended") {
          await ReverbPlayer.seekTo(0);
        }
        publishNativeSnapshot(await ReverbPlayer.play());
        return;
      }
      const startPositionMs =
        currentSnapshot.playbackState === "ended" ? 0 : values.progressMs;
      await setNativeQueue(
        currentSnapshot.queue,
        Math.max(values.index, 0),
        startPositionMs,
        true,
        currentSnapshot.repeatMode
      );
    } catch (error) {
      publishPlaybackError(error);
      await reconcileFromNative();
    }
  }, [reconcileFromNative]);

  const skipNext = useCallback(async () => {
    const currentSnapshot = getPlaybackSnapshot();
    const currentIndex = getPlaybackSnapshotTrackIndex(currentSnapshot);
    if (currentIndex < 0 || currentSnapshot.queue.length === 0) {
      return;
    }

    try {
      const nativeSnapshot = await ReverbPlayer.getSnapshot();
      if (!nativeQueueMatches(nativeSnapshot, currentSnapshot.queue)) {
        await setNativeQueue(
          currentSnapshot.queue,
          currentIndex,
          currentSnapshot.progressMs,
          currentSnapshot.playWhenReady,
          currentSnapshot.repeatMode
        );
      }
      if (currentSnapshot.repeatMode === "track") {
        publishNativeSnapshot(await ReverbPlayer.seekTo(0));
        return;
      }
      publishNativeSnapshot(await ReverbPlayer.skipNext());
    } catch (error) {
      publishPlaybackError(error);
      await reconcileFromNative();
    }
  }, [reconcileFromNative]);

  const skipPrevious = useCallback(async () => {
    const currentSnapshot = getPlaybackSnapshot();
    const currentIndex = getPlaybackSnapshotTrackIndex(currentSnapshot);
    if (currentIndex < 0 || currentSnapshot.queue.length === 0) {
      return;
    }

    try {
      const nativeSnapshot = await ReverbPlayer.getSnapshot();
      if (!nativeQueueMatches(nativeSnapshot, currentSnapshot.queue)) {
        await setNativeQueue(
          currentSnapshot.queue,
          currentIndex,
          currentSnapshot.progressMs,
          currentSnapshot.playWhenReady,
          currentSnapshot.repeatMode
        );
      }
      publishNativeSnapshot(await ReverbPlayer.skipPrevious());
    } catch (error) {
      publishPlaybackError(error);
      await reconcileFromNative();
    }
  }, [reconcileFromNative]);

  const seekToPosition = useCallback(async (nextProgressMs: number) => {
    const currentSnapshot = getPlaybackSnapshot();
    const activeTrack = getPlaybackSnapshotActiveTrack(currentSnapshot);
    const nextDurationMs =
      currentSnapshot.durationMs || activeTrack?.durationMs || 0;
    const clampedProgressMs = clampProgressMs(nextProgressMs, nextDurationMs);
    publishPlaybackSnapshot({
      durationMs: nextDurationMs,
      error: null,
      progressMs: clampedProgressMs,
    });

    try {
      publishNativeSnapshot(await ReverbPlayer.seekTo(clampedProgressMs));
    } catch (error) {
      publishPlaybackError(error);
    }
  }, []);

  const setRepeatMode = useCallback((nextRepeatMode: RepeatMode) => {
    publishPlaybackSnapshot({ repeatMode: nextRepeatMode });
    ReverbPlayer.setRepeatMode(nextRepeatMode)
      .then(publishNativeSnapshot)
      .catch(publishPlaybackError);
  }, []);

  const setShuffle = useCallback((nextShuffle: boolean) => {
    const updateToken = shuffleUpdateTokenRef.current + 1;
    shuffleUpdateTokenRef.current = updateToken;
    const currentSnapshot = getPlaybackSnapshot();
    const activeTrack = getPlaybackSnapshotActiveTrack(currentSnapshot);
    if (!(activeTrack && currentSnapshot.sourceQueue.length > 0)) {
      publishPlaybackSnapshot({ shuffle: nextShuffle });
      return;
    }

    const nextQueue = nextShuffle
      ? shuffledTracksAfterCurrent(currentSnapshot.sourceQueue, activeTrack.id)
      : currentSnapshot.sourceQueue;
    const nextIndex = nextQueue.findIndex(
      (track) => track.id === activeTrack.id
    );
    publishPlaybackSnapshot({
      activeIndex: nextIndex,
      activeTrackId: activeTrack.id,
      queue: nextQueue,
      shuffle: nextShuffle,
    });

    ReverbPlayer.getSnapshot()
      .then((nativeSnapshot) => {
        if (
          shuffleUpdateTokenRef.current !== updateToken ||
          nativeSnapshot.queueIds.length === 0
        ) {
          return null;
        }
        return ReverbPlayer.replaceQueueOrder(nextQueue.map(toNativeTrack));
      })
      .then((nativeSnapshot) => {
        if (nativeSnapshot) {
          publishNativeSnapshot(nativeSnapshot);
        }
      })
      .catch((error) => {
        if (shuffleUpdateTokenRef.current === updateToken) {
          publishPlaybackSnapshot({
            activeIndex: currentSnapshot.activeIndex,
            activeTrackId: currentSnapshot.activeTrackId,
            queue: currentSnapshot.queue,
            shuffle: currentSnapshot.shuffle,
          });
          publishPlaybackError(error);
        }
      });
  }, []);

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
    () => ({ durationMs, isPlaying, progressMs }),
    [durationMs, isPlaying, progressMs]
  );
  const statusValue = useMemo(() => ({ isPlaying }), [isPlaying]);
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
      ...trackValue,
      ...progressValue,
      ...controlsValue,
    }),
    [controlsValue, progressValue, trackValue]
  );

  return { controlsValue, progressValue, statusValue, trackValue, value };
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
