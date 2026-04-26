import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import type { LocalPlaylist, LocalTrack, ScannedTrack } from "@/types/music";

interface TrackRow {
  album: string;
  album_artist: string;
  artist: string;
  artwork_cache_key: string | null;
  artwork_uri: string | null;
  disc_number: number | null;
  duration_ms: number;
  file_name: string;
  folder_path: string;
  id: string;
  liked: number;
  mime_type: string | null;
  modified_at_ms: number;
  size_bytes: number;
  title: string;
  track_number: number | null;
  uri: string;
  year: number | null;
}

interface PlaylistRow {
  cover_uri: string | null;
  created_at: number;
  id: string;
  name: string;
  track_ids: string | null;
  updated_at: number;
}

let databasePromise: Promise<SQLiteDatabase> | null = null;

const openDatabase = async () => {
  databasePromise ??= openDatabaseAsync("reverb.db");
  const database = await databasePromise;
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY NOT NULL,
      uri TEXT NOT NULL,
      file_name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      album_artist TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      track_number INTEGER,
      disc_number INTEGER,
      year INTEGER,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL,
      modified_at_ms INTEGER NOT NULL,
      artwork_cache_key TEXT,
      artwork_uri TEXT,
      liked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      cover_uri TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );
  `);
  await ensureColumn(database, "playlists", "cover_uri", "TEXT");
  await ensureColumn(database, "tracks", "artwork_cache_key", "TEXT");
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS tracks_album_sort_idx
      ON tracks (album_artist COLLATE NOCASE, album COLLATE NOCASE, disc_number, track_number, title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS tracks_liked_idx ON tracks (liked);
    CREATE INDEX IF NOT EXISTS playlist_tracks_order_idx
      ON playlist_tracks (playlist_id, position);
    CREATE INDEX IF NOT EXISTS playlist_tracks_track_idx ON playlist_tracks (track_id);
  `);
  return database;
};

const ensureColumn = async (
  database: SQLiteDatabase,
  tableName: string,
  columnName: string,
  columnDefinition: string
) => {
  const columns = await database.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${tableName})`
  );
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  await database.execAsync(
    `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`
  );
};

const toLocalTrack = (row: TrackRow): LocalTrack => ({
  id: row.id,
  uri: row.uri,
  fileName: row.file_name,
  folderPath: row.folder_path,
  title: row.title,
  artist: row.artist,
  album: row.album,
  albumArtist: row.album_artist,
  artworkCacheKey: row.artwork_cache_key,
  durationMs: row.duration_ms,
  trackNumber: row.track_number,
  discNumber: row.disc_number,
  year: row.year,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  modifiedAtMs: row.modified_at_ms,
  artworkUri: row.artwork_uri,
  liked: row.liked === 1,
});

const trackSortSql = `
  album_artist COLLATE NOCASE ASC,
  album COLLATE NOCASE ASC,
  COALESCE(disc_number, 0) ASC,
  COALESCE(track_number, 9999) ASC,
  title COLLATE NOCASE ASC
`;

export const initialiseCatalogueStore = async () => {
  await openDatabase();
};

export const getTracks = async (): Promise<LocalTrack[]> => {
  const database = await openDatabase();
  const rows = await database.getAllAsync<TrackRow>(
    `SELECT * FROM tracks ORDER BY ${trackSortSql}`
  );
  return rows.map(toLocalTrack);
};

export const getTracksForScan = async (): Promise<LocalTrack[]> => {
  const database = await openDatabase();
  const rows = await database.getAllAsync<TrackRow>("SELECT * FROM tracks");
  return rows.map(toLocalTrack);
};

const BATCH_SIZE = 40;

export const replaceScannedTracks = async (
  scannedTracks: ScannedTrack[]
): Promise<LocalTrack[]> => {
  const database = await openDatabase();
  const scannedIds = new Set(scannedTracks.map((track) => track.id));
  const existingRows = await database.getAllAsync<
    Pick<TrackRow, "id" | "liked" | "modified_at_ms" | "size_bytes">
  >("SELECT id, liked, modified_at_ms, size_bytes FROM tracks");

  const existingById = new Map(
    existingRows.map((row) => [
      row.id,
      {
        liked: row.liked,
        modifiedAtMs: row.modified_at_ms,
        sizeBytes: row.size_bytes,
      },
    ])
  );

  const changedTracks = scannedTracks.filter((track) => {
    const existing = existingById.get(track.id);
    if (!existing) {
      return true;
    }
    return (
      track.sizeBytes !== existing.sizeBytes ||
      track.modifiedAtMs !== existing.modifiedAtMs
    );
  });

  await database.withExclusiveTransactionAsync(async (transaction) => {
    if (changedTracks.length > 0) {
      const columnCount = 18;
      const singleRowPlaceholder = `(${Array.from({ length: columnCount }, () => "?").join(", ")})`;

      for (let i = 0; i < changedTracks.length; i += BATCH_SIZE) {
        const batch = changedTracks.slice(i, i + BATCH_SIZE);
        const valuesPlaceholders = batch
          .map(() => singleRowPlaceholder)
          .join(", ");
        const params = batch.flatMap((track) => [
          track.id,
          track.contentUri,
          track.fileName,
          track.relativePath,
          track.title,
          track.artist,
          track.album,
          track.albumArtist,
          track.durationMs,
          track.trackNumber,
          track.discNumber,
          track.year,
          track.mimeType,
          track.sizeBytes,
          track.modifiedAtMs,
          track.artworkCacheKey ?? null,
          track.artworkUri ?? null,
          existingById.get(track.id)?.liked ?? 0,
        ]);

        await transaction.runAsync(
          `
          INSERT INTO tracks (
            id, uri, file_name, folder_path, title, artist, album, album_artist,
            duration_ms, track_number, disc_number, year, mime_type, size_bytes,
            modified_at_ms, artwork_cache_key, artwork_uri, liked
          ) VALUES ${valuesPlaceholders}
          ON CONFLICT(id) DO UPDATE SET
            uri = excluded.uri,
            file_name = excluded.file_name,
            folder_path = excluded.folder_path,
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            album_artist = excluded.album_artist,
            duration_ms = excluded.duration_ms,
            track_number = excluded.track_number,
            disc_number = excluded.disc_number,
            year = excluded.year,
            mime_type = excluded.mime_type,
            size_bytes = excluded.size_bytes,
            modified_at_ms = excluded.modified_at_ms,
            artwork_cache_key = excluded.artwork_cache_key,
            artwork_uri = excluded.artwork_uri,
            liked = tracks.liked
        `,
          params
        );
      }
    }

    const removedIds = existingRows
      .map((row) => row.id)
      .filter((id) => !scannedIds.has(id));
    for (let index = 0; index < removedIds.length; index += 500) {
      const ids = removedIds.slice(index, index + 500);
      const placeholders = ids.map(() => "?").join(", ");
      await transaction.runAsync(
        `DELETE FROM playlist_tracks WHERE track_id IN (${placeholders})`,
        ids
      );
      await transaction.runAsync(
        `DELETE FROM tracks WHERE id IN (${placeholders})`,
        ids
      );
    }
  });

  return getTracks();
};

export const setTrackLiked = async (trackId: string, liked: boolean) => {
  const database = await openDatabase();
  await database.runAsync(
    "UPDATE tracks SET liked = ? WHERE id = ?",
    liked ? 1 : 0,
    trackId
  );
};

export const getPlaylists = async (): Promise<LocalPlaylist[]> => {
  const database = await openDatabase();
  const rows = await database.getAllAsync<PlaylistRow>(`
    SELECT
      playlists.id,
      playlists.name,
      playlists.cover_uri,
      playlists.created_at,
      playlists.updated_at,
      (
        SELECT GROUP_CONCAT(ordered_tracks.track_id, '|')
        FROM (
          SELECT track_id
          FROM playlist_tracks
          WHERE playlist_id = playlists.id
          ORDER BY position ASC
        ) AS ordered_tracks
      ) AS track_ids
    FROM playlists
    ORDER BY playlists.updated_at DESC, playlists.name COLLATE NOCASE ASC
  `);
  return rows.map((row) => ({
    coverUri: row.cover_uri,
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trackIds: row.track_ids?.split("|").filter(Boolean) ?? [],
  }));
};

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const createPlaylist = async (
  name: string,
  coverUri: string | null = null
) => {
  const database = await openDatabase();
  const now = Date.now();
  const id = createId();
  await database.runAsync(
    "INSERT INTO playlists (id, name, cover_uri, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    id,
    name.trim(),
    coverUri,
    now,
    now
  );
  return getPlaylists();
};

export const renamePlaylist = async (playlistId: string, name: string) => {
  const database = await openDatabase();
  await database.runAsync(
    "UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?",
    name.trim(),
    Date.now(),
    playlistId
  );
  return getPlaylists();
};

export const setPlaylistCover = async (
  playlistId: string,
  coverUri: string | null
) => {
  const database = await openDatabase();
  await database.runAsync(
    "UPDATE playlists SET cover_uri = ?, updated_at = ? WHERE id = ?",
    coverUri,
    Date.now(),
    playlistId
  );
  return getPlaylists();
};

export const deletePlaylist = async (playlistId: string) => {
  const database = await openDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "DELETE FROM playlist_tracks WHERE playlist_id = ?",
      playlistId
    );
    await transaction.runAsync(
      "DELETE FROM playlists WHERE id = ?",
      playlistId
    );
  });
  return getPlaylists();
};

export const addTrackToPlaylist = async (
  playlistId: string,
  trackId: string
) => {
  const database = await openDatabase();
  const positionRow = await database.getFirstAsync<{ position: number | null }>(
    "SELECT MAX(position) AS position FROM playlist_tracks WHERE playlist_id = ?",
    playlistId
  );
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
      playlistId,
      trackId,
      (positionRow?.position ?? -1) + 1
    );
    await transaction.runAsync(
      "UPDATE playlists SET updated_at = ? WHERE id = ?",
      Date.now(),
      playlistId
    );
  });
  return getPlaylists();
};

export const removeTrackFromPlaylist = async (
  playlistId: string,
  trackId: string
) => {
  const database = await openDatabase();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?",
      playlistId,
      trackId
    );
    await transaction.runAsync(
      "UPDATE playlists SET updated_at = ? WHERE id = ?",
      Date.now(),
      playlistId
    );
  });
  return getPlaylists();
};

export const movePlaylistTrack = async (
  playlistId: string,
  trackId: string,
  direction: "down" | "up"
) => {
  const database = await openDatabase();
  const rows = await database.getAllAsync<{
    position: number;
    track_id: string;
  }>(
    "SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC",
    playlistId
  );
  const currentIndex = rows.findIndex((row) => row.track_id === trackId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= rows.length ||
    rows.length < 2
  ) {
    return getPlaylists();
  }

  const current = rows[currentIndex];
  const next = rows[nextIndex];

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?",
      next.position,
      playlistId,
      current.track_id
    );
    await transaction.runAsync(
      "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?",
      current.position,
      playlistId,
      next.track_id
    );
    await transaction.runAsync(
      "UPDATE playlists SET updated_at = ? WHERE id = ?",
      Date.now(),
      playlistId
    );
  });

  return getPlaylists();
};
