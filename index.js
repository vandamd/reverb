import TrackPlayer from "react-native-track-player";

TrackPlayer.registerPlaybackService(
  () => require("./services/playbackService").PlaybackService
);

require("expo-router/entry");
