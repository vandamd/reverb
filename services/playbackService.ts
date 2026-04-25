import TrackPlayer, { Event } from "react-native-track-player";

const safely = (action: () => Promise<unknown>) => {
  action().catch(() => {
    // Remote controls should never crash the playback service.
  });
};

export const PlaybackService = () => {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    safely(() => TrackPlayer.play());
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    safely(() => TrackPlayer.pause());
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    safely(() => TrackPlayer.skipToNext());
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    safely(() => TrackPlayer.skipToPrevious());
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    safely(() => TrackPlayer.seekTo(position));
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    safely(() => TrackPlayer.stop());
  });

  return Promise.resolve();
};
