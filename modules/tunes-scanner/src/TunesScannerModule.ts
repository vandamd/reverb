import { NativeModule, requireNativeModule } from "expo";
import type {
  AudioPermissionResponse,
  ExistingTrackForScan,
  ScannedTrack,
} from "./TunesScanner.types";

declare class TunesScannerModule extends NativeModule {
  getAudioPermissionsAsync(): Promise<AudioPermissionResponse>;
  requestAudioPermissionsAsync(): Promise<AudioPermissionResponse>;
  scanLibrary(existingTracks?: ExistingTrackForScan[]): Promise<ScannedTrack[]>;
}

export default requireNativeModule<TunesScannerModule>("TunesScanner");
