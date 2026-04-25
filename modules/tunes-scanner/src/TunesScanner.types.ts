import type { PermissionResponse } from "expo-modules-core";

export interface ScannedTrack {
  album: string;
  albumArtist: string;
  artist: string;
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

export interface CachedTrack {
  uri: string;
}

export type AudioPermissionResponse = PermissionResponse;
