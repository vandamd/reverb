import type { PermissionResponse } from "expo-modules-core";

export interface ScannedTrack {
  album: string;
  albumArtist: string;
  artist: string;
  artworkCacheKey?: string | null;
  artworkUri?: string | null;
  contentUri: string;
  discNumber: number | null;
  durationMs: number;
  fileName: string;
  id: string;
  mimeType: string | null;
  modifiedAtMs: number;
  relativePath: string;
  sizeBytes: number;
  title: string;
  trackNumber: number | null;
  year: number | null;
}

export interface ExistingTrackForScan {
  album: string;
  albumArtist: string;
  artist: string;
  artworkCacheKey?: string | null;
  artworkUri?: string | null;
  discNumber: number | null;
  durationMs: number;
  fileName: string;
  id: string;
  mimeType: string | null;
  modifiedAtMs: number;
  sizeBytes: number;
  title: string;
  trackNumber: number | null;
  year: number | null;
}

export type AudioPermissionResponse = PermissionResponse;
