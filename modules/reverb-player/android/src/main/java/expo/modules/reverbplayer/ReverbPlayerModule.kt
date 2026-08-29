package expo.modules.reverbplayer

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

class ReverbPlayerModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var controller: MediaController? = null
  private var controllerFuture: ListenableFuture<MediaController>? = null
  private val directExecutor = Executor(Runnable::run)
  private val playerListener = object : Player.Listener {
    override fun onEvents(player: Player, events: Player.Events) {
      sendEvent(
        playbackSnapshotChangedEvent,
        mapOf("snapshot" to PlaybackSnapshots.fromPlayer(player)),
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ReverbPlayer")
    Events(playbackSnapshotChangedEvent)

    AsyncFunction("connect").SuspendBody { ->
      snapshot(requireController())
    }

    AsyncFunction("getSnapshot").SuspendBody { ->
      snapshot(requireController())
    }

    AsyncFunction("getLastStoppedSnapshot").SuspendBody { ->
      StoppedSnapshotStore.read(requireContext())
    }

    AsyncFunction("setQueue") Coroutine { tracks: List<Map<String, Any?>>, options: Map<String, Any?> ->
      val mediaItems = PlaybackItems.fromMaps(requireContext(), tracks)
      withController { mediaController ->
        if (mediaItems.isEmpty()) {
          mediaController.clearMediaItems()
          return@withController
        }
        val activeIndex = options.number("activeIndex").toInt().coerceIn(mediaItems.indices)
        val positionMs = options.number("positionMs").toLong().coerceAtLeast(0)
        val playWhenReady = options["playWhenReady"] as? Boolean ?: false
        val repeatMode = options["repeatMode"] as? String ?: "off"

        mediaController.stop()
        mediaController.repeatMode = PlaybackSnapshots.repeatMode(repeatMode)
        mediaController.setMediaItems(mediaItems, activeIndex, positionMs)
        mediaController.prepare()
        if (playWhenReady) mediaController.play() else mediaController.pause()
        StoppedSnapshotStore.clear(requireContext())
      }
      snapshot(requireController())
    }

    AsyncFunction("replaceQueueOrder") Coroutine { tracks: List<Map<String, Any?>> ->
      val mediaItems = PlaybackItems.fromMaps(requireContext(), tracks)
      withController { mediaController ->
        val activeTrackId = mediaController.currentMediaItem?.mediaId
        val positionMs = mediaController.currentPosition.coerceAtLeast(0)
        val playWhenReady = mediaController.playWhenReady
        val activeIndex = mediaItems.indexOfFirst { it.mediaId == activeTrackId }
          .takeIf { it >= 0 }
          ?: 0

        mediaController.stop()
        mediaController.setMediaItems(mediaItems, activeIndex, positionMs)
        mediaController.prepare()
        if (playWhenReady) mediaController.play() else mediaController.pause()
      }
      snapshot(requireController())
    }

    AsyncFunction("play").SuspendBody { ->
      withController { it.play() }
      StoppedSnapshotStore.clear(requireContext())
      snapshot(requireController())
    }

    AsyncFunction("pause").SuspendBody { ->
      withController { it.pause() }
      snapshot(requireController())
    }

    AsyncFunction("stop").SuspendBody { ->
      withController { mediaController ->
        StoppedSnapshotStore.save(requireContext(), mediaController)
        mediaController.pause()
        mediaController.clearMediaItems()
        mediaController.stop()
      }
      requireContext().stopService(Intent(requireContext(), ReverbPlaybackService::class.java))
      snapshot(requireController())
    }

    AsyncFunction("seekTo") Coroutine { positionMs: Double ->
      withController { it.seekTo(positionMs.toLong().coerceAtLeast(0)) }
      snapshot(requireController())
    }

    AsyncFunction("skipNext").SuspendBody { ->
      withController { it.seekToNext() }
      snapshot(requireController())
    }

    AsyncFunction("skipPrevious").SuspendBody { ->
      withController { it.seekToPrevious() }
      snapshot(requireController())
    }

    AsyncFunction("setRepeatMode") Coroutine { repeatMode: String ->
      withController { it.repeatMode = PlaybackSnapshots.repeatMode(repeatMode) }
      snapshot(requireController())
    }

    OnDestroy {
      val future = controllerFuture
      controllerFuture = null
      mainHandler.post {
        controller?.removeListener(playerListener)
        controller?.release()
        controller = null
        future?.cancel(true)
      }
    }
  }

  private suspend fun requireController(): MediaController {
    controller?.let { return it }

    val future = onMain {
      controllerFuture ?: MediaController.Builder(
        requireContext(),
        SessionToken(
          requireContext(),
          ComponentName(requireContext(), ReverbPlaybackService::class.java),
        ),
      )
        .setApplicationLooper(Looper.getMainLooper())
        .buildAsync()
        .also { controllerFuture = it }
    }
    val resolvedController = await(future)

    return onMain {
      controller ?: resolvedController.also {
        controller = it
        it.addListener(playerListener)
      }
    }
  }

  private suspend fun withController(action: (MediaController) -> Unit) {
    val mediaController = requireController()
    onMain { action(mediaController) }
  }

  private suspend fun snapshot(mediaController: MediaController): Map<String, Any?> =
    onMain { PlaybackSnapshots.fromPlayer(mediaController) }

  private suspend fun <T> onMain(action: () -> T): T {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return action()
    }
    return suspendCancellableCoroutine { continuation ->
      mainHandler.post {
        runCatching(action).fold(
          onSuccess = { continuation.resume(it) },
          onFailure = { continuation.resumeWithException(it) },
        )
      }
    }
  }

  private suspend fun <T> await(future: ListenableFuture<T>): T =
    suspendCancellableCoroutine { continuation ->
      future.addListener(
        {
          runCatching(future::get).fold(
            onSuccess = { continuation.resume(it) },
            onFailure = { continuation.resumeWithException(it) },
          )
        },
        directExecutor,
      )
      continuation.invokeOnCancellation { future.cancel(true) }
    }

  private fun requireContext(): Context =
    appContext.reactContext ?: throw IllegalStateException("React context is not available.")

  private fun Map<String, Any?>.number(key: String): Number =
    get(key) as? Number ?: throw IllegalArgumentException("Queue option $key is required.")

  companion object {
    private const val playbackSnapshotChangedEvent = "onPlaybackSnapshotChanged"
  }
}
