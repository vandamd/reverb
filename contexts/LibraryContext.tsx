import type { PermissionStatus } from "expo-modules-core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addTrackToPlaylist as addTrackToPlaylistStore,
  createPlaylist as createPlaylistStore,
  deletePlaylist as deletePlaylistStore,
  movePlaylistTrack as movePlaylistTrackStore,
  removeTrackFromPlaylist as removeTrackFromPlaylistStore,
  renamePlaylist as renamePlaylistStore,
  setPlaylistCover as setPlaylistCoverStore,
  setTrackLiked as setTrackLikedStore,
} from "@/services/catalogueStore";
import {
  loadCatalogueEffect,
  refreshCatalogueEffect,
  runLibraryEffect,
} from "@/services/libraryEffects";
import {
  buildAlbums,
  buildTrackSearchIndex,
  getPlaylistTracks,
  searchTracks,
} from "@/services/librarySelectors";
import type { LocalAlbum, LocalPlaylist, LocalTrack } from "@/types/music";

interface LibraryContextValue {
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  albums: LocalAlbum[];
  createPlaylist: (name: string, coverUri?: string | null) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  error: string | null;
  getPlaylistTracks: (playlist: LocalPlaylist | undefined) => LocalTrack[];
  isLoading: boolean;
  isScanning: boolean;
  likedTracks: LocalTrack[];
  movePlaylistTrack: (
    playlistId: string,
    trackId: string,
    direction: "down" | "up"
  ) => Promise<void>;
  permissionStatus: PermissionStatus | "unknown";
  playlists: LocalPlaylist[];
  refreshLibrary: () => Promise<void>;
  removeTrackFromPlaylist: (
    playlistId: string,
    trackId: string
  ) => Promise<void>;
  renamePlaylist: (playlistId: string, name: string) => Promise<void>;
  searchTracks: (query: string) => LocalTrack[];
  setPlaylistCover: (
    playlistId: string,
    coverUri: string | null
  ) => Promise<void>;
  setTrackLiked: (trackId: string, liked: boolean) => Promise<void>;
  trackById: Map<string, LocalTrack>;
  tracks: LocalTrack[];
}

const LibraryContext = createContext<LibraryContextValue | undefined>(
  undefined
);
const LibraryStateContext = createContext<
  | Pick<
      LibraryContextValue,
      | "albums"
      | "error"
      | "getPlaylistTracks"
      | "isLoading"
      | "isScanning"
      | "likedTracks"
      | "permissionStatus"
      | "playlists"
      | "searchTracks"
      | "trackById"
      | "tracks"
    >
  | undefined
>(undefined);
const LibraryAlbumsContext = createContext<
  Pick<LibraryContextValue, "albums" | "isLoading" | "isScanning"> | undefined
>(undefined);
const LibraryPlaylistsContext = createContext<
  Pick<LibraryContextValue, "getPlaylistTracks" | "playlists"> | undefined
>(undefined);
const LibraryTracksContext = createContext<
  | Pick<
      LibraryContextValue,
      "likedTracks" | "searchTracks" | "trackById" | "tracks"
    >
  | undefined
>(undefined);
const LibraryStatusContext = createContext<
  | Pick<
      LibraryContextValue,
      "error" | "isLoading" | "isScanning" | "permissionStatus"
    >
  | undefined
>(undefined);
const LibraryActionsContext = createContext<
  | Pick<
      LibraryContextValue,
      | "addTrackToPlaylist"
      | "createPlaylist"
      | "deletePlaylist"
      | "movePlaylistTrack"
      | "refreshLibrary"
      | "removeTrackFromPlaylist"
      | "renamePlaylist"
      | "setPlaylistCover"
      | "setTrackLiked"
    >
  | undefined
>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    PermissionStatus | "unknown"
  >("unknown");

  const albums = useMemo(() => buildAlbums(tracks), [tracks]);
  const trackById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks]
  );
  const searchIndex = useMemo(() => buildTrackSearchIndex(tracks), [tracks]);
  const likedTracks = useMemo(
    () => tracks.filter((track) => track.liked),
    [tracks]
  );

  const refreshLibrary = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    try {
      const result = await runLibraryEffect(refreshCatalogueEffect);
      setTracks(result.tracks);
      setPlaylists(result.playlists);
      setPermissionStatus(result.permission.status);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError)
      );
    } finally {
      setIsScanning(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    runLibraryEffect(loadCatalogueEffect)
      .then((result) => {
        if (!isMounted) {
          return;
        }
        setTracks(result.tracks);
        setPlaylists(result.playlists);
        setIsLoading(false);
        if (result.tracks.length === 0) {
          refreshLibrary().catch((refreshError) => {
            setError(
              refreshError instanceof Error
                ? refreshError.message
                : String(refreshError)
            );
          });
        }
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(
          loadError instanceof Error ? loadError.message : String(loadError)
        );
        setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [refreshLibrary]);

  const setTrackLiked = useCallback(async (trackId: string, liked: boolean) => {
    await setTrackLikedStore(trackId, liked);
    setTracks((currentTracks) =>
      currentTracks.map((track) =>
        track.id === trackId ? { ...track, liked } : track
      )
    );
  }, []);

  const createPlaylist = useCallback(
    async (name: string, coverUri?: string | null) => {
      setPlaylists(await createPlaylistStore(name, coverUri ?? null));
    },
    []
  );

  const renamePlaylist = useCallback(
    async (playlistId: string, name: string) => {
      setPlaylists(await renamePlaylistStore(playlistId, name));
    },
    []
  );

  const deletePlaylist = useCallback(async (playlistId: string) => {
    setPlaylists(await deletePlaylistStore(playlistId));
  }, []);

  const addTrackToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      setPlaylists(await addTrackToPlaylistStore(playlistId, trackId));
    },
    []
  );

  const removeTrackFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      setPlaylists(await removeTrackFromPlaylistStore(playlistId, trackId));
    },
    []
  );

  const movePlaylistTrack = useCallback(
    async (playlistId: string, trackId: string, direction: "down" | "up") => {
      setPlaylists(
        await movePlaylistTrackStore(playlistId, trackId, direction)
      );
    },
    []
  );

  const setPlaylistCover = useCallback(
    async (playlistId: string, coverUri: string | null) => {
      setPlaylists(await setPlaylistCoverStore(playlistId, coverUri));
    },
    []
  );

  const actions = useMemo(
    () => ({
      addTrackToPlaylist,
      createPlaylist,
      deletePlaylist,
      movePlaylistTrack,
      refreshLibrary,
      removeTrackFromPlaylist,
      renamePlaylist,
      setPlaylistCover,
      setTrackLiked,
    }),
    [
      addTrackToPlaylist,
      createPlaylist,
      deletePlaylist,
      movePlaylistTrack,
      refreshLibrary,
      removeTrackFromPlaylist,
      renamePlaylist,
      setPlaylistCover,
      setTrackLiked,
    ]
  );

  const state = useMemo(
    () => ({
      albums,
      error,
      getPlaylistTracks: (playlist: LocalPlaylist | undefined) =>
        getPlaylistTracks(playlist, tracks, trackById),
      isLoading,
      isScanning,
      likedTracks,
      permissionStatus,
      playlists,
      searchTracks: (query: string) => searchTracks(searchIndex, query),
      trackById,
      tracks,
    }),
    [
      albums,
      error,
      isLoading,
      isScanning,
      likedTracks,
      permissionStatus,
      playlists,
      searchIndex,
      trackById,
      tracks,
    ]
  );
  const albumState = useMemo(
    () => ({
      albums,
      isLoading,
      isScanning,
    }),
    [albums, isLoading, isScanning]
  );
  const playlistState = useMemo(
    () => ({
      getPlaylistTracks: (playlist: LocalPlaylist | undefined) =>
        getPlaylistTracks(playlist, tracks, trackById),
      playlists,
    }),
    [playlists, trackById, tracks]
  );
  const trackState = useMemo(
    () => ({
      likedTracks,
      searchTracks: (query: string) => searchTracks(searchIndex, query),
      trackById,
      tracks,
    }),
    [likedTracks, searchIndex, trackById, tracks]
  );
  const statusState = useMemo(
    () => ({
      error,
      isLoading,
      isScanning,
      permissionStatus,
    }),
    [error, isLoading, isScanning, permissionStatus]
  );

  const value = useMemo(
    () => ({
      ...state,
      ...actions,
    }),
    [actions, state]
  );

  return (
    <LibraryActionsContext.Provider value={actions}>
      <LibraryStatusContext.Provider value={statusState}>
        <LibraryTracksContext.Provider value={trackState}>
          <LibraryPlaylistsContext.Provider value={playlistState}>
            <LibraryAlbumsContext.Provider value={albumState}>
              <LibraryStateContext.Provider value={state}>
                <LibraryContext.Provider value={value}>
                  {children}
                </LibraryContext.Provider>
              </LibraryStateContext.Provider>
            </LibraryAlbumsContext.Provider>
          </LibraryPlaylistsContext.Provider>
        </LibraryTracksContext.Provider>
      </LibraryStatusContext.Provider>
    </LibraryActionsContext.Provider>
  );
}

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error("useLibrary must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryState = () => {
  const context = useContext(LibraryStateContext);
  if (!context) {
    throw new Error("useLibraryState must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryActions = () => {
  const context = useContext(LibraryActionsContext);
  if (!context) {
    throw new Error("useLibraryActions must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryAlbums = () => {
  const context = useContext(LibraryAlbumsContext);
  if (!context) {
    throw new Error("useLibraryAlbums must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryPlaylists = () => {
  const context = useContext(LibraryPlaylistsContext);
  if (!context) {
    throw new Error("useLibraryPlaylists must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryTracks = () => {
  const context = useContext(LibraryTracksContext);
  if (!context) {
    throw new Error("useLibraryTracks must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryStatus = () => {
  const context = useContext(LibraryStatusContext);
  if (!context) {
    throw new Error("useLibraryStatus must be used within LibraryProvider");
  }
  return context;
};
