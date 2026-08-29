package expo.modules.reverbplayer

import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters.AudioOffloadPreferences
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.DecoderReuseEvaluation
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

@UnstableApi
class ReverbPlaybackService : MediaSessionService() {
  private lateinit var player: ExoPlayer
  private var mediaSession: MediaSession? = null
  private val audioManager by lazy { getSystemService(AudioManager::class.java) }
  private val mediaButtonHandler = Handler(Looper.getMainLooper())
  private val pcmFallbackRouteKeys = mutableSetOf<String>()
  private val pcmFallbackTrackIds = mutableSetOf<String>()
  private var offloadEnabled = false
  private var mediaButtonClickCount = 0
  private var offloadStartWatchdog: Runnable? = null
  private val dispatchMediaButtonClicks = Runnable {
    when (mediaButtonClickCount) {
      1 -> if (player.isPlaying) player.pause() else player.play()
      2 -> player.seekToNext()
      else -> player.seekToPrevious()
    }
    mediaButtonClickCount = 0
  }

  override fun onCreate() {
    super.onCreate()

    val audioAttributes = AudioAttributes.Builder()
      .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
      .setUsage(C.USAGE_MEDIA)
      .build()
    offloadEnabled = audioManager.playbackOutputDevices().none(AudioDeviceInfo::requiresPcmOutput)

    player = ExoPlayer.Builder(this)
      .setMediaSourceFactory(ReverbMediaSourceFactory(this))
      .setAudioAttributes(audioAttributes, true)
      .setHandleAudioBecomingNoisy(true)
      .setMaxSeekToPreviousPositionMs(restartTrackThresholdMs)
      .build()
      .also { exoPlayer ->
        exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
          .buildUpon()
          .setAudioOffloadPreferences(audioOffloadPreferences(offloadEnabled))
          .build()
        exoPlayer.addListener(
          object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
              if (isPlaying) {
                cancelOffloadStartWatchdog()
                StoppedSnapshotStore.clear(this@ReverbPlaybackService)
              }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
              cancelOffloadStartWatchdog()
              setAudioOffloadEnabled(shouldEnableOffload(mediaItem?.mediaId))
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
              if (playbackState == Player.STATE_ENDED || playbackState == Player.STATE_IDLE) {
                cancelOffloadStartWatchdog()
              }
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
              if (!playWhenReady) {
                Log.i(
                  logTag,
                  "paused mediaId=${exoPlayer.currentMediaItem?.mediaId} " +
                    "position=${exoPlayer.currentPosition} reason=$reason",
                )
              }
            }

            override fun onPlayerError(error: PlaybackException) {
              Log.e(
                logTag,
                "error mediaId=${exoPlayer.currentMediaItem?.mediaId} " +
                  "position=${exoPlayer.currentPosition} code=${error.errorCode}",
                error,
              )
            }
          }
        )
        exoPlayer.addAnalyticsListener(
          PlaybackDiagnostics(
            this,
            exoPlayer,
            offloadTrackInitialised = ::scheduleOffloadStartWatchdog,
            audioPositionAdvanced = ::cancelOffloadStartWatchdog,
          )
        )
      }

    mediaSession = MediaSession.Builder(this, player)
      .setCallback(MediaButtonCallback())
      .build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

  override fun onTaskRemoved(rootIntent: Intent?) {
    StoppedSnapshotStore.save(this, player)
    player.pause()
    player.clearMediaItems()
    pauseAllPlayersAndStopSelf()
  }

  override fun onDestroy() {
    cancelOffloadStartWatchdog()
    mediaButtonHandler.removeCallbacksAndMessages(null)
    mediaSession?.release()
    mediaSession = null
    if (::player.isInitialized) {
      player.release()
    }
    super.onDestroy()
  }

  private inner class MediaButtonCallback : MediaSession.Callback {
    override fun onConnect(
      session: MediaSession,
      controllerInfo: MediaSession.ControllerInfo,
    ): MediaSession.ConnectionResult = MediaSession.ConnectionResult.AcceptedResultBuilder(session)
      .setAvailablePlayerCommands(
        MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
          .remove(Player.COMMAND_SEEK_BACK)
          .remove(Player.COMMAND_SEEK_FORWARD)
          .build()
      )
      .build()

    override fun onMediaButtonEvent(
      session: MediaSession,
      controllerInfo: MediaSession.ControllerInfo,
      intent: Intent,
    ): Boolean {
      val keyEvent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT) as? KeyEvent
      } ?: return false
      val handledKey = when (keyEvent.keyCode) {
        KeyEvent.KEYCODE_HEADSETHOOK,
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
        KeyEvent.KEYCODE_MEDIA_PLAY,
        KeyEvent.KEYCODE_MEDIA_PAUSE,
        KeyEvent.KEYCODE_MEDIA_NEXT,
        KeyEvent.KEYCODE_MEDIA_PREVIOUS,
        KeyEvent.KEYCODE_MEDIA_STOP -> true
        else -> false
      }
      if (!handledKey) {
        return false
      }
      if (keyEvent.action != KeyEvent.ACTION_DOWN || keyEvent.repeatCount != 0) {
        return true
      }

      when (keyEvent.keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY -> {
          cancelPendingMultiClick()
          player.play()
        }
        KeyEvent.KEYCODE_MEDIA_PAUSE -> {
          cancelPendingMultiClick()
          player.pause()
        }
        KeyEvent.KEYCODE_MEDIA_NEXT -> {
          cancelPendingMultiClick()
          player.seekToNext()
        }
        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
          cancelPendingMultiClick()
          player.seekToPrevious()
        }
        KeyEvent.KEYCODE_MEDIA_STOP -> {
          cancelPendingMultiClick()
          StoppedSnapshotStore.save(this@ReverbPlaybackService, player)
          player.pause()
          player.clearMediaItems()
          pauseAllPlayersAndStopSelf()
        }
        else -> queueMultiClick()
      }
      return true
    }
  }

  private fun queueMultiClick() {
    mediaButtonClickCount++
    mediaButtonHandler.removeCallbacks(dispatchMediaButtonClicks)
    if (mediaButtonClickCount >= 3) {
      dispatchMediaButtonClicks.run()
      return
    }
    mediaButtonHandler.postDelayed(dispatchMediaButtonClicks, multiClickWindowMs)
  }

  private fun cancelPendingMultiClick() {
    mediaButtonHandler.removeCallbacks(dispatchMediaButtonClicks)
    mediaButtonClickCount = 0
  }

  private fun scheduleOffloadStartWatchdog(mediaId: String) {
    cancelOffloadStartWatchdog()
    if (mediaId in pcmFallbackTrackIds) {
      return
    }
    val startPositionMs = player.currentPosition.coerceAtLeast(0)
    offloadStartWatchdog = Runnable {
      offloadStartWatchdog = null
      val currentMediaId = player.currentMediaItem?.mediaId
      val hasBufferedAudio = player.totalBufferedDuration >= minimumBufferedAudioMs
      val hasNotAdvanced = player.currentPosition <= startPositionMs + maximumUnadvancedPositionMs
      if (
        currentMediaId == mediaId &&
        player.playWhenReady &&
        player.playbackState == Player.STATE_BUFFERING &&
        player.playerError == null &&
        hasBufferedAudio &&
        hasNotAdvanced
      ) {
        retryCurrentTrackWithoutOffload(mediaId)
      }
    }.also { watchdog ->
      mediaButtonHandler.postDelayed(watchdog, offloadStartTimeoutMs)
    }
  }

  private fun cancelOffloadStartWatchdog() {
    offloadStartWatchdog?.let(mediaButtonHandler::removeCallbacks)
    offloadStartWatchdog = null
  }

  private fun retryCurrentTrackWithoutOffload(mediaId: String) {
    val activeIndex = player.currentMediaItemIndex
    if (activeIndex !in 0 until player.mediaItemCount) {
      return
    }
    val positionMs = player.currentPosition.coerceAtLeast(0)
    val playWhenReady = player.playWhenReady
    val outputDevices = audioManager.playbackOutputDevices()
    pcmFallbackTrackIds.add(mediaId)
    pcmFallbackRouteKeys.add(outputDevices.routeKey())
    Log.w(
      logTag,
      "fallback mediaId=$mediaId from=offload to=pcm-fallback " +
        "routes=${outputDevices.routeNames()} reason=offload-audio-track-did-not-advance",
    )
    player.stop()
    setAudioOffloadEnabled(false)
    player.prepare()
    player.seekTo(activeIndex, positionMs)
    if (playWhenReady) player.play() else player.pause()
  }

  private fun setAudioOffloadEnabled(enabled: Boolean) {
    if (offloadEnabled == enabled) {
      return
    }

    offloadEnabled = enabled
    player.trackSelectionParameters = player.trackSelectionParameters
      .buildUpon()
      .setAudioOffloadPreferences(audioOffloadPreferences(enabled))
      .build()
  }

  private fun shouldEnableOffload(mediaId: String?): Boolean {
    if (mediaId == null || mediaId in pcmFallbackTrackIds) {
      return false
    }

    val outputDevices = audioManager.playbackOutputDevices()
    if (outputDevices.routeKey() in pcmFallbackRouteKeys) {
      return false
    }
    val requiresPcmOutput = outputDevices.any(AudioDeviceInfo::requiresPcmOutput)
    if (requiresPcmOutput) {
      Log.i(
        logTag,
        "offload-disabled mediaId=$mediaId routes=${outputDevices.routeNames()} " +
          "reason=wired-or-usb-output",
      )
    }
    return !requiresPcmOutput
  }

  private class PlaybackDiagnostics(
    context: Context,
    private val player: ExoPlayer,
    private val offloadTrackInitialised: (String) -> Unit,
    private val audioPositionAdvanced: () -> Unit,
  ) : AnalyticsListener {
    private val audioManager = context.getSystemService(AudioManager::class.java)
    private var inputFormat: Format? = null

    override fun onAudioDecoderInitialized(
      eventTime: AnalyticsListener.EventTime,
      decoderName: String,
      initializedTimestampMs: Long,
      initializationDurationMs: Long,
    ) {
      Log.i(
        logTag,
        "decoder mediaId=${player.currentMediaItem?.mediaId} name=$decoderName " +
          "initMs=$initializationDurationMs",
      )
    }

    override fun onAudioInputFormatChanged(
      eventTime: AnalyticsListener.EventTime,
      format: Format,
      decoderReuseEvaluation: DecoderReuseEvaluation?,
    ) {
      inputFormat = format
      Log.i(
        logTag,
        "input mediaId=${player.currentMediaItem?.mediaId} mime=${format.sampleMimeType} " +
          "rate=${format.sampleRate} channels=${format.channelCount} pcm=${format.pcmEncoding}",
      )
    }

    override fun onAudioTrackInitialized(
      eventTime: AnalyticsListener.EventTime,
      audioTrackConfig: AudioSink.AudioTrackConfig,
    ) {
      val sourceIsPcm = inputFormat?.sampleMimeType == "audio/raw"
      val directPcmSupported = sourceIsPcm && isDirectPcmSupported(audioTrackConfig)
      val path = when {
        audioTrackConfig.offload -> "offload"
        directPcmSupported -> "direct-pcm"
        else -> "pcm-fallback"
      }
      val fallbackReason = when {
        audioTrackConfig.offload || directPcmSupported -> "none"
        sourceIsPcm -> "direct-pcm-unsupported-for-route-or-format"
        else -> "compressed-offload-unavailable-or-not-selected"
      }
      Log.i(
        logTag,
        "output mediaId=${player.currentMediaItem?.mediaId} path=$path " +
        "mime=${inputFormat?.sampleMimeType} encoding=${audioTrackConfig.encoding} " +
          "rate=${audioTrackConfig.sampleRate} channelMask=${audioTrackConfig.channelConfig} " +
          "buffer=${audioTrackConfig.bufferSize} " +
          "routes=${audioManager.playbackOutputDevices().routeNames()} " +
          "fallbackReason=$fallbackReason",
      )
      if (audioTrackConfig.offload) {
        player.currentMediaItem?.mediaId?.let(offloadTrackInitialised)
      }
    }

    override fun onAudioPositionAdvancing(
      eventTime: AnalyticsListener.EventTime,
      playoutStartSystemTimeMs: Long,
    ) {
      audioPositionAdvanced()
    }

    override fun onAudioUnderrun(
      eventTime: AnalyticsListener.EventTime,
      bufferSize: Int,
      bufferSizeMs: Long,
      elapsedSinceLastFeedMs: Long,
    ) {
      Log.w(
        logTag,
        "underrun mediaId=${player.currentMediaItem?.mediaId} " +
          "bufferMs=$bufferSizeMs elapsedMs=$elapsedSinceLastFeedMs",
      )
    }

    override fun onAudioSinkError(
      eventTime: AnalyticsListener.EventTime,
      audioSinkError: Exception,
    ) {
      Log.e(logTag, "audio-sink-error mediaId=${player.currentMediaItem?.mediaId}", audioSinkError)
    }

    private fun isDirectPcmSupported(config: AudioSink.AudioTrackConfig): Boolean {
      if (!(Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && Util.isEncodingLinearPcm(config.encoding))) {
        return false
      }
      return runCatching {
        val format = AudioFormat.Builder()
          .setEncoding(config.encoding)
          .setSampleRate(config.sampleRate)
          .setChannelMask(config.channelConfig)
          .build()
        AudioManager.getDirectPlaybackSupport(format, playbackAudioAttributes) !=
          AudioManager.DIRECT_PLAYBACK_NOT_SUPPORTED
      }.getOrDefault(false)
    }
  }

  companion object {
    private const val maximumUnadvancedPositionMs = 250L
    private const val minimumBufferedAudioMs = 1000L
    private const val offloadStartTimeoutMs = 1500L
    private const val logTag = "ReverbPlayback"
    private const val multiClickWindowMs = 500L
    private const val restartTrackThresholdMs = 3000L
  }
}

private val playbackAudioAttributes = android.media.AudioAttributes.Builder()
  .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
  .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
  .build()

private fun audioOffloadPreferences(enabled: Boolean): AudioOffloadPreferences {
  val mode = if (enabled) {
    AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_ENABLED
  } else {
    AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_DISABLED
  }
  return AudioOffloadPreferences.Builder()
    .setAudioOffloadMode(mode)
    .setIsGaplessSupportRequired(enabled)
    .build()
}

private fun AudioManager.playbackOutputDevices(): List<AudioDeviceInfo> =
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    getAudioDevicesForAttributes(playbackAudioAttributes)
  } else {
    getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
  }

private fun AudioDeviceInfo.requiresPcmOutput(): Boolean = when (type) {
  AudioDeviceInfo.TYPE_USB_ACCESSORY,
  AudioDeviceInfo.TYPE_USB_DEVICE,
  AudioDeviceInfo.TYPE_USB_HEADSET,
  AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
  AudioDeviceInfo.TYPE_WIRED_HEADSET -> true
  else -> false
}

private fun List<AudioDeviceInfo>.routeNames(): String =
  joinToString(",") { device ->
    when (device.type) {
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth-a2dp"
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
      AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb-accessory"
      AudioDeviceInfo.TYPE_USB_DEVICE -> "usb-device"
      AudioDeviceInfo.TYPE_USB_HEADSET -> "usb-headset"
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired-headphones"
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired-headset"
      else -> "type-${device.type}"
    }
  }.ifEmpty { "unknown" }

private fun List<AudioDeviceInfo>.routeKey(): String = map(AudioDeviceInfo::getType)
  .distinct()
  .sorted()
  .joinToString(",")
  .ifEmpty { "unknown" }
