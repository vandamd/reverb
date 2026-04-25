import { NativeModule, requireNativeModule } from "expo";
import type {
  AudioPermissionResponse,
  ExistingTrackForScan,
  ScannedTrack,
} from "./ReverbScanner.types";

declare class ReverbScannerModule extends NativeModule {
  getAudioPermissionsAsync(): Promise<AudioPermissionResponse>;
  requestAudioPermissionsAsync(): Promise<AudioPermissionResponse>;
  scanLibrary(existingTracks?: ExistingTrackForScan[]): Promise<ScannedTrack[]>;
}

export default requireNativeModule<ReverbScannerModule>("ReverbScanner");
