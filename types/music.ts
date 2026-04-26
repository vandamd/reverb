export type { ScannedTrack } from "@/modules/reverb-scanner/src/ReverbScanner.types";

export interface LocalTrack {
  album: string;
  albumArtist: string;
  artist: string;
  artworkCacheKey: string | null;
  artworkUri: string | null;
  discNumber: number | null;
  durationMs: number;
  fileName: string;
  folderPath: string;
  id: string;
  liked: boolean;
  mimeType: string | null;
  modifiedAtMs: number;
  sizeBytes: number;
  title: string;
  trackNumber: number | null;
  uri: string;
  year: number | null;
}

export interface LocalAlbum {
  artist: string;
  artworkUri: string | null;
  durationMs: number;
  id: string;
  title: string;
  trackCount: number;
  tracks: LocalTrack[];
}

export interface LocalPlaylist {
  coverUri: string | null;
  createdAt: number;
  id: string;
  name: string;
  trackIds: string[];
  updatedAt: number;
}

export type RepeatMode = "off" | "track" | "queue";
