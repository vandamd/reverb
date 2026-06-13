import type { PermissionStatus } from "expo-modules-core";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
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

interface LibraryLikesContextValue {
  likedTrackIds: ReadonlySet<string>;
  likedTracks: LocalTrack[];
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
  Pick<LibraryContextValue, "searchTracks" | "trackById" | "tracks"> | undefined
>(undefined);
const LibraryLikesContext = createContext<LibraryLikesContextValue | undefined>(
  undefined
);
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

interface LibraryState {
  error: string | null;
  isLoading: boolean;
  isScanning: boolean;
  likedTrackIds: ReadonlySet<string>;
  permissionStatus: PermissionStatus | "unknown";
  playlists: LocalPlaylist[];
  tracks: LocalTrack[];
}

type LibraryAction =
  | {
      payload: {
        playlists: LocalPlaylist[];
        tracks: LocalTrack[];
      };
      type: "catalogueLoaded";
    }
  | { payload: string; type: "failed" }
  | { payload: PermissionStatus; type: "permissionChanged" }
  | { payload: LocalPlaylist[]; type: "playlistsChanged" }
  | { payload: boolean; type: "scanningChanged" }
  | { payload: { liked: boolean; trackId: string }; type: "trackLikedChanged" };

const getLikedTrackIds = (tracks: LocalTrack[]) =>
  new Set(tracks.flatMap((track) => (track.liked ? [track.id] : [])));

const initialLibraryState: LibraryState = {
  error: null,
  isLoading: true,
  isScanning: false,
  likedTrackIds: new Set(),
  permissionStatus: "unknown",
  playlists: [],
  tracks: [],
};

const libraryReducer = (
  state: LibraryState,
  action: LibraryAction
): LibraryState => {
  switch (action.type) {
    case "catalogueLoaded":
      return {
        ...state,
        error: null,
        isLoading: false,
        likedTrackIds: getLikedTrackIds(action.payload.tracks),
        playlists: action.payload.playlists,
        tracks: action.payload.tracks,
      };
    case "failed":
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };
    case "permissionChanged":
      return {
        ...state,
        permissionStatus: action.payload,
      };
    case "playlistsChanged":
      return {
        ...state,
        playlists: action.payload,
      };
    case "scanningChanged":
      return {
        ...state,
        error: action.payload ? null : state.error,
        isLoading: action.payload ? state.isLoading : false,
        isScanning: action.payload,
      };
    case "trackLikedChanged": {
      const nextIds = new Set(state.likedTrackIds);
      if (action.payload.liked) {
        nextIds.add(action.payload.trackId);
      } else {
        nextIds.delete(action.payload.trackId);
      }
      return {
        ...state,
        likedTrackIds: nextIds,
      };
    }
    default:
      return state;
  }
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [
    {
      error,
      isLoading,
      isScanning,
      likedTrackIds,
      permissionStatus,
      playlists,
      tracks,
    },
    dispatch,
  ] = useReducer(libraryReducer, initialLibraryState);

  const albums = useMemo(() => buildAlbums(tracks), [tracks]);
  const trackById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks]
  );
  const searchIndex = useMemo(() => buildTrackSearchIndex(tracks), [tracks]);
  const likedTracks = useMemo(() => {
    const nextLikedTracks: LocalTrack[] = [];
    for (const track of tracks) {
      if (likedTrackIds.has(track.id)) {
        nextLikedTracks.push(track.liked ? track : { ...track, liked: true });
      }
    }
    return nextLikedTracks;
  }, [likedTrackIds, tracks]);

  const refreshLibrary = useCallback(async () => {
    dispatch({ payload: true, type: "scanningChanged" });
    try {
      const result = await runLibraryEffect(refreshCatalogueEffect);
      dispatch({ payload: result, type: "catalogueLoaded" });
      dispatch({
        payload: result.permission.status,
        type: "permissionChanged",
      });
    } catch (refreshError) {
      dispatch({ payload: getErrorMessage(refreshError), type: "failed" });
    } finally {
      dispatch({ payload: false, type: "scanningChanged" });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    runLibraryEffect(loadCatalogueEffect)
      .then((result) => {
        if (!isMounted) {
          return;
        }
        dispatch({ payload: result, type: "catalogueLoaded" });
        if (result.tracks.length === 0) {
          refreshLibrary().catch((refreshError) => {
            dispatch({
              payload: getErrorMessage(refreshError),
              type: "failed",
            });
          });
        }
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        dispatch({ payload: getErrorMessage(loadError), type: "failed" });
      });
    return () => {
      isMounted = false;
    };
  }, [refreshLibrary]);

  const setTrackLiked = useCallback(async (trackId: string, liked: boolean) => {
    dispatch({ payload: { liked, trackId }, type: "trackLikedChanged" });

    try {
      await setTrackLikedStore(trackId, liked);
    } catch (likeError) {
      dispatch({
        payload: { liked: !liked, trackId },
        type: "trackLikedChanged",
      });
      throw likeError;
    }
  }, []);

  const createPlaylist = useCallback(
    async (name: string, coverUri?: string | null) => {
      dispatch({
        payload: await createPlaylistStore(name, coverUri ?? null),
        type: "playlistsChanged",
      });
    },
    []
  );

  const renamePlaylist = useCallback(
    async (playlistId: string, name: string) => {
      dispatch({
        payload: await renamePlaylistStore(playlistId, name),
        type: "playlistsChanged",
      });
    },
    []
  );

  const deletePlaylist = useCallback(async (playlistId: string) => {
    dispatch({
      payload: await deletePlaylistStore(playlistId),
      type: "playlistsChanged",
    });
  }, []);

  const addTrackToPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      dispatch({
        payload: await addTrackToPlaylistStore(playlistId, trackId),
        type: "playlistsChanged",
      });
    },
    []
  );

  const removeTrackFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      dispatch({
        payload: await removeTrackFromPlaylistStore(playlistId, trackId),
        type: "playlistsChanged",
      });
    },
    []
  );

  const movePlaylistTrack = useCallback(
    async (playlistId: string, trackId: string, direction: "down" | "up") => {
      dispatch({
        payload: await movePlaylistTrackStore(playlistId, trackId, direction),
        type: "playlistsChanged",
      });
    },
    []
  );

  const setPlaylistCover = useCallback(
    async (playlistId: string, coverUri: string | null) => {
      dispatch({
        payload: await setPlaylistCoverStore(playlistId, coverUri),
        type: "playlistsChanged",
      });
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
      searchTracks: (query: string) => searchTracks(searchIndex, query),
      trackById,
      tracks,
    }),
    [searchIndex, trackById, tracks]
  );
  const likesState = useMemo(
    () => ({
      likedTrackIds,
      likedTracks,
    }),
    [likedTrackIds, likedTracks]
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
        <LibraryLikesContext.Provider value={likesState}>
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
        </LibraryLikesContext.Provider>
      </LibraryStatusContext.Provider>
    </LibraryActionsContext.Provider>
  );
}

export const useLibraryActions = () => {
  const context = use(LibraryActionsContext);
  if (!context) {
    throw new Error("useLibraryActions must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryAlbums = () => {
  const context = use(LibraryAlbumsContext);
  if (!context) {
    throw new Error("useLibraryAlbums must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryPlaylists = () => {
  const context = use(LibraryPlaylistsContext);
  if (!context) {
    throw new Error("useLibraryPlaylists must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryTracks = () => {
  const context = use(LibraryTracksContext);
  if (!context) {
    throw new Error("useLibraryTracks must be used within LibraryProvider");
  }
  return context;
};

export const useLibraryLikedTracks = () => {
  const context = use(LibraryLikesContext);
  if (!context) {
    throw new Error(
      "useLibraryLikedTracks must be used within LibraryProvider"
    );
  }
  return context.likedTracks;
};

export const useTrackLiked = (
  trackId: string | undefined,
  fallback = false
) => {
  const context = use(LibraryLikesContext);
  if (!context) {
    throw new Error("useTrackLiked must be used within LibraryProvider");
  }
  return trackId ? context.likedTrackIds.has(trackId) : fallback;
};

export const useLibraryStatus = () => {
  const context = use(LibraryStatusContext);
  if (!context) {
    throw new Error("useLibraryStatus must be used within LibraryProvider");
  }
  return context;
};
