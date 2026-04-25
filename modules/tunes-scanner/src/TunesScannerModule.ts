import { NativeModule, requireNativeModule } from "expo";
import type {
  AudioPermissionResponse,
  CachedTrack,
  ScannedTrack,
} from "./TunesScanner.types";

declare class TunesScannerModule extends NativeModule {
  copyTrackToCache(contentUri: string, fileName: string): Promise<CachedTrack>;
  getAudioPermissionsAsync(): Promise<AudioPermissionResponse>;
  requestAudioPermissionsAsync(): Promise<AudioPermissionResponse>;
  scanLibrary(): Promise<ScannedTrack[]>;
}

export default requireNativeModule<TunesScannerModule>("TunesScanner");
