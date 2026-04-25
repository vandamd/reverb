import { Effect } from "effect";
import ReverbScanner from "@/modules/reverb-scanner/src/ReverbScannerModule";
import {
  getPlaylists,
  getTracks,
  initialiseCatalogueStore,
  replaceScannedTracks,
} from "@/services/catalogueStore";

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

export const loadCatalogueEffect = Effect.tryPromise({
  try: async () => {
    await initialiseCatalogueStore();
    const [tracks, playlists] = await Promise.all([
      getTracks(),
      getPlaylists(),
    ]);
    return { tracks, playlists };
  },
  catch: asError,
});

export const refreshCatalogueEffect = Effect.tryPromise({
  try: async () => {
    await initialiseCatalogueStore();
    const permission = await ReverbScanner.requestAudioPermissionsAsync();
    if (!permission.granted) {
      const [tracks, playlists] = await Promise.all([
        getTracks(),
        getPlaylists(),
      ]);
      return {
        tracks,
        playlists,
        permission,
        scannedCount: 0,
      };
    }

    const existingTracks = await getTracks();
    const scannedTracks = await ReverbScanner.scanLibrary(existingTracks);
    const [tracks, playlists] = await Promise.all([
      replaceScannedTracks(scannedTracks),
      getPlaylists(),
    ]);
    return {
      tracks,
      playlists,
      permission,
      scannedCount: scannedTracks.length,
    };
  },
  catch: asError,
});

export const runLibraryEffect = <A>(effect: Effect.Effect<A, Error>) =>
  Effect.runPromise(effect);
