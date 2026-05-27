import TrackPlayer, { Event } from "react-native-track-player";
import {
  playbackSnapshotEvents,
  publishPlaybackSnapshot,
  publishPlaybackSnapshotEventPayload,
} from "@/services/playbackSnapshotStore";

const safely = (action: () => Promise<unknown>) => {
  action().catch(() => {
    // Remote controls should never crash the playback service.
  });
};

const skipAndPlay = async (skip: () => Promise<unknown>) => {
  await skip();
  await TrackPlayer.play();
};

const forwardSnapshotEvents = () => {
  for (const event of playbackSnapshotEvents) {
    TrackPlayer.addEventListener(event, (payload) => {
      publishPlaybackSnapshotEventPayload(event, payload);
    });
  }
};

export const PlaybackService = () => {
  forwardSnapshotEvents();

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    publishPlaybackSnapshot({ playWhenReady: true });
    safely(() => TrackPlayer.play());
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    publishPlaybackSnapshot({ playWhenReady: false });
    safely(() => TrackPlayer.pause());
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    safely(() => skipAndPlay(() => TrackPlayer.skipToNext()));
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    safely(() => skipAndPlay(() => TrackPlayer.skipToPrevious()));
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
