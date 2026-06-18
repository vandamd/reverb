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
  Event.PlaybackQueueEnded,
  Event.PlaybackState,
] satisfies Event[];

export type PlaybackSnapshotEventType = (typeof playbackSnapshotEvents)[number];
export type PlaybackSnapshotEvent =
  EventPayloadByEventWithType[PlaybackSnapshotEventType];
export type PlaybackPositionRate = 0 | 1;

export interface PlaybackSnapshot {
  activeIndex: number;
  activeTrackId: string | null;
  durationMs: number;
  error: string | null;
  playbackState: State | undefined;
  playWhenReady: boolean | undefined;
  positionRate: PlaybackPositionRate;
  progressMs: number;
  queue: LocalTrack[];
  queueRevision: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  sourceQueue: LocalTrack[];
  updatedAtMs: number;
}

export interface StoppedPlaybackSnapshot {
  activeIndex?: number;
  activeTrackId?: string;
  capturedAtMs: number;
  duration: number;
  position: number;
}

type PlaybackSnapshotPatch = Partial<PlaybackSnapshot>;
type PlaybackSnapshotUpdate =
  | PlaybackSnapshotPatch
  | ((snapshot: PlaybackSnapshot) => PlaybackSnapshotPatch);
type PlaybackSnapshotListener = () => void;

interface PublishPlaybackSnapshotOptions {
  observedAtMs?: number;
  persist?: boolean;
  projectBeforeUpdate?: boolean;
}

type PersistedPlaybackAnchor = Pick<
  PlaybackSnapshot,
  | "activeIndex"
  | "activeTrackId"
  | "durationMs"
  | "playbackState"
  | "playWhenReady"
  | "positionRate"
  | "progressMs"
  | "updatedAtMs"
>;

type PersistedPlaybackQueue = Pick<
  PlaybackSnapshot,
  "queue" | "queueRevision" | "repeatMode" | "shuffle" | "sourceQueue"
>;

type PersistedPlaybackSnapshotV1 = Omit<
  PlaybackSnapshot,
  "error" | "positionRate"
>;

const initialPlaybackSnapshot: PlaybackSnapshot = {
  activeIndex: -1,
  activeTrackId: null,
  durationMs: 0,
  error: null,
  playbackState: undefined,
  playWhenReady: undefined,
  positionRate: 0,
  progressMs: 0,
  queue: [],
  queueRevision: 0,
  repeatMode: "off",
  shuffle: false,
  sourceQueue: [],
  updatedAtMs: Date.now(),
};

const playbackSnapshotStorageKeyV1 = "reverb:playbackSnapshot:v1";
const playbackAnchorStorageKey = "reverb:playbackAnchor:v2";
const playbackQueueStorageKey = "reverb:playbackQueue:v2";
const projectedReadStaleAfterMs = 1000;
const duplicateEventWindowMs = 100;

const anchorKeys = new Set<keyof PlaybackSnapshot>([
  "activeIndex",
  "activeTrackId",
  "durationMs",
  "playbackState",
  "playWhenReady",
  "positionRate",
  "progressMs",
]);
const queueKeys = new Set<keyof PlaybackSnapshot>([
  "queue",
  "queueRevision",
  "repeatMode",
  "shuffle",
  "sourceQueue",
]);

export const trackPlayerPlayingStates = new Set<State>([
  State.Buffering,
  State.Loading,
  State.Playing,
  State.Ready,
]);

let playbackSnapshot = initialPlaybackSnapshot;
let suppressActiveTrackEvents = false;
let hydrationPromise: Promise<void> | null = null;
let lastPersistedAnchorJson = "";
let lastPersistedQueueJson = "";
let anchorPersistQueue: Promise<void> = Promise.resolve();
let queuePersistQueue: Promise<void> = Promise.resolve();
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
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRepeatMode = (value: unknown): value is RepeatMode =>
  value === "off" || value === "track" || value === "queue";

const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === "boolean";

const isTrackId = (value: unknown): value is string | null =>
  typeof value === "string" || value === null;

const isPositionRate = (value: unknown): value is PlaybackPositionRate =>
  value === 0 || value === 1;

const getFiniteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toPersistedPlaybackAnchor = (
  snapshot: PlaybackSnapshot
): PersistedPlaybackAnchor => ({
  activeIndex: snapshot.activeIndex,
  activeTrackId: snapshot.activeTrackId,
  durationMs: snapshot.durationMs,
  playbackState: snapshot.playbackState,
  playWhenReady: snapshot.playWhenReady,
  positionRate: snapshot.positionRate,
  progressMs: snapshot.progressMs,
  updatedAtMs: snapshot.updatedAtMs,
});

const toPersistedPlaybackQueue = (
  snapshot: PlaybackSnapshot
): PersistedPlaybackQueue => ({
  queue: snapshot.queue,
  queueRevision: snapshot.queueRevision,
  repeatMode: snapshot.repeatMode,
  shuffle: snapshot.shuffle,
  sourceQueue: snapshot.sourceQueue,
});

const getPersistedPlaybackAnchor = (
  value: unknown
): PersistedPlaybackAnchor | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    activeIndex: getFiniteNumber(
      value.activeIndex,
      initialPlaybackSnapshot.activeIndex
    ),
    activeTrackId: isTrackId(value.activeTrackId) ? value.activeTrackId : null,
    durationMs: getFiniteNumber(
      value.durationMs,
      initialPlaybackSnapshot.durationMs
    ),
    playbackState: value.playbackState as State | undefined,
    playWhenReady: isOptionalBoolean(value.playWhenReady)
      ? value.playWhenReady
      : undefined,
    positionRate: isPositionRate(value.positionRate) ? value.positionRate : 0,
    progressMs: getFiniteNumber(
      value.progressMs,
      initialPlaybackSnapshot.progressMs
    ),
    updatedAtMs: getFiniteNumber(value.updatedAtMs, Date.now()),
  };
};

const getPersistedPlaybackQueue = (
  value: unknown
): PersistedPlaybackQueue | null => {
  if (!(isRecord(value) && Array.isArray(value.queue))) {
    return null;
  }

  return {
    queue: value.queue as LocalTrack[],
    queueRevision: getFiniteNumber(
      value.queueRevision,
      initialPlaybackSnapshot.queueRevision
    ),
    repeatMode: isRepeatMode(value.repeatMode)
      ? value.repeatMode
      : initialPlaybackSnapshot.repeatMode,
    shuffle:
      typeof value.shuffle === "boolean"
        ? value.shuffle
        : initialPlaybackSnapshot.shuffle,
    sourceQueue: Array.isArray(value.sourceQueue)
      ? (value.sourceQueue as LocalTrack[])
      : (value.queue as LocalTrack[]),
  };
};

const getPersistedPlaybackSnapshotV1 = (
  value: unknown
): PersistedPlaybackSnapshotV1 | null => {
  const queue = getPersistedPlaybackQueue(value);
  const anchor = getPersistedPlaybackAnchor(value);
  if (!(queue && anchor)) {
    return null;
  }

  return {
    ...queue,
    ...anchor,
  };
};

const persistPlaybackAnchor = (snapshot: PlaybackSnapshot, force = false) => {
  const anchorJson = JSON.stringify(toPersistedPlaybackAnchor(snapshot));
  if (!force && anchorJson === lastPersistedAnchorJson) {
    return anchorPersistQueue;
  }

  lastPersistedAnchorJson = anchorJson;
  anchorPersistQueue = anchorPersistQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(playbackAnchorStorageKey, anchorJson))
    .catch(() => undefined);

  return anchorPersistQueue;
};

const persistPlaybackQueue = (snapshot: PlaybackSnapshot, force = false) => {
  const queueJson = JSON.stringify(toPersistedPlaybackQueue(snapshot));
  if (!force && queueJson === lastPersistedQueueJson) {
    return queuePersistQueue;
  }

  lastPersistedQueueJson = queueJson;
  queuePersistQueue = queuePersistQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(playbackQueueStorageKey, queueJson))
    .catch(() => undefined);

  return queuePersistQueue;
};

const emitPlaybackSnapshotChange = () => {
  for (const listener of playbackSnapshotListeners) {
    listener();
  }
};

const getChangedKeys = (
  previousSnapshot: PlaybackSnapshot,
  nextSnapshot: PlaybackSnapshot
) =>
  (Object.keys(nextSnapshot) as (keyof PlaybackSnapshot)[]).filter(
    (key) => !Object.is(previousSnapshot[key], nextSnapshot[key])
  );

const commitPlaybackSnapshot = (
  nextSnapshot: PlaybackSnapshot,
  persist: boolean
) => {
  const previousSnapshot = playbackSnapshot;
  const changedKeys = getChangedKeys(previousSnapshot, nextSnapshot);
  if (changedKeys.length === 0) {
    return playbackSnapshot;
  }

  playbackSnapshot = nextSnapshot;
  if (persist) {
    if (changedKeys.some((key) => anchorKeys.has(key))) {
      persistPlaybackAnchor(nextSnapshot);
    }
    if (changedKeys.some((key) => queueKeys.has(key))) {
      persistPlaybackQueue(nextSnapshot);
    }
  }
  emitPlaybackSnapshotChange();
  return playbackSnapshot;
};

const canProjectPlaybackSnapshot = (
  snapshot: PlaybackSnapshot,
  nowMs: number
) =>
  nowMs - snapshot.updatedAtMs >= projectedReadStaleAfterMs &&
  snapshot.positionRate === 1 &&
  getPlaybackSnapshotActiveTrack(snapshot) !== null;

const getProjectedPlaybackSnapshotForRead = () => {
  const nowMs = Date.now();
  if (!canProjectPlaybackSnapshot(playbackSnapshot, nowMs)) {
    return playbackSnapshot;
  }

  return commitPlaybackSnapshot(
    projectPlaybackSnapshot(playbackSnapshot, nowMs),
    false
  );
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

export const publishPlaybackSnapshot = (
  update: PlaybackSnapshotUpdate,
  options: PublishPlaybackSnapshotOptions = {}
) => {
  const observedAtMs = options.observedAtMs ?? Date.now();
  const baseSnapshot =
    options.projectBeforeUpdate === false
      ? playbackSnapshot
      : projectPlaybackSnapshot(playbackSnapshot, observedAtMs);
  const patch = typeof update === "function" ? update(baseSnapshot) : update;
  const proposedSnapshot = { ...baseSnapshot, ...patch };
  const proposedChangedKeys = getChangedKeys(
    baseSnapshot,
    proposedSnapshot
  ).filter((key) => key !== "updatedAtMs");
  const changesPlaybackAnchor = proposedChangedKeys.some(
    (key) => anchorKeys.has(key) || queueKeys.has(key)
  );

  if (proposedChangedKeys.length === 0) {
    return commitPlaybackSnapshot(baseSnapshot, false);
  }

  if (
    patch.queue &&
    patch.queue !== baseSnapshot.queue &&
    patch.queueRevision === undefined
  ) {
    proposedSnapshot.queueRevision = baseSnapshot.queueRevision + 1;
  }

  proposedSnapshot.positionRate =
    proposedSnapshot.playWhenReady === true &&
    proposedSnapshot.playbackState === State.Playing
      ? 1
      : 0;
  proposedSnapshot.updatedAtMs =
    patch.updatedAtMs ??
    (changesPlaybackAnchor ? observedAtMs : baseSnapshot.updatedAtMs);

  return commitPlaybackSnapshot(proposedSnapshot, options.persist !== false);
};

export const publishProjectedPlaybackSnapshot = (nowMs = Date.now()) =>
  commitPlaybackSnapshot(
    projectPlaybackSnapshot(playbackSnapshot, nowMs),
    false
  );

export const flushPlaybackSnapshot = () => {
  const nowMs = Date.now();
  commitPlaybackSnapshot(
    projectPlaybackSnapshot(playbackSnapshot, nowMs),
    false
  );
  return persistPlaybackAnchor(playbackSnapshot, true);
};

const migratePlaybackSnapshotV1 = async (
  snapshot: PersistedPlaybackSnapshotV1
) => {
  const migratedSnapshot: PlaybackSnapshot = {
    ...initialPlaybackSnapshot,
    ...snapshot,
    positionRate:
      snapshot.playWhenReady === true &&
      snapshot.playbackState === State.Playing
        ? 1
        : 0,
  };
  const anchorJson = JSON.stringify(
    toPersistedPlaybackAnchor(migratedSnapshot)
  );
  const queueJson = JSON.stringify(toPersistedPlaybackQueue(migratedSnapshot));

  await AsyncStorage.multiSet([
    [playbackAnchorStorageKey, anchorJson],
    [playbackQueueStorageKey, queueJson],
  ]);
  await AsyncStorage.removeItem(playbackSnapshotStorageKeyV1);
  lastPersistedAnchorJson = anchorJson;
  lastPersistedQueueJson = queueJson;
  return migratedSnapshot;
};

export const hydratePlaybackSnapshot = () => {
  hydrationPromise ??= AsyncStorage.multiGet([
    playbackAnchorStorageKey,
    playbackQueueStorageKey,
    playbackSnapshotStorageKeyV1,
  ])
    .then(async (entries) => {
      const values = new Map(entries);
      const anchorJson = values.get(playbackAnchorStorageKey);
      const queueJson = values.get(playbackQueueStorageKey);
      const snapshotV1Json = values.get(playbackSnapshotStorageKeyV1);
      let anchor = anchorJson
        ? getPersistedPlaybackAnchor(JSON.parse(anchorJson))
        : null;
      let queue = queueJson
        ? getPersistedPlaybackQueue(JSON.parse(queueJson))
        : null;

      if (!(anchor && queue) && snapshotV1Json) {
        const snapshotV1 = getPersistedPlaybackSnapshotV1(
          JSON.parse(snapshotV1Json)
        );
        if (snapshotV1) {
          const migratedSnapshot = await migratePlaybackSnapshotV1(snapshotV1);
          anchor = toPersistedPlaybackAnchor(migratedSnapshot);
          queue = toPersistedPlaybackQueue(migratedSnapshot);
        }
      }

      if (
        !(anchor && queue) ||
        playbackSnapshot.queue.length > 0 ||
        playbackSnapshot.activeTrackId
      ) {
        return;
      }

      const hydratedSnapshot: PlaybackSnapshot = {
        ...playbackSnapshot,
        ...queue,
        ...anchor,
        error: null,
        playbackState:
          anchor.playbackState === State.Ended ? State.Ended : State.Stopped,
        playWhenReady: false,
        positionRate: 0,
      };
      lastPersistedAnchorJson =
        anchorJson ??
        JSON.stringify(toPersistedPlaybackAnchor(hydratedSnapshot));
      lastPersistedQueueJson =
        queueJson ?? JSON.stringify(toPersistedPlaybackQueue(hydratedSnapshot));
      commitPlaybackSnapshot(hydratedSnapshot, false);
    })
    .catch(() => undefined);

  return hydrationPromise;
};

export const restoreStoppedPlaybackSnapshot = (
  stoppedSnapshot: StoppedPlaybackSnapshot
) => {
  if (stoppedSnapshot.capturedAtMs <= playbackSnapshot.updatedAtMs) {
    return playbackSnapshot;
  }

  const trackIndex = stoppedSnapshot.activeTrackId
    ? getTrackIndexById(playbackSnapshot.queue, stoppedSnapshot.activeTrackId)
    : -1;
  const activeIndex =
    trackIndex >= 0
      ? trackIndex
      : Math.min(
          Math.max(
            stoppedSnapshot.activeIndex ?? playbackSnapshot.activeIndex,
            0
          ),
          Math.max(playbackSnapshot.queue.length - 1, 0)
        );
  const activeTrack = playbackSnapshot.queue[activeIndex];
  const durationMs =
    Math.round(stoppedSnapshot.duration * 1000) ||
    activeTrack?.durationMs ||
    playbackSnapshot.durationMs;

  return publishPlaybackSnapshot(
    {
      activeIndex,
      activeTrackId: activeTrack?.id ?? stoppedSnapshot.activeTrackId ?? null,
      durationMs,
      error: null,
      playbackState: State.Stopped,
      playWhenReady: false,
      positionRate: 0,
      progressMs: Math.min(
        Math.max(0, Math.round(stoppedSnapshot.position * 1000)),
        durationMs || Number.POSITIVE_INFINITY
      ),
    },
    {
      observedAtMs: stoppedSnapshot.capturedAtMs,
      projectBeforeUpdate: false,
    }
  );
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
  event: EventPayloadByEventWithType[Event.PlaybackActiveTrackChanged],
  observedAtMs: number
) => {
  if (suppressActiveTrackEvents) {
    return;
  }

  publishPlaybackSnapshot(
    (snapshot) => {
      const eventTrack = getResolvedEventTrack(
        snapshot,
        event.index,
        event.track
      );

      if (
        !(
          eventTrack &&
          shouldUpdateIndexOnTrackChange(
            eventTrack.activeIndex,
            snapshot,
            event.track,
            event.lastIndex,
            event.lastPosition
          )
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
    },
    { observedAtMs }
  );
};

const publishQueueEnded = (
  event: EventPayloadByEventWithType[Event.PlaybackQueueEnded],
  observedAtMs: number
) => {
  publishPlaybackSnapshot(
    (snapshot) => {
      const endedTrack =
        event.track >= 0 && event.track < snapshot.queue.length
          ? snapshot.queue[event.track]
          : null;

      return {
        activeIndex: endedTrack ? event.track : snapshot.activeIndex,
        activeTrackId: endedTrack?.id ?? snapshot.activeTrackId,
        durationMs: endedTrack?.durationMs ?? snapshot.durationMs,
        playbackState: State.Ended,
        playWhenReady: false,
        progressMs: endedTrack?.durationMs ?? snapshot.progressMs,
      };
    },
    { observedAtMs }
  );
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

  const observedAtMs = Date.now();
  if (event.type === Event.PlaybackActiveTrackChanged) {
    publishActiveTrackChanged(event, observedAtMs);
    return;
  }

  if (event.type === Event.PlaybackState) {
    publishPlaybackSnapshot(
      {
        playbackState: event.state,
      },
      { observedAtMs }
    );
    return;
  }

  if (event.type === Event.PlaybackPlayWhenReadyChanged) {
    publishPlaybackSnapshot(
      { playWhenReady: event.playWhenReady },
      { observedAtMs }
    );
    return;
  }

  if (event.type === Event.PlaybackError) {
    publishPlaybackSnapshot({ error: event.message }, { persist: false });
    return;
  }

  if (event.type === Event.PlaybackQueueEnded) {
    publishQueueEnded(event, observedAtMs);
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
