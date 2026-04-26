import { Effect } from "effect";
import ReverbScanner from "@/modules/reverb-scanner/src/ReverbScannerModule";
import {
  getPlaylists,
  getTracks,
  initialiseCatalogueStore,
  replaceScannedTracks,
} from "@/services/catalogueStore";

class LibraryEffectError extends Error {
  readonly _tag = "LibraryEffectError";
  override readonly cause: unknown;

  constructor(cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    super(error.message);
    this.cause = cause;
  }
}

const tryLibraryPromise = <A>(promise: () => Promise<A>) =>
  Effect.tryPromise({
    try: promise,
    catch: (error) => new LibraryEffectError(error),
  });

const getCatalogueEffect = Effect.all({
  playlists: tryLibraryPromise(getPlaylists),
  tracks: tryLibraryPromise(getTracks),
});

export const loadCatalogueEffect = Effect.gen(function* () {
  yield* tryLibraryPromise(initialiseCatalogueStore);
  return yield* getCatalogueEffect;
});

export const refreshCatalogueEffect = Effect.gen(function* () {
  yield* tryLibraryPromise(initialiseCatalogueStore);
  const permission = yield* tryLibraryPromise(() =>
    ReverbScanner.requestAudioPermissionsAsync()
  );

  if (!permission.granted) {
    const catalogue = yield* getCatalogueEffect;
    return {
      ...catalogue,
      permission,
      scannedCount: 0,
    };
  }

  const existingTracks = yield* tryLibraryPromise(getTracks);
  const scannedTracks = yield* tryLibraryPromise(() =>
    ReverbScanner.scanLibrary(existingTracks)
  );
  const [tracks, playlists] = yield* Effect.all([
    tryLibraryPromise(() => replaceScannedTracks(scannedTracks)),
    tryLibraryPromise(getPlaylists),
  ]);

  return {
    tracks,
    playlists,
    permission,
    scannedCount: scannedTracks.length,
  };
});

export const runLibraryEffect = <A>(
  effect: Effect.Effect<A, LibraryEffectError>
) => Effect.runPromise(effect);
