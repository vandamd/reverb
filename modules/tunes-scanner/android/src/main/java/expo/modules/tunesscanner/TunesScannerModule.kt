package expo.modules.tunesscanner

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.math.max

class TunesScannerModule : Module() {
  private val tunesRoot = "Music/Tunes/"

  override fun definition() = ModuleDefinition {
    Name("TunesScanner")

    AsyncFunction("getAudioPermissionsAsync") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise, readPermission())
    }

    AsyncFunction("requestAudioPermissionsAsync") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, readPermission())
    }

    AsyncFunction("scanLibrary") Coroutine { ->
      val context = requireContext()
      if (!hasReadPermission(context)) {
        throw SecurityException("Tunes needs audio permission to scan Music/Tunes.")
      }
      scanTunes(context)
    }

    AsyncFunction("copyTrackToCache") Coroutine { contentUri: String, fileName: String ->
      val context = requireContext()
      if (!hasReadPermission(context)) {
        throw SecurityException("Tunes needs audio permission to copy this track.")
      }
      mapOf("uri" to copyToCache(context, contentUri, fileName))
    }
  }

  private fun requireContext(): Context =
    appContext.reactContext ?: throw IllegalStateException("React context is not available.")

  private fun readPermission(): String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      Manifest.permission.READ_MEDIA_AUDIO
    } else {
      Manifest.permission.READ_EXTERNAL_STORAGE
    }

  private fun hasReadPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, readPermission()) == PackageManager.PERMISSION_GRANTED

  private fun scanTunes(context: Context): List<Map<String, Any?>> {
    val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    val projection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      arrayOf(
        MediaStore.Audio.Media._ID,
        MediaStore.MediaColumns.DISPLAY_NAME,
        MediaStore.MediaColumns.RELATIVE_PATH,
        MediaStore.Audio.AudioColumns.TITLE,
        MediaStore.Audio.AudioColumns.ARTIST,
        MediaStore.Audio.AudioColumns.ALBUM,
        MediaStore.Audio.AudioColumns.DURATION,
        MediaStore.Audio.AudioColumns.TRACK,
        MediaStore.Audio.AudioColumns.YEAR,
        MediaStore.MediaColumns.MIME_TYPE,
        MediaStore.MediaColumns.SIZE,
        MediaStore.MediaColumns.DATE_MODIFIED,
      )
    } else {
      arrayOf(
        MediaStore.Audio.Media._ID,
        MediaStore.MediaColumns.DISPLAY_NAME,
        MediaStore.Audio.AudioColumns.TITLE,
        MediaStore.Audio.AudioColumns.ARTIST,
        MediaStore.Audio.AudioColumns.ALBUM,
        MediaStore.Audio.AudioColumns.DURATION,
        MediaStore.Audio.AudioColumns.TRACK,
        MediaStore.Audio.AudioColumns.YEAR,
        MediaStore.MediaColumns.MIME_TYPE,
        MediaStore.MediaColumns.SIZE,
        MediaStore.MediaColumns.DATE_MODIFIED,
        MediaStore.MediaColumns.DATA,
      )
    }
    val selection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ? AND ${MediaStore.Audio.AudioColumns.IS_MUSIC} != 0"
    } else {
      "${MediaStore.MediaColumns.DATA} LIKE ? AND ${MediaStore.Audio.AudioColumns.IS_MUSIC} != 0"
    }
    val selectionArgs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      arrayOf("$tunesRoot%")
    } else {
      arrayOf("%/Music/Tunes/%")
    }
    val sortOrder = "${MediaStore.Audio.AudioColumns.ALBUM} COLLATE NOCASE ASC, ${MediaStore.Audio.AudioColumns.TRACK} ASC"
    val tracks = mutableListOf<Map<String, Any?>>()

    context.contentResolver.query(collection, projection, selection, selectionArgs, sortOrder)?.use { cursor ->
      val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
      val fileNameColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
      val titleColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.AudioColumns.TITLE)
      val artistColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.AudioColumns.ARTIST)
      val albumColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.AudioColumns.ALBUM)
      val durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.AudioColumns.DURATION)
      val trackColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.AudioColumns.TRACK)
      val yearColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.AudioColumns.YEAR)
      val mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
      val sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
      val modifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED)
      val relativePathColumn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.RELATIVE_PATH)
      } else {
        -1
      }

      while (cursor.moveToNext()) {
        val mediaId = cursor.getLong(idColumn)
        val contentUri = ContentUris.withAppendedId(collection, mediaId)
        val fileName = cursor.getNullableString(fileNameColumn) ?: "Track $mediaId"
        val metadata = readMetadata(context, contentUri, mediaId)
        val mediaStoreTrack = cursor.getNullableInt(trackColumn)
        val discNumber = metadata.discNumber ?: mediaStoreTrack?.let { if (it >= 1000) max(1, it / 1000) else null }
        val trackNumber = metadata.trackNumber ?: mediaStoreTrack?.let { if (it >= 1000) it % 1000 else it }
        val relativePath = if (relativePathColumn >= 0) {
          cursor.getNullableString(relativePathColumn) ?: tunesRoot
        } else {
          tunesRoot
        }

        tracks.add(
          mapOf(
            "id" to mediaId.toString(),
            "contentUri" to contentUri.toString(),
            "fileName" to fileName,
            "relativePath" to relativePath,
            "title" to (metadata.title ?: cursor.getNullableString(titleColumn) ?: fileName.titleFromFileName()),
            "artist" to (metadata.artist ?: cursor.getNullableString(artistColumn) ?: "Unknown Artist"),
            "album" to (metadata.album ?: cursor.getNullableString(albumColumn) ?: "Unknown Album"),
            "albumArtist" to (metadata.albumArtist ?: metadata.artist ?: cursor.getNullableString(artistColumn) ?: "Unknown Artist"),
            "durationMs" to (metadata.durationMs ?: cursor.getNullableLong(durationColumn) ?: 0L),
            "trackNumber" to trackNumber,
            "discNumber" to discNumber,
            "year" to (metadata.year ?: cursor.getNullableInt(yearColumn)),
            "mimeType" to cursor.getNullableString(mimeColumn),
            "sizeBytes" to (cursor.getNullableLong(sizeColumn) ?: 0L),
            "modifiedAtMs" to ((cursor.getNullableLong(modifiedColumn) ?: 0L) * 1000L),
            "artworkUri" to metadata.artworkUri,
          )
        )
      }
    }

    return tracks
  }

  private fun readMetadata(context: Context, uri: Uri, mediaId: Long): TrackMetadata {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(context, uri)
      val artworkUri = retriever.embeddedPicture?.let { bytes ->
        val artworkDir = File(context.cacheDir, "tunes-artwork")
        artworkDir.mkdirs()
        val artworkFile = File(artworkDir, "$mediaId.jpg")
        artworkFile.writeBytes(bytes)
        Uri.fromFile(artworkFile).toString()
      }
      TrackMetadata(
        title = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE).blankToNull(),
        artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST).blankToNull(),
        album = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM).blankToNull(),
        albumArtist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST).blankToNull(),
        durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION).blankToNull()?.toLongOrNull(),
        trackNumber = parseOrdinal(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER)),
        discNumber = parseOrdinal(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DISC_NUMBER)),
        year = parseYear(
          retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR)
            ?: retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE)
        ),
        artworkUri = artworkUri,
      )
    } catch (_: Exception) {
      TrackMetadata()
    } finally {
      retriever.release()
    }
  }

  private fun copyToCache(context: Context, contentUri: String, fileName: String): String {
    val sourceUri = Uri.parse(contentUri)
    val playbackDir = File(context.cacheDir, "tunes-playback")
    playbackDir.mkdirs()
    val sourceId = sourceUri.lastPathSegment ?: "track"
    val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
    val destination = File(playbackDir, "$sourceId-$safeName")

    context.contentResolver.openInputStream(sourceUri)?.use { input ->
      destination.outputStream().use { output ->
        input.copyTo(output)
      }
    } ?: throw IllegalStateException("Could not open $contentUri")

    return Uri.fromFile(destination).toString()
  }

  private fun String?.blankToNull(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

  private fun String.titleFromFileName(): String = substringBeforeLast(".").replace("_", " ")

  private fun parseOrdinal(value: String?): Int? =
    value.blankToNull()
      ?.substringBefore("/")
      ?.trim()
      ?.takeWhile { it.isDigit() }
      ?.toIntOrNull()

  private fun parseYear(value: String?): Int? =
    value.blankToNull()
      ?.take(4)
      ?.takeIf { it.all(Char::isDigit) }
      ?.toIntOrNull()

  private fun android.database.Cursor.getNullableString(column: Int): String? =
    if (isNull(column)) null else getString(column).blankToNull()

  private fun android.database.Cursor.getNullableLong(column: Int): Long? =
    if (isNull(column)) null else getLong(column)

  private fun android.database.Cursor.getNullableInt(column: Int): Int? =
    if (isNull(column)) null else getInt(column)
}

data class TrackMetadata(
  val title: String? = null,
  val artist: String? = null,
  val album: String? = null,
  val albumArtist: String? = null,
  val durationMs: Long? = null,
  val trackNumber: Int? = null,
  val discNumber: Int? = null,
  val year: Int? = null,
  val artworkUri: String? = null,
)
