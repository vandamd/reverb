import type { LocalTrack, RepeatMode } from "@/types/music";

export interface ProjectablePlaybackSnapshot<TPlaybackState> {
  activeIndex: number;
  activeTrackId: string | null;
  durationMs: number;
  playbackState: TPlaybackState | undefined;
  playWhenReady: boolean | undefined;
  positionRate: 0 | 1;
  progressMs: number;
  queue: LocalTrack[];
  repeatMode: RepeatMode;
  updatedAtMs: number;
}

interface PlaybackProjectionOptions<TPlaybackState> {
  endedState: TPlaybackState;
}

const getTrackIndexById = (queue: LocalTrack[], trackId: string | null) =>
  trackId ? queue.findIndex((track) => track.id === trackId) : -1;

const getPlaybackSnapshotTrackIndex = <TPlaybackState>(
  snapshot: ProjectablePlaybackSnapshot<TPlaybackState>
) => {
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

const getProjectionDurations = <TPlaybackState>(
  snapshot: ProjectablePlaybackSnapshot<TPlaybackState>,
  activeIndex: number
) =>
  snapshot.queue.map((track, index) =>
    Math.max(
      0,
      index === activeIndex
        ? snapshot.durationMs || track.durationMs
        : track.durationMs
    )
  );

const getProjectedOffset = (durationsMs: number[], activeIndex: number) =>
  durationsMs
    .slice(0, activeIndex)
    .reduce((totalMs, durationMs) => totalMs + durationMs, 0);

const getProjectedTrackFromOffset = <TPlaybackState>(
  snapshot: ProjectablePlaybackSnapshot<TPlaybackState>,
  durationsMs: number[],
  offsetMs: number
) => {
  let elapsedMs = Math.max(0, offsetMs);

  for (let index = 0; index < snapshot.queue.length; index += 1) {
    const durationMs = durationsMs[index] ?? 0;
    const isLastTrack = index === snapshot.queue.length - 1;

    if (elapsedMs < durationMs || isLastTrack) {
      const track = snapshot.queue[index];
      return {
        activeIndex: index,
        activeTrackId: track?.id ?? null,
        durationMs,
        progressMs: durationMs > 0 ? Math.min(elapsedMs, durationMs) : 0,
      };
    }

    elapsedMs -= durationMs;
  }

  return null;
};

export const projectPlaybackSnapshot = <
  TPlaybackState,
  TSnapshot extends ProjectablePlaybackSnapshot<TPlaybackState>,
>(
  snapshot: TSnapshot,
  nowMs: number,
  options: PlaybackProjectionOptions<TPlaybackState>
): TSnapshot => {
  const elapsedMs = nowMs - snapshot.updatedAtMs;
  const activeIndex = getPlaybackSnapshotTrackIndex(snapshot);
  const activeTrack = snapshot.queue[activeIndex];

  if (elapsedMs <= 0 || snapshot.positionRate !== 1 || !activeTrack) {
    return { ...snapshot, updatedAtMs: nowMs };
  }

  const currentDurationMs = Math.max(
    0,
    snapshot.durationMs || activeTrack.durationMs
  );
  const nextProgressMs = Math.max(0, snapshot.progressMs + elapsedMs);

  if (snapshot.repeatMode === "track") {
    return {
      ...snapshot,
      activeIndex,
      activeTrackId: activeTrack.id,
      durationMs: currentDurationMs,
      progressMs:
        currentDurationMs > 0
          ? nextProgressMs % currentDurationMs
          : nextProgressMs,
      updatedAtMs: nowMs,
    };
  }

  const durationsMs = getProjectionDurations(snapshot, activeIndex);
  const totalDurationMs = durationsMs.reduce(
    (totalMs, durationMs) => totalMs + durationMs,
    0
  );

  if (totalDurationMs <= 0) {
    return {
      ...snapshot,
      activeIndex,
      activeTrackId: activeTrack.id,
      progressMs: nextProgressMs,
      updatedAtMs: nowMs,
    };
  }

  const queueOffsetMs =
    getProjectedOffset(durationsMs, activeIndex) + nextProgressMs;
  const projectedTrack =
    snapshot.repeatMode === "queue"
      ? getProjectedTrackFromOffset(
          snapshot,
          durationsMs,
          queueOffsetMs % totalDurationMs
        )
      : getProjectedTrackFromOffset(snapshot, durationsMs, queueOffsetMs);

  if (!projectedTrack) {
    return { ...snapshot, updatedAtMs: nowMs };
  }

  const reachedQueueEnd =
    snapshot.repeatMode !== "queue" && queueOffsetMs >= totalDurationMs;

  return {
    ...snapshot,
    ...projectedTrack,
    playbackState: reachedQueueEnd
      ? options.endedState
      : snapshot.playbackState,
    playWhenReady: reachedQueueEnd ? false : snapshot.playWhenReady,
    updatedAtMs: nowMs,
  };
};
