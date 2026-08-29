export type NativePlaybackState =
  | "buffering"
  | "ended"
  | "error"
  | "idle"
  | "paused"
  | "playing"
  | "ready";

export type NativeRepeatMode = "off" | "queue" | "track";

export interface NativePlaybackTrack {
  album: string;
  artist: string;
  artworkUri?: string;
  id: string;
  mimeType?: string;
  title: string;
  uri: string;
}

export interface NativePlaybackSnapshot {
  activeIndex: number;
  activeTrackId: string | null;
  capturedAtMs: number;
  durationMs: number;
  error: string | null;
  playbackState: NativePlaybackState;
  playWhenReady: boolean;
  positionMs: number;
  queueIds: string[];
  repeatMode: NativeRepeatMode;
}

export interface NativeStoppedPlaybackSnapshot {
  activeIndex?: number;
  activeTrackId?: string;
  capturedAtMs: number;
  durationMs: number;
  positionMs: number;
}

export interface SetQueueOptions {
  activeIndex: number;
  playWhenReady: boolean;
  positionMs: number;
  repeatMode: NativeRepeatMode;
}

export interface PlaybackSnapshotChangedEvent {
  snapshot: NativePlaybackSnapshot;
}
