import {
  Event,
  type EventPayloadByEvent,
  type EventPayloadByEventWithType,
  State,
  type Track,
} from "react-native-track-player";
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
};

export const trackPlayerPlayingStates = new Set<State>([
  State.Buffering,
  State.Loading,
  State.Playing,
  State.Ready,
]);

let playbackSnapshot = initialPlaybackSnapshot;
let suppressActiveTrackEvents = false;
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

const hasSnapshotChanged = (nextSnapshot: PlaybackSnapshot) =>
  Object.keys(nextSnapshot).some((key) => {
    const snapshotKey = key as keyof PlaybackSnapshot;
    return !Object.is(nextSnapshot[snapshotKey], playbackSnapshot[snapshotKey]);
  });

const emitPlaybackSnapshotChange = () => {
  for (const listener of playbackSnapshotListeners) {
    listener();
  }
};

export const getPlaybackSnapshot = () => playbackSnapshot;

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
  const nextSnapshot = { ...playbackSnapshot, ...patch };

  if (
    patch.queue &&
    patch.queue !== playbackSnapshot.queue &&
    patch.queueRevision === undefined
  ) {
    nextSnapshot.queueRevision = playbackSnapshot.queueRevision + 1;
  }

  if (!hasSnapshotChanged(nextSnapshot)) {
    return playbackSnapshot;
  }

  playbackSnapshot = nextSnapshot;
  emitPlaybackSnapshotChange();
  return playbackSnapshot;
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

export const publishPlaybackSnapshotEvent = (event: PlaybackSnapshotEvent) => {
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

export const publishPlaybackSnapshotEventPayload = <
  T extends PlaybackSnapshotEventType,
>(
  type: T,
  payload: EventPayloadByEvent[T]
) => {
  publishPlaybackSnapshotEvent({
    ...payload,
    type,
  } as PlaybackSnapshotEvent);
};
