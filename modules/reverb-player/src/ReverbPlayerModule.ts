import { NativeModule, requireNativeModule } from "expo";
import type {
  NativePlaybackSnapshot,
  NativePlaybackTrack,
  NativeRepeatMode,
  NativeStoppedPlaybackSnapshot,
  PlaybackSnapshotChangedEvent,
  SetQueueOptions,
} from "./ReverbPlayer.types";

declare class ReverbPlayerModule extends NativeModule<{
  onPlaybackSnapshotChanged(event: PlaybackSnapshotChangedEvent): void;
}> {
  connect(): Promise<NativePlaybackSnapshot>;
  getLastStoppedSnapshot(): Promise<NativeStoppedPlaybackSnapshot | null>;
  getSnapshot(): Promise<NativePlaybackSnapshot>;
  pause(): Promise<NativePlaybackSnapshot>;
  play(): Promise<NativePlaybackSnapshot>;
  replaceQueueOrder(
    tracks: NativePlaybackTrack[]
  ): Promise<NativePlaybackSnapshot>;
  seekTo(positionMs: number): Promise<NativePlaybackSnapshot>;
  setQueue(
    tracks: NativePlaybackTrack[],
    options: SetQueueOptions
  ): Promise<NativePlaybackSnapshot>;
  setRepeatMode(repeatMode: NativeRepeatMode): Promise<NativePlaybackSnapshot>;
  skipNext(): Promise<NativePlaybackSnapshot>;
  skipPrevious(): Promise<NativePlaybackSnapshot>;
  stop(): Promise<NativePlaybackSnapshot>;
}

export default requireNativeModule<ReverbPlayerModule>("ReverbPlayer");
