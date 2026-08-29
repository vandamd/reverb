package expo.modules.reverbplayer

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.DataReader
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.util.ParsableByteArray
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.analytics.PlayerId
import androidx.media3.exoplayer.drm.DrmSessionManagerProvider
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaExtractor
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorOutput
import androidx.media3.extractor.PositionHolder
import androidx.media3.extractor.SeekMap
import androidx.media3.extractor.SeekPoint
import androidx.media3.extractor.TrackOutput
import java.io.IOException
import java.nio.ByteBuffer

@UnstableApi
internal class ReverbMediaSourceFactory(context: Context) : MediaSource.Factory {
  private val defaultFactory = DefaultMediaSourceFactory(context)
  private val apeFactory = ProgressiveMediaSource.Factory(
    DefaultDataSource.Factory(context),
    PlatformApeExtractor.Factory(context),
  )

  override fun createMediaSource(mediaItem: MediaItem): MediaSource {
    val localConfiguration = requireNotNull(mediaItem.localConfiguration)
    val mimeType = localConfiguration.mimeType.orEmpty().lowercase()
    val isApe = mimeType == "audio/ape" ||
      mimeType == "audio/x-ape" ||
      localConfiguration.uri.lastPathSegment?.endsWith(".ape", ignoreCase = true) == true
    return if (isApe) {
      apeFactory.createMediaSource(mediaItem)
    } else {
      defaultFactory.createMediaSource(mediaItem)
    }
  }

  override fun getSupportedTypes(): IntArray = defaultFactory.supportedTypes

  override fun setDrmSessionManagerProvider(
    drmSessionManagerProvider: DrmSessionManagerProvider,
  ): MediaSource.Factory {
    defaultFactory.setDrmSessionManagerProvider(drmSessionManagerProvider)
    apeFactory.setDrmSessionManagerProvider(drmSessionManagerProvider)
    return this
  }

  override fun setLoadErrorHandlingPolicy(
    loadErrorHandlingPolicy: LoadErrorHandlingPolicy,
  ): MediaSource.Factory {
    defaultFactory.setLoadErrorHandlingPolicy(loadErrorHandlingPolicy)
    apeFactory.setLoadErrorHandlingPolicy(loadErrorHandlingPolicy)
    return this
  }
}

@UnstableApi
private class PlatformApeExtractor(private val context: Context) : ProgressiveMediaExtractor {
  private var mediaExtractor: MediaExtractor? = null
  private var trackOutput: TrackOutput? = null
  private var sampleData = ByteArray(0)
  private var currentInputPosition = 0L

  @Throws(IOException::class)
  override fun init(
    dataReader: DataReader,
    uri: Uri,
    responseHeaders: Map<String, List<String>>,
    position: Long,
    length: Long,
    output: ExtractorOutput,
  ) {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(
        context,
        uri,
        responseHeaders.mapValues { (_, values) -> values.firstOrNull().orEmpty() },
      )
      val audioTrackIndex = (0 until extractor.trackCount).firstOrNull { index ->
        extractor.getTrackFormat(index)
          .getString(MediaFormat.KEY_MIME)
          ?.startsWith("audio/") == true
      } ?: throw IOException("No audio track was found in the APE file.")
      val mediaFormat = extractor.getTrackFormat(audioTrackIndex)
      val outputTrack = output.track(audioTrackIndex, C.TRACK_TYPE_AUDIO)
      outputTrack.format(mediaFormat.toMedia3Format(audioTrackIndex))
      output.endTracks()
      output.seekMap(mediaFormat.toSeekMap())
      extractor.selectTrack(audioTrackIndex)
      mediaExtractor = extractor
      trackOutput = outputTrack
    } catch (error: Exception) {
      extractor.release()
      throw if (error is IOException) error else IOException("Unable to open the APE file.", error)
    }
  }

  override fun read(seekPosition: PositionHolder): Int {
    val extractor = mediaExtractor ?: return Extractor.RESULT_END_OF_INPUT
    val output = trackOutput ?: return Extractor.RESULT_END_OF_INPUT
    val nextSampleSize = extractor.sampleSize
    if (nextSampleSize < 0) {
      return Extractor.RESULT_END_OF_INPUT
    }
    if (nextSampleSize > Int.MAX_VALUE) {
      throw IOException("APE sample is too large to buffer.")
    }

    val sampleSize = nextSampleSize.toInt()
    if (sampleData.size < sampleSize) {
      sampleData = ByteArray(sampleSize)
    }
    val bytesRead = extractor.readSampleData(ByteBuffer.wrap(sampleData), 0)
    if (bytesRead < 0) {
      return Extractor.RESULT_END_OF_INPUT
    }
    output.sampleData(ParsableByteArray(sampleData, bytesRead), bytesRead)
    val flags = if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) {
      C.BUFFER_FLAG_KEY_FRAME
    } else {
      0
    }
    output.sampleMetadata(extractor.sampleTime, flags, bytesRead, 0, null)
    currentInputPosition += bytesRead
    extractor.advance()
    return Extractor.RESULT_CONTINUE
  }

  override fun seek(position: Long, seekTimeUs: Long) {
    currentInputPosition = position
    mediaExtractor?.seekTo(seekTimeUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
  }

  override fun getCurrentInputPosition(): Long = currentInputPosition

  override fun disableSeekingOnMp3Streams() = Unit

  override fun release() {
    mediaExtractor?.release()
    mediaExtractor = null
    trackOutput = null
    currentInputPosition = 0
  }

  class Factory(private val context: Context) : ProgressiveMediaExtractor.Factory {
    override fun createProgressiveMediaExtractor(playerId: PlayerId): ProgressiveMediaExtractor =
      PlatformApeExtractor(context)
  }
}

private fun MediaFormat.toMedia3Format(trackIndex: Int): Format {
  val initialisationData = buildList {
    var index = 0
    while (containsKey("csd-$index")) {
      val buffer = getByteBuffer("csd-$index")?.duplicate() ?: break
      add(ByteArray(buffer.remaining()).also(buffer::get))
      index++
    }
  }
  return Format.Builder()
    .setId(trackIndex)
    .setSampleMimeType(getString(MediaFormat.KEY_MIME))
    .setCodecs(optionalString(MediaFormat.KEY_CODECS_STRING))
    .setChannelCount(optionalInt(MediaFormat.KEY_CHANNEL_COUNT, Format.NO_VALUE))
    .setSampleRate(optionalInt(MediaFormat.KEY_SAMPLE_RATE, Format.NO_VALUE))
    .setAverageBitrate(optionalInt(MediaFormat.KEY_BIT_RATE, Format.NO_VALUE))
    .setMaxInputSize(optionalInt(MediaFormat.KEY_MAX_INPUT_SIZE, Format.NO_VALUE))
    .setEncoderDelay(optionalInt(MediaFormat.KEY_ENCODER_DELAY, 0))
    .setEncoderPadding(optionalInt(MediaFormat.KEY_ENCODER_PADDING, 0))
    .setInitializationData(initialisationData)
    .build()
}

private fun MediaFormat.toSeekMap(): SeekMap {
  val durationUs = optionalLong(MediaFormat.KEY_DURATION, C.TIME_UNSET)
  return object : SeekMap {
    override fun isSeekable(): Boolean = durationUs != C.TIME_UNSET

    override fun getDurationUs(): Long = durationUs

    override fun getSeekPoints(timeUs: Long): SeekMap.SeekPoints =
      SeekMap.SeekPoints(SeekPoint(timeUs, 0))
  }
}

private fun MediaFormat.optionalInt(key: String, fallback: Int): Int =
  if (containsKey(key)) getInteger(key) else fallback

private fun MediaFormat.optionalLong(key: String, fallback: Long): Long =
  if (containsKey(key)) getLong(key) else fallback

private fun MediaFormat.optionalString(key: String): String? =
  if (containsKey(key)) getString(key) else null
