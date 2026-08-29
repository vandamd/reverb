import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  NativePlaybackState,
  NativeStoppedPlaybackSnapshot,
} from "@/modules/reverb-player/src/ReverbPlayer.types";
import { projectPlaybackSnapshot as projectPlaybackSnapshotValue } from "@/services/playbackProjection";
import type { LocalTrack, RepeatMode } from "@/types/music";

export type PlaybackPositionRate = 0 | 1;

export interface PlaybackSnapshot {
  activeIndex: number;
  activeTrackId: string | null;
  durationMs: number;
  error: string | null;
  playbackState: NativePlaybackState;
  playWhenReady: boolean;
  positionRate: PlaybackPositionRate;
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

const initialPlaybackSnapshot: PlaybackSnapshot = {
  activeIndex: -1,
  activeTrackId: null,
  durationMs: 0,
  error: null,
  playbackState: "idle",
  playWhenReady: false,
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
const playbackAnchorStorageKeyV2 = "reverb:playbackAnchor:v2";
const playbackAnchorStorageKey = "reverb:playbackAnchor:v3";
const playbackQueueStorageKey = "reverb:playbackQueue:v2";
const projectedReadStaleAfterMs = 1000;

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

let playbackSnapshot = initialPlaybackSnapshot;
let hydrationPromise: Promise<void> | null = null;
let lastPersistedAnchorJson = "";
let lastPersistedQueueJson = "";
let anchorPersistQueue: Promise<void> = Promise.resolve();
let queuePersistQueue: Promise<void> = Promise.resolve();
const playbackSnapshotListeners = new Set<PlaybackSnapshotListener>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRepeatMode = (value: unknown): value is RepeatMode =>
  value === "off" || value === "track" || value === "queue";

const isPlaybackState = (value: unknown): value is NativePlaybackState =>
  value === "buffering" ||
  value === "ended" ||
  value === "error" ||
  value === "idle" ||
  value === "paused" ||
  value === "playing" ||
  value === "ready";

const getFiniteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

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
  projectPlaybackSnapshotValue(snapshot, nowMs, { endedState: "ended" });

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

  const hasActiveTrack = getFiniteNumber(value.activeIndex, -1) >= 0;
  let playbackState: NativePlaybackState = hasActiveTrack ? "paused" : "idle";
  if (isPlaybackState(value.playbackState)) {
    playbackState = value.playbackState;
  }

  return {
    activeIndex: getFiniteNumber(value.activeIndex, -1),
    activeTrackId:
      typeof value.activeTrackId === "string" ? value.activeTrackId : null,
    durationMs: getFiniteNumber(value.durationMs, 0),
    playbackState,
    playWhenReady: value.playWhenReady === true,
    positionRate:
      value.positionRate === 1 && playbackState === "playing" ? 1 : 0,
    progressMs: getFiniteNumber(value.progressMs, 0),
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
    queueRevision: getFiniteNumber(value.queueRevision, 0),
    repeatMode: isRepeatMode(value.repeatMode) ? value.repeatMode : "off",
    shuffle: value.shuffle === true,
    sourceQueue: Array.isArray(value.sourceQueue)
      ? (value.sourceQueue as LocalTrack[])
      : (value.queue as LocalTrack[]),
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
  const changedKeys = getChangedKeys(playbackSnapshot, nextSnapshot);
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
  for (const listener of playbackSnapshotListeners) {
    listener();
  }
  return playbackSnapshot;
};

export const getPlaybackSnapshot = () => {
  const nowMs = Date.now();
  if (
    nowMs - playbackSnapshot.updatedAtMs >= projectedReadStaleAfterMs &&
    playbackSnapshot.positionRate === 1 &&
    getPlaybackSnapshotActiveTrack(playbackSnapshot)
  ) {
    return commitPlaybackSnapshot(
      projectPlaybackSnapshot(playbackSnapshot, nowMs),
      false
    );
  }
  return playbackSnapshot;
};

export const subscribePlaybackSnapshot = (
  listener: PlaybackSnapshotListener
) => {
  playbackSnapshotListeners.add(listener);
  return () => playbackSnapshotListeners.delete(listener);
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

  if (
    patch.queue &&
    patch.queue !== baseSnapshot.queue &&
    patch.queueRevision === undefined
  ) {
    proposedSnapshot.queueRevision = baseSnapshot.queueRevision + 1;
  }
  proposedSnapshot.positionRate =
    proposedSnapshot.playWhenReady &&
    proposedSnapshot.playbackState === "playing"
      ? 1
      : 0;
  proposedSnapshot.updatedAtMs = patch.updatedAtMs ?? observedAtMs;
  return commitPlaybackSnapshot(proposedSnapshot, options.persist !== false);
};

export const publishProjectedPlaybackSnapshot = (nowMs = Date.now()) =>
  commitPlaybackSnapshot(
    projectPlaybackSnapshot(playbackSnapshot, nowMs),
    false
  );

export const flushPlaybackSnapshot = () => {
  publishProjectedPlaybackSnapshot();
  return persistPlaybackAnchor(playbackSnapshot, true);
};

export const hydratePlaybackSnapshot = () => {
  hydrationPromise ??= AsyncStorage.multiGet([
    playbackAnchorStorageKey,
    playbackAnchorStorageKeyV2,
    playbackQueueStorageKey,
    playbackSnapshotStorageKeyV1,
  ])
    .then(async (entries) => {
      const values = new Map(entries);
      const anchorV3Json = values.get(playbackAnchorStorageKey);
      const anchorV2Json = values.get(playbackAnchorStorageKeyV2);
      const queueJson = values.get(playbackQueueStorageKey);
      const snapshotV1Json = values.get(playbackSnapshotStorageKeyV1);
      const legacySnapshot = snapshotV1Json ? JSON.parse(snapshotV1Json) : null;
      let anchor = getPersistedPlaybackAnchor(legacySnapshot);
      if (anchorV2Json) {
        anchor = getPersistedPlaybackAnchor(JSON.parse(anchorV2Json));
      }
      if (anchorV3Json) {
        anchor = getPersistedPlaybackAnchor(JSON.parse(anchorV3Json));
      }
      const queue = queueJson
        ? getPersistedPlaybackQueue(JSON.parse(queueJson))
        : getPersistedPlaybackQueue(legacySnapshot);

      if (!(anchor && queue)) {
        return;
      }

      const hydratedSnapshot: PlaybackSnapshot = {
        ...initialPlaybackSnapshot,
        ...queue,
        ...anchor,
        error: null,
        playbackState: anchor.playbackState === "ended" ? "ended" : "paused",
        playWhenReady: false,
        positionRate: 0,
      };
      commitPlaybackSnapshot(hydratedSnapshot, false);
      await Promise.all([
        persistPlaybackAnchor(hydratedSnapshot, true),
        persistPlaybackQueue(hydratedSnapshot, true),
      ]);
      await AsyncStorage.multiRemove([
        playbackAnchorStorageKeyV2,
        playbackSnapshotStorageKeyV1,
      ]);
    })
    .catch(() => undefined);
  return hydrationPromise;
};

export const restoreStoppedPlaybackSnapshot = (
  stoppedSnapshot: NativeStoppedPlaybackSnapshot
) => {
  const trackIndex = stoppedSnapshot.activeTrackId
    ? getTrackIndexById(playbackSnapshot.queue, stoppedSnapshot.activeTrackId)
    : -1;
  const stoppedTrackBelongsToCurrentQueue =
    playbackSnapshot.queue.length === 0 ||
    trackIndex >= 0 ||
    (stoppedSnapshot.activeTrackId === undefined &&
      stoppedSnapshot.activeIndex !== undefined &&
      stoppedSnapshot.activeIndex >= 0 &&
      stoppedSnapshot.activeIndex < playbackSnapshot.queue.length);
  if (
    stoppedSnapshot.capturedAtMs <= playbackSnapshot.updatedAtMs &&
    !(
      (playbackSnapshot.playbackState === "idle" ||
        playbackSnapshot.playbackState === "paused") &&
      stoppedTrackBelongsToCurrentQueue
    )
  ) {
    return playbackSnapshot;
  }

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
    stoppedSnapshot.durationMs ||
    activeTrack?.durationMs ||
    playbackSnapshot.durationMs;

  return publishPlaybackSnapshot(
    {
      activeIndex,
      activeTrackId: activeTrack?.id ?? stoppedSnapshot.activeTrackId ?? null,
      durationMs,
      error: null,
      playbackState: "paused",
      playWhenReady: false,
      progressMs: Math.min(
        Math.max(0, stoppedSnapshot.positionMs),
        durationMs || Number.POSITIVE_INFINITY
      ),
    },
    {
      observedAtMs: Math.max(
        stoppedSnapshot.capturedAtMs,
        playbackSnapshot.updatedAtMs
      ),
      projectBeforeUpdate: false,
    }
  );
};
