import TrackPlayer, { Event } from "react-native-track-player";
import {
  publishPlaybackSnapshot,
  publishPlaybackSnapshotEventPayload,
} from "@/services/playbackSnapshotStore";

const safely = (action: () => Promise<unknown>) => {
  action().catch(() => {
    // Remote controls should never crash the playback service.
  });
};

export const PlaybackService = () => {
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (payload) => {
    publishPlaybackSnapshotEventPayload(
      Event.PlaybackActiveTrackChanged,
      payload
    );
  });
  TrackPlayer.addEventListener(Event.PlaybackError, (payload) => {
    publishPlaybackSnapshotEventPayload(Event.PlaybackError, payload);
  });
  TrackPlayer.addEventListener(
    Event.PlaybackPlayWhenReadyChanged,
    (payload) => {
      publishPlaybackSnapshotEventPayload(
        Event.PlaybackPlayWhenReadyChanged,
        payload
      );
    }
  );
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (payload) => {
    publishPlaybackSnapshotEventPayload(Event.PlaybackProgressUpdated, payload);
  });
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (payload) => {
    publishPlaybackSnapshotEventPayload(Event.PlaybackQueueEnded, payload);
  });
  TrackPlayer.addEventListener(Event.PlaybackState, (payload) => {
    publishPlaybackSnapshotEventPayload(Event.PlaybackState, payload);
  });

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    publishPlaybackSnapshot({ playWhenReady: true });
    safely(() => TrackPlayer.play());
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    publishPlaybackSnapshot({ playWhenReady: false });
    safely(() => TrackPlayer.pause());
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    safely(() => TrackPlayer.skipToNext());
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    safely(() => TrackPlayer.skipToPrevious());
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    publishPlaybackSnapshot({
      progressMs: Math.max(0, Math.round(position * 1000)),
    });
    safely(() => TrackPlayer.seekTo(position));
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    publishPlaybackSnapshot({ playWhenReady: false, progressMs: 0 });
    safely(() => TrackPlayer.stop());
  });

  return Promise.resolve();
};
