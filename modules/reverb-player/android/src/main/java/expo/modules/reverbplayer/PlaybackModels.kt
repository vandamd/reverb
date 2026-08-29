package expo.modules.reverbplayer

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream

internal object PlaybackItems {
  fun fromMaps(context: Context, tracks: List<Map<String, Any?>>): List<MediaItem> = tracks.map { track ->
    val id = track.string("id")
    val uri = track.string("uri")
    val artworkUri = track.optionalString("artworkUri")
    val metadata = MediaMetadata.Builder()
      .setTitle(track.string("title"))
      .setArtist(track.string("artist"))
      .setAlbumTitle(track.string("album"))
      .applyArtwork(context, artworkUri)
      .build()

    MediaItem.Builder()
      .setMediaId(id)
      .setUri(uri)
      .setMimeType(track.optionalString("mimeType"))
      .setMediaMetadata(metadata)
      .build()
  }

  private fun MediaMetadata.Builder.applyArtwork(
    context: Context,
    artworkUri: String?,
  ): MediaMetadata.Builder {
    val uri = artworkUri?.let(Uri::parse) ?: return this
    if (uri.scheme == "http" || uri.scheme == "https") {
      return setArtworkUri(uri)
    }

    val artworkData = runCatching {
      when (uri.scheme) {
        "content" -> context.contentResolver.openInputStream(uri)?.use { input ->
          input.readArtworkBytes()
        }
        "file", null -> uri.path?.let(::File)?.takeIf { file ->
          file.isFile && file.length() <= maxArtworkBytes
        }?.readBytes()
        else -> null
      }
    }.getOrNull()
    return artworkData?.let { setArtworkData(it, null) } ?: this
  }

  private fun InputStream.readArtworkBytes(): ByteArray? {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
      val bytesRead = read(buffer)
      if (bytesRead < 0) {
        return output.toByteArray()
      }
      if (output.size() + bytesRead > maxArtworkBytes) {
        return null
      }
      output.write(buffer, 0, bytesRead)
    }
  }

  private fun Map<String, Any?>.string(key: String): String =
    optionalString(key) ?: throw IllegalArgumentException("Track $key is required.")

  private fun Map<String, Any?>.optionalString(key: String): String? =
    (get(key) as? String)?.takeIf(String::isNotBlank)

  private const val maxArtworkBytes = 512 * 1024
}

internal object PlaybackSnapshots {
  fun fromPlayer(player: Player): Map<String, Any?> {
    val hasQueue = player.mediaItemCount > 0
    val activeIndex = if (hasQueue) player.currentMediaItemIndex else -1
    val activeTrackId = if (hasQueue) player.currentMediaItem?.mediaId else null
    val durationMs = player.duration.takeIf { it >= 0 } ?: 0
    val positionMs = player.currentPosition.coerceAtLeast(0)

    return mapOf(
      "activeIndex" to activeIndex,
      "activeTrackId" to activeTrackId,
      "capturedAtMs" to System.currentTimeMillis(),
      "durationMs" to durationMs,
      "error" to player.playerError?.message,
      "playbackState" to state(player),
      "playWhenReady" to player.playWhenReady,
      "positionMs" to positionMs,
      "queueIds" to List(player.mediaItemCount) { index -> player.getMediaItemAt(index).mediaId },
      "repeatMode" to repeatMode(player.repeatMode),
    )
  }

  private fun state(player: Player): String = when (player.playbackState) {
    Player.STATE_BUFFERING -> "buffering"
    Player.STATE_ENDED -> "ended"
    Player.STATE_IDLE -> if (player.playerError == null) "idle" else "error"
    Player.STATE_READY -> when {
      player.isPlaying -> "playing"
      player.playWhenReady -> "ready"
      else -> "paused"
    }
    else -> "idle"
  }

  fun repeatMode(repeatMode: Int): String = when (repeatMode) {
    Player.REPEAT_MODE_ALL -> "queue"
    Player.REPEAT_MODE_ONE -> "track"
    else -> "off"
  }

  fun repeatMode(repeatMode: String): Int = when (repeatMode) {
    "queue" -> Player.REPEAT_MODE_ALL
    "track" -> Player.REPEAT_MODE_ONE
    else -> Player.REPEAT_MODE_OFF
  }
}

internal object StoppedSnapshotStore {
  private const val preferencesName = "track_player_stopped_snapshot"
  private const val activeIndexKey = "active_index"
  private const val activeTrackIdKey = "active_track_id"
  private const val positionKey = "position"
  private const val durationKey = "duration"
  private const val capturedAtKey = "captured_at"

  fun save(context: Context, player: Player) {
    if (player.mediaItemCount == 0) {
      return
    }

    val activeIndex = player.currentMediaItemIndex
    if (activeIndex !in 0 until player.mediaItemCount) {
      return
    }

    preferences(context).edit()
      .putInt(activeIndexKey, activeIndex)
      .putString(activeTrackIdKey, player.currentMediaItem?.mediaId)
      .putLong(positionKey, (player.currentPosition.coerceAtLeast(0) / 1000.0).toRawBits())
      .putLong(durationKey, ((player.duration.takeIf { it >= 0 } ?: 0) / 1000.0).toRawBits())
      .putLong(capturedAtKey, System.currentTimeMillis())
      .commit()
  }

  fun read(context: Context): Map<String, Any?>? {
    val preferences = preferences(context)
    if (!preferences.contains(capturedAtKey)) {
      return null
    }

    return mapOf(
      "activeIndex" to preferences.getInt(activeIndexKey, 0),
      "activeTrackId" to preferences.getString(activeTrackIdKey, null),
      "capturedAtMs" to preferences.getLong(capturedAtKey, 0),
      "durationMs" to (Double.fromBits(preferences.getLong(durationKey, 0)) * 1000).toLong(),
      "positionMs" to (Double.fromBits(preferences.getLong(positionKey, 0)) * 1000).toLong(),
    )
  }

  fun clear(context: Context) {
    preferences(context).edit().clear().apply()
  }

  private fun preferences(context: Context) =
    context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
}
