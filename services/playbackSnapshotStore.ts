import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Event,
  type EventPayloadByEvent,
  type EventPayloadByEventWithType,
  State,
  type Track,
} from "react-native-track-player";
import { projectPlaybackSnapshot as projectPlaybackSnapshotValue } from "@/services/playbackProjection";
import type { LocalTrack, RepeatMode } from "@/types/music";

export const playbackSnapshotEvents = [
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackError,
  Event.PlaybackPlayWhenReadyChanged,
  Event.PlaybackProgressUpdated,
  Event.PlaybackQueueEnded,
  Event.PlaybackState,
] satisfies Event[];

export type PlaybackSnapshotEventType = (typeof playbackSnapshotEvents)[number];
export type PlaybackSnapshotEvent =
  EventPayloadByEventWithType[PlaybackSnapshotEventType];

export interface PlaybackSnapshot {
  activeIndex: number;
  activeTrackId: string | null;
  durationMs: number;
  error: string | null;
  playbackState: State | undefined;
  playWhenReady: boolean | undefined;
  progressMs: number;
  queue: LocalTrack[];
  queueRevision: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  sourceQueue: LocalTrack[];
  updatedAtMs: number;
}

type PlaybackSnapshotPatch = Partial<PlaybackSnapshot>;
type PlaybackSnapshotUpdate =
  | PlaybackSnapshotPatch
  | ((snapshot: PlaybackSnapshot) => PlaybackSnapshotPatch);
type PlaybackSnapshotListener = () => void;

const initialPlaybackSnapshot: PlaybackSnapshot = {
  activeIndex: -1,
  activeTrackId: null,
  durationMs: 0,
  error: null,
  playbackState: undefined,
  playWhenReady: undefined,
  progressMs: 0,
  queue: [],
  queueRevision: 0,
  repeatMode: "off",
  shuffle: false,
  sourceQueue: [],
  updatedAtMs: Date.now(),
};

type PersistedPlaybackSnapshot = Pick<
  PlaybackSnapshot,
  | "activeIndex"
  | "activeTrackId"
  | "durationMs"
  | "playbackState"
  | "playWhenReady"
  | "progressMs"
  | "queue"
  | "queueRevision"
  | "repeatMode"
  | "shuffle"
  | "sourceQueue"
  | "updatedAtMs"
>;

const playbackSnapshotStorageKey = "reverb:playbackSnapshot:v1";
const progressPersistenceIntervalMs = 15_000;
const projectedReadStaleAfterMs = 1000;
const duplicateEventWindowMs = 100;

export const trackPlayerPlayingStates = new Set<State>([
  State.Buffering,
  State.Loading,
  State.Playing,
  State.Ready,
]);

let playbackSnapshot = initialPlaybackSnapshot;
let suppressActiveTrackEvents = false;
let hydrationPromise: Promise<void> | null = null;
let lastPersistedProgressAtMs = 0;
let lastPersistedSnapshotJson = "";
let persistQueue: Promise<void> = Promise.resolve();
let lastPlaybackEventKey = "";
let lastPlaybackEventAtMs = 0;
const playbackSnapshotListeners = new Set<PlaybackSnapshotListener>();

export const getTrackId = (track: Track | undefined) => {
  if (typeof track?.id === "string") {
    return track.id;
  }
  return null;
};

const getTrackDurationMs = (track: Track | undefined) =>
  typeof track?.duration === "number" ? Math.round(track.duration * 1000) : 0;

const getProgressMs = (positionSeconds: number) =>
  Math.max(0, Math.round(positionSeconds * 1000));

const getDurationMs = (durationSeconds: number, fallbackDurationMs: number) =>
  Math.round(durationSeconds * 1000) || fallbackDurationMs;

const getTrackIndexById = (queue: LocalTrack[], trackId: string | null) =>
  trackId ? queue.findIndex((track) => track.id === trackId) : -1;

export const getPlaybackSnapshotTrackIndex = (snapshot = playbackSnapshot) => {
  const trackIdIndex = getTrackIndexById(
    snapshot.queue,
    snapshot.activeTrackId
  );
  if (trackIdIndex >= 0) {
    return trackIdIndex;
  }

  return snapshot.activeIndex >= 0 &&
    snapshot.activeIndex < snapshot.queue.length
    ? snapshot.activeIndex
    : -1;
};

export const getPlaybackSnapshotActiveTrack = (snapshot = playbackSnapshot) => {
  const activeIndex = getPlaybackSnapshotTrackIndex(snapshot);
  return activeIndex >= 0 ? (snapshot.queue[activeIndex] ?? null) : null;
};

export const projectPlaybackSnapshot = (
  snapshot: PlaybackSnapshot,
  nowMs: number
): PlaybackSnapshot =>
  projectPlaybackSnapshotValue(snapshot, nowMs, {
    endedState: State.Ended,
    playingStates: trackPlayerPlayingStates,
  });

const hasSnapshotChanged = (nextSnapshot: PlaybackSnapshot) =>
  Object.keys(nextSnapshot).some((key) => {
    const snapshotKey = key as keyof PlaybackSnapshot;
    return !Object.is(nextSnapshot[snapshotKey], playbackSnapshot[snapshotKey]);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRepeatMode = (value: unknown): value is RepeatMode =>
  value === "off" || value === "track" || value === "queue";

const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === "boolean";

const isTrackId = (value: unknown): value is string | null =>
  typeof value === "string" || value === null;

const getFiniteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toPersistedPlaybackSnapshot = (
  snapshot: PlaybackSnapshot
): PersistedPlaybackSnapshot => ({
  activeIndex: snapshot.activeIndex,
  activeTrackId: snapshot.activeTrackId,
  durationMs: snapshot.durationMs,
  playbackState: snapshot.playbackState,
  playWhenReady: snapshot.playWhenReady,
  progressMs: snapshot.progressMs,
  queue: snapshot.queue,
  queueRevision: snapshot.queueRevision,
  repeatMode: snapshot.repeatMode,
  shuffle: snapshot.shuffle,
  sourceQueue: snapshot.sourceQueue,
  updatedAtMs: snapshot.updatedAtMs,
});

const getPersistedPlaybackSnapshot = (
  value: unknown
): PersistedPlaybackSnapshot | null => {
  if (!(isRecord(value) && Array.isArray(value.queue))) {
    return null;
  }

  const repeatMode = isRepeatMode(value.repeatMode)
    ? value.repeatMode
    : initialPlaybackSnapshot.repeatMode;
  const activeTrackId = isTrackId(value.activeTrackId)
    ? value.activeTrackId
    : null;
  const playWhenReady = isOptionalBoolean(value.playWhenReady)
    ? value.playWhenReady
    : undefined;

  return {
    activeIndex: getFiniteNumber(
      value.activeIndex,
      initialPlaybackSnapshot.activeIndex
    ),
    activeTrackId,
    durationMs: getFiniteNumber(
      value.durationMs,
      initialPlaybackSnapshot.durationMs
    ),
    playbackState: value.playbackState as State | undefined,
    playWhenReady,
    progressMs: getFiniteNumber(
      value.progressMs,
      initialPlaybackSnapshot.progressMs
    ),
    queue: value.queue as LocalTrack[],
    queueRevision: getFiniteNumber(
      value.queueRevision,
      initialPlaybackSnapshot.queueRevision
    ),
    repeatMode,
    shuffle:
      typeof value.shuffle === "boolean"
        ? value.shuffle
        : initialPlaybackSnapshot.shuffle,
    sourceQueue: Array.isArray(value.sourceQueue)
      ? (value.sourceQueue as LocalTrack[])
      : (value.queue as LocalTrack[]),
    updatedAtMs: getFiniteNumber(value.updatedAtMs, Date.now()),
  };
};

const immediatePersistenceKeys = new Set<keyof PlaybackSnapshot>([
  "activeIndex",
  "activeTrackId",
  "playbackState",
  "playWhenReady",
  "queue",
  "queueRevision",
  "repeatMode",
  "shuffle",
  "sourceQueue",
]);

const shouldPersistPlaybackSnapshot = (
  patch: PlaybackSnapshotPatch,
  snapshot: PlaybackSnapshot,
  nowMs: number
) => {
  const patchKeys = Object.keys(patch) as (keyof PlaybackSnapshot)[];
  const hasRecoverableChange = patchKeys.some(
    (key) => key !== "error" && key !== "updatedAtMs"
  );

  if (!hasRecoverableChange) {
    return false;
  }

  if (
    snapshot.playWhenReady !== true ||
    patchKeys.some((key) => immediatePersistenceKeys.has(key))
  ) {
    return true;
  }

  return nowMs - lastPersistedProgressAtMs >= progressPersistenceIntervalMs;
};

const persistPlaybackSnapshot = (snapshot: PlaybackSnapshot, force = false) => {
  const persistedSnapshot = toPersistedPlaybackSnapshot(snapshot);
  const snapshotJson = JSON.stringify(persistedSnapshot);

  if (!force && snapshotJson === lastPersistedSnapshotJson) {
    return persistQueue;
  }

  lastPersistedSnapshotJson = snapshotJson;
  lastPersistedProgressAtMs = Date.now();
  persistQueue = persistQueue
    .catch(() => {
      // Persistence is best-effort; playback state remains in memory.
    })
    .then(() => AsyncStorage.setItem(playbackSnapshotStorageKey, snapshotJson))
    .catch(() => {
      // Persistence is best-effort; playback state remains in memory.
    });

  return persistQueue;
};

const queuePlaybackSnapshotPersistence = (
  patch: PlaybackSnapshotPatch,
  snapshot: PlaybackSnapshot
) => {
  if (shouldPersistPlaybackSnapshot(patch, snapshot, Date.now())) {
    persistPlaybackSnapshot(snapshot);
  }
};

const emitPlaybackSnapshotChange = () => {
  for (const listener of playbackSnapshotListeners) {
    listener();
  }
};

const canProjectPlaybackSnapshot = (
  snapshot: PlaybackSnapshot,
  nowMs: number
) =>
  nowMs - snapshot.updatedAtMs >= projectedReadStaleAfterMs &&
  snapshot.playWhenReady === true &&
  snapshot.playbackState !== undefined &&
  trackPlayerPlayingStates.has(snapshot.playbackState) &&
  getPlaybackSnapshotActiveTrack(snapshot) !== null;

const getProjectedPlaybackSnapshotForRead = () => {
  const nowMs = Date.now();
  if (!canProjectPlaybackSnapshot(playbackSnapshot, nowMs)) {
    return playbackSnapshot;
  }

  const nextSnapshot = projectPlaybackSnapshot(playbackSnapshot, nowMs);
  if (!hasSnapshotChanged(nextSnapshot)) {
    return playbackSnapshot;
  }

  playbackSnapshot = nextSnapshot;
  return playbackSnapshot;
};

export const getPlaybackSnapshot = () => getProjectedPlaybackSnapshotForRead();

export const subscribePlaybackSnapshot = (
  listener: PlaybackSnapshotListener
) => {
  playbackSnapshotListeners.add(listener);
  return () => {
    playbackSnapshotListeners.delete(listener);
  };
};

export const publishPlaybackSnapshot = (update: PlaybackSnapshotUpdate) => {
  const patch =
    typeof update === "function" ? update(playbackSnapshot) : update;
  const timestampedPatch =
    patch.updatedAtMs === undefined
      ? { ...patch, updatedAtMs: Date.now() }
      : patch;
  const nextSnapshot = { ...playbackSnapshot, ...timestampedPatch };

  if (
    timestampedPatch.queue &&
    timestampedPatch.queue !== playbackSnapshot.queue &&
    timestampedPatch.queueRevision === undefined
  ) {
    nextSnapshot.queueRevision = playbackSnapshot.queueRevision + 1;
  }

  if (!hasSnapshotChanged(nextSnapshot)) {
    return playbackSnapshot;
  }

  playbackSnapshot = nextSnapshot;
  queuePlaybackSnapshotPersistence(timestampedPatch, nextSnapshot);
  emitPlaybackSnapshotChange();
  return playbackSnapshot;
};

export const publishProjectedPlaybackSnapshot = (nowMs = Date.now()) =>
  publishPlaybackSnapshot((snapshot) =>
    projectPlaybackSnapshot(snapshot, nowMs)
  );

export const flushPlaybackSnapshot = () => {
  const projectedSnapshot = projectPlaybackSnapshot(
    playbackSnapshot,
    Date.now()
  );

  if (hasSnapshotChanged(projectedSnapshot)) {
    playbackSnapshot = projectedSnapshot;
    emitPlaybackSnapshotChange();
  }

  return persistPlaybackSnapshot(playbackSnapshot, true);
};

export const hydratePlaybackSnapshot = () => {
  hydrationPromise ??= AsyncStorage.getItem(playbackSnapshotStorageKey)
    .then((snapshotJson) => {
      if (!snapshotJson) {
        return;
      }

      const persistedSnapshot = getPersistedPlaybackSnapshot(
        JSON.parse(snapshotJson)
      );
      if (!persistedSnapshot) {
        return;
      }

      if (playbackSnapshot.queue.length > 0 || playbackSnapshot.activeTrackId) {
        return;
      }

      lastPersistedSnapshotJson = JSON.stringify(persistedSnapshot);
      publishPlaybackSnapshot({
        ...persistedSnapshot,
        error: null,
      });
    })
    .catch(() => {
      // A corrupt snapshot should not block app startup.
    });

  return hydrationPromise;
};

export const setPlaybackSnapshotActiveTrackEventsSuppressed = (
  suppressed: boolean
) => {
  suppressActiveTrackEvents = suppressed;
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

  const candidateTrackId = getTrackId(snapshot.candidateTrack);
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

const shouldUpdateIndexOnTrackChange = (
  eventIndex: number,
  currentSnapshot: PlaybackSnapshot,
  eventTrack: Track | undefined,
  eventLastIndex: number | undefined,
  eventLastPosition: number | undefined
) => {
  const trustedIndex = getPlaybackSnapshotTrackIndex(currentSnapshot);
  return (
    eventIndex >= 0 &&
    (!looksLikeStopReset(
      eventIndex,
      trustedIndex,
      currentSnapshot.playbackState
    ) ||
      looksLikeQueueWrapToStart({
        candidateIndex: eventIndex,
        candidateTrack: eventTrack,
        lastIndex: eventLastIndex,
        lastPosition: eventLastPosition,
        queue: currentSnapshot.queue,
        repeatMode: currentSnapshot.repeatMode,
        trustedIndex,
      }))
  );
};

const getResolvedTrackFromId = (
  snapshot: PlaybackSnapshot,
  eventTrackId: string,
  eventIndex: number | undefined,
  eventTrack: Track | undefined
) => {
  const localIndex = getTrackIndexById(snapshot.queue, eventTrackId);
  const activeIndex =
    localIndex >= 0 ? localIndex : (eventIndex ?? snapshot.activeIndex);

  return {
    activeIndex,
    activeTrackId: eventTrackId,
    durationMs:
      localIndex >= 0
        ? snapshot.queue[localIndex].durationMs
        : getTrackDurationMs(eventTrack) || snapshot.durationMs,
  };
};

const getResolvedTrackFromIndex = (
  snapshot: PlaybackSnapshot,
  eventIndex: number | undefined
) => {
  if (
    typeof eventIndex !== "number" ||
    eventIndex < 0 ||
    eventIndex >= snapshot.queue.length
  ) {
    return null;
  }

  const eventLocalTrack = snapshot.queue[eventIndex];
  return {
    activeIndex: eventIndex,
    activeTrackId: eventLocalTrack.id,
    durationMs: eventLocalTrack.durationMs,
  };
};

const getResolvedEventTrack = (
  snapshot: PlaybackSnapshot,
  eventIndex: number | undefined,
  eventTrack: Track | undefined
) => {
  const eventTrackId = getTrackId(eventTrack);
  return eventTrackId
    ? getResolvedTrackFromId(snapshot, eventTrackId, eventIndex, eventTrack)
    : getResolvedTrackFromIndex(snapshot, eventIndex);
};

const publishActiveTrackChanged = (
  event: EventPayloadByEventWithType[Event.PlaybackActiveTrackChanged]
) => {
  if (suppressActiveTrackEvents) {
    return;
  }

  publishPlaybackSnapshot((snapshot) => {
    const eventTrack = getResolvedEventTrack(
      snapshot,
      event.index,
      event.track
    );

    if (!eventTrack) {
      return { error: null };
    }

    if (
      !shouldUpdateIndexOnTrackChange(
        eventTrack.activeIndex,
        snapshot,
        event.track,
        event.lastIndex,
        event.lastPosition
      )
    ) {
      return { error: null };
    }

    return {
      activeIndex: eventTrack.activeIndex,
      activeTrackId: eventTrack.activeTrackId,
      durationMs: eventTrack.durationMs,
      error: null,
      progressMs: 0,
    };
  });
};

const publishProgressUpdated = (
  event: EventPayloadByEventWithType[Event.PlaybackProgressUpdated]
) => {
  publishPlaybackSnapshot((snapshot) => {
    const eventTrack = getResolvedEventTrack(snapshot, event.track, undefined);
    const fallbackDurationMs =
      eventTrack?.durationMs ||
      getPlaybackSnapshotActiveTrack(snapshot)?.durationMs ||
      0;
    const playbackState =
      snapshot.playbackState === undefined ||
      snapshot.playbackState === State.None ||
      snapshot.playbackState === State.Stopped
        ? State.Playing
        : snapshot.playbackState;

    return {
      activeIndex: eventTrack?.activeIndex ?? snapshot.activeIndex,
      activeTrackId: eventTrack?.activeTrackId ?? snapshot.activeTrackId,
      durationMs: getDurationMs(event.duration, fallbackDurationMs),
      playbackState,
      playWhenReady: true,
      progressMs: getProgressMs(event.position),
    };
  });
};

const publishQueueEnded = (
  event: EventPayloadByEventWithType[Event.PlaybackQueueEnded]
) => {
  publishPlaybackSnapshot((snapshot) => {
    const endedTrack =
      event.track >= 0 && event.track < snapshot.queue.length
        ? snapshot.queue[event.track]
        : null;

    return {
      activeIndex: endedTrack ? event.track : snapshot.activeIndex,
      activeTrackId: endedTrack?.id ?? snapshot.activeTrackId,
      durationMs: endedTrack?.durationMs ?? snapshot.durationMs,
      playWhenReady: false,
      progressMs: endedTrack?.durationMs ?? snapshot.progressMs,
    };
  });
};

const publishPlaybackState = (
  event: EventPayloadByEventWithType[Event.PlaybackState]
) => {
  publishPlaybackSnapshot((snapshot) => ({
    playbackState: event.state,
    progressMs:
      event.state === State.None || event.state === State.Stopped
        ? 0
        : snapshot.progressMs,
  }));
};

const getPlaybackSnapshotEventKey = (event: PlaybackSnapshotEvent) => {
  if (event.type === Event.PlaybackActiveTrackChanged) {
    return [
      event.type,
      event.index,
      getTrackId(event.track),
      event.lastIndex,
      event.lastPosition,
    ].join(":");
  }

  if (event.type === Event.PlaybackProgressUpdated) {
    return [event.type, event.track, event.position, event.duration].join(":");
  }

  if (event.type === Event.PlaybackState) {
    return [event.type, event.state].join(":");
  }

  if (event.type === Event.PlaybackPlayWhenReadyChanged) {
    return [event.type, event.playWhenReady].join(":");
  }

  if (event.type === Event.PlaybackError) {
    return [event.type, event.code, event.message].join(":");
  }

  if (event.type === Event.PlaybackQueueEnded) {
    return [event.type, event.track, event.position].join(":");
  }

  return "";
};

const isDuplicatePlaybackSnapshotEvent = (event: PlaybackSnapshotEvent) => {
  const nowMs = Date.now();
  const eventKey = getPlaybackSnapshotEventKey(event);
  const isDuplicate =
    eventKey === lastPlaybackEventKey &&
    nowMs - lastPlaybackEventAtMs < duplicateEventWindowMs;

  lastPlaybackEventKey = eventKey;
  lastPlaybackEventAtMs = nowMs;
  return isDuplicate;
};

export const publishPlaybackSnapshotEvent = (event: PlaybackSnapshotEvent) => {
  if (isDuplicatePlaybackSnapshotEvent(event)) {
    return;
  }

  if (event.type === Event.PlaybackActiveTrackChanged) {
    publishActiveTrackChanged(event);
    return;
  }

  if (event.type === Event.PlaybackProgressUpdated) {
    publishProgressUpdated(event);
    return;
  }

  if (event.type === Event.PlaybackState) {
    publishPlaybackState(event);
    return;
  }

  if (event.type === Event.PlaybackPlayWhenReadyChanged) {
    publishPlaybackSnapshot({ playWhenReady: event.playWhenReady });
    return;
  }

  if (event.type === Event.PlaybackError) {
    publishPlaybackSnapshot({ error: event.message });
    return;
  }

  if (event.type === Event.PlaybackQueueEnded) {
    publishQueueEnded(event);
  }
};

export const publishPlaybackSnapshotEventPayload = (
  type: PlaybackSnapshotEventType,
  payload: EventPayloadByEvent[PlaybackSnapshotEventType]
) => {
  publishPlaybackSnapshotEvent({
    ...payload,
    type,
  } as PlaybackSnapshotEvent);
};
