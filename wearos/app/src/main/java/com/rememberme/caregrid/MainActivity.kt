package com.rememberme.caregrid

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.wearable.Wearable
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.delay
import org.json.JSONObject
import java.io.File
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val AUDIO_PERMISSION_REQUEST = 44
private const val BODY_PERMISSION_REQUEST = 45
private const val ACTIVITY_PERMISSION_REQUEST = 46
private const val LOCATION_PERMISSION_REQUEST = 42
private const val TURN_RECORD_MS = 7000L
private const val MIN_AUDIO_FILE_BYTES = 1200L
private const val WATCH_AUDIO_MIME = "audio/mp4"
// Temporary quiet mode: restore these to a 3-5 minute cadence when automatic geofence checks are needed again.
private const val AUTO_GPS_INTERVAL_MS = 24 * 60 * 60 * 1000L
private const val AUTO_GPS_FIRST_DELAY_MS = 24 * 60 * 60 * 1000L
private const val JSON_CONNECT_TIMEOUT_MS = 10000
private const val JSON_READ_TIMEOUT_MS = 30000
private const val AUDIO_CONNECT_TIMEOUT_MS = 12000
private const val AUDIO_READ_TIMEOUT_MS = 45000
private const val CUE_CONNECT_TIMEOUT_MS = 10000
private const val CUE_READ_TIMEOUT_MS = 18000
private const val OPEN_MEMORY_CAPTURE_PATH = "/caregrid/open-memory-capture"

enum class TalkMode {
    IDLE,
    LISTENING,
    THINKING,
    SPEAKING,
    MIC_UNAVAILABLE,
    OFFLINE
}

data class WatchCueUi(
    val id: String = "",
    val cue: String = "Waiting for Lumo cue from SmritiLens.",
    val personName: String = "",
    val relation: String = "",
    val sourceEvent: String = "routine",
    val createdAt: String = "",
    val shouldVibrate: Boolean = false,
    val connected: Boolean = false,
    val lastSynced: String = "Not synced yet"
)

data class TalkUi(
    val mode: TalkMode = TalkMode.IDLE,
    val sessionId: String = "",
    val partial: String = "",
    val lastUser: String = "",
    val lastReply: String = "",
    val recognizer: String = "watch mic"
)

data class TalkReply(
    val transcript: String,
    val reply: String,
    val intent: String,
    val action: String,
    val shouldEndSession: Boolean
)

data class HealthUi(
    val steps: Int = 2840,
    val activeMinutes: Int = 32,
    val heartRate: Int? = null,
    val source: String = "mixed",
    val syncedAt: String = "Not synced yet"
)

class MainActivity : ComponentActivity(), SensorEventListener {
    private val fusedLocation by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val sensorManager by lazy { getSystemService(SensorManager::class.java) }
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speechRecognizer: SpeechRecognizer? = null
    private var recorder: MediaRecorder? = null
    private var recorderFile: File? = null
    private val recorderHandler = Handler(Looper.getMainLooper())
    private val mainHandler = Handler(Looper.getMainLooper())
    private var recorderStopRequested = false
    private var talkActive = false
    private var talkSessionId = ""
    private var talkRequestGeneration = 0
    private var lastCueId: String? = null
    private var latestCueForTalk = WatchCueUi()
    private var afterSpeechDone: (() -> Unit)? = null
    private var latestStepCounter: Float? = null
    private var latestHeartRate: Float? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        ensureLocationPermission()
        ensureHealthPermissions()
        startSensorSampling()
        initSpeech()

        setContent {
            MaterialTheme {
                var cue by remember { mutableStateOf(WatchCueUi()) }
                var status by remember { mutableStateOf("Connecting to CareGrid...") }
                var talk by remember { mutableStateOf(TalkUi()) }
                var health by remember { mutableStateOf(HealthUi()) }
                var showHelpCard by remember { mutableStateOf(false) }

                LaunchedEffect(Unit) {
                    fetchCue(
                        autoSpeak = false,
                        onCue = {
                            cue = it
                            latestCueForTalk = it
                            if (it.shouldShowBystanderHelp()) showHelpCard = true
                        },
                        onStatus = { status = it }
                    )
                    while (true) {
                        delay(4500)
                        if (talk.mode == TalkMode.IDLE) {
                            fetchCue(
                                autoSpeak = false,
                                onCue = {
                                    cue = it
                                    latestCueForTalk = it
                                    if (it.shouldShowBystanderHelp()) showHelpCard = true
                                },
                                onStatus = { status = it }
                            )
                        }
                    }
                }

                LaunchedEffect(Unit) {
                    delay(AUTO_GPS_FIRST_DELAY_MS)
                    while (true) {
                        sendLocationPing(auto = true) { status = it }
                        delay(AUTO_GPS_INTERVAL_MS)
                    }
                }

                WatchScreen(
                    cue = cue,
                    talk = talk,
                    status = status,
                    onTalk = {
                        status = "Talk session started"
                        startTalkSession(
                            updateTalk = { talk = it },
                            updateStatus = { status = it },
                            updateCue = {
                                cue = it
                                latestCueForTalk = it
                            }
                        )
                    },
                    onEndTalk = {
                        stopTalkSession()
                        talk = talk.copy(mode = TalkMode.IDLE, partial = "", recognizer = "watch mic")
                        status = "Talk session ended"
                    },
                    onOk = {
                        vibrate()
                        status = "Check-in sent"
                        postJson(
                            path = "/api/watch/checkin",
                            payload = eventJson("ok_checkin", "Rajamma tapped I'm okay on Galaxy Watch."),
                            onStatus = { status = it }
                        )
                    },
                    onNotify = {
                        vibrate(longPattern = true)
                        status = "Caregiver notified"
                        postJson(
                            path = "/api/watch/alert",
                            payload = eventJson("notify_caregiver", "Rajamma tapped notify caregiver on Galaxy Watch."),
                            onStatus = { status = it }
                        )
                    },
                    onGps = {
                        status = "Sending GPS..."
                        sendLocationPing { status = it }
                    },
                    onSos = {
                        vibrate(longPattern = true)
                        status = "SOS requested"
                        sendLocationPing(auto = true) { gpsStatus ->
                            status = "SOS: $gpsStatus"
                        }
                        postJson(
                            path = "/api/sos",
                            payload = eventJson("notify_caregiver", "SOS tapped on Galaxy Watch. Send SMS/call to caregiver."),
                            onStatus = { status = it }
                        )
                    },
                    onCue = {
                        status = "Asking Lumo..."
                        val frontPersonQuestion = "who is in front of me"
                        talkActive = true
                        talkRequestGeneration += 1
                        if (talkSessionId.isBlank()) talkSessionId = "watch_talk_${System.currentTimeMillis()}"
                        talk = TalkUi(
                            mode = TalkMode.THINKING,
                            sessionId = talkSessionId,
                            lastUser = frontPersonQuestion,
                            partial = "Asking Lumo to check the phone camera...",
                            recognizer = "button"
                        )
                        postTextTalk(
                            transcript = frontPersonQuestion,
                            updateTalk = { talk = it },
                            updateStatus = { status = it },
                            updateCue = {
                                cue = it
                                latestCueForTalk = it
                                if (it.shouldShowBystanderHelp()) showHelpCard = true
                            },
                        )
                    },
                    onSpeak = {
                        vibrate()
                        speak(cue.cue)
                    },
                    onAck = {
                        vibrate()
                        status = "Alert acknowledged"
                        postJson(
                            path = "/api/watch/alert",
                            payload = eventJson("alert_acknowledged", "Wandering alert acknowledged on Galaxy Watch."),
                            onStatus = { status = it }
                        )
                    },
                    health = health,
                    showHelpCard = showHelpCard,
                    rescueUrl = BuildConfig.CAREGRID_API_BASE.trimEnd('/') + "/rescue/" + BuildConfig.PATIENT_ID,
                    onToggleHelp = { showHelpCard = !showHelpCard },
                    onHealth = {
                        status = "Syncing health..."
                        syncHealth(
                            onHealth = { health = it },
                            onStatus = { status = it }
                        )
                    }
                )
            }
        }
    }

    override fun onDestroy() {
        stopTalkSession()
        stopSpeechRecognizer()
        tts?.stop()
        tts?.shutdown()
        tts = null
        sensorManager.unregisterListener(this)
        super.onDestroy()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        when (event?.sensor?.type) {
            Sensor.TYPE_STEP_COUNTER -> latestStepCounter = event.values.firstOrNull()
            Sensor.TYPE_HEART_RATE -> latestHeartRate = event.values.firstOrNull()?.takeIf { it > 0f }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun initSpeech() {
        tts = TextToSpeech(this) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                tts?.language = Locale.forLanguageTag("en-IN")
                tts?.setSpeechRate(0.86f)
                tts?.setPitch(0.96f)
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit

                    override fun onDone(utteranceId: String?) {
                        runOnUiThread {
                            val callback = afterSpeechDone
                            afterSpeechDone = null
                            callback?.invoke()
                        }
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        runOnUiThread {
                            val callback = afterSpeechDone
                            afterSpeechDone = null
                            callback?.invoke()
                        }
                    }
                })
            }
        }
    }

    private fun speak(text: String, onDone: (() -> Unit)? = null) {
        if (!ttsReady) {
            onDone?.invoke()
            return
        }
        afterSpeechDone = onDone
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "lumo_${System.currentTimeMillis()}")
    }

    private fun ensureAudioPermission(onDenied: (() -> Unit)? = null): Boolean {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            return true
        }
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), AUDIO_PERMISSION_REQUEST)
        onDenied?.invoke()
        return false
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    private fun ensureLocationPermission() {
        if (hasLocationPermission()) return
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            LOCATION_PERMISSION_REQUEST
        )
    }

    private fun isSystemLocationEnabled(): Boolean {
        val manager = getSystemService(LOCATION_SERVICE) as? LocationManager ?: return true
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            manager.isLocationEnabled
        } else {
            @Suppress("DEPRECATION")
            manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }
    }

    private fun ensureHealthPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACTIVITY_RECOGNITION), ACTIVITY_PERMISSION_REQUEST)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BODY_SENSORS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.BODY_SENSORS), BODY_PERMISSION_REQUEST)
        }
    }

    private fun startSensorSampling() {
        val stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
        ) {
            stepSensor?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        }
        val heartSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED) {
            heartSensor?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        }
    }

    private fun startTalkSession(
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ) {
        if (!ensureAudioPermission {
                updateTalk(TalkUi(mode = TalkMode.MIC_UNAVAILABLE, lastReply = "Allow microphone permission, then tap Talk to Lumo again."))
                updateStatus("Mic permission needed")
            }) return

        talkActive = true
        talkRequestGeneration += 1
        talkSessionId = if (talkSessionId.isBlank()) "watch_talk_${System.currentTimeMillis()}" else talkSessionId
        updateTalk(TalkUi(mode = TalkMode.LISTENING, sessionId = talkSessionId, lastReply = "Listening. Pause after speaking."))
        updateStatus("Listening")
        startRecordingTurn(updateTalk, updateStatus, updateCue)
    }

    private fun stopTalkSession() {
        talkActive = false
        talkRequestGeneration += 1
        stopSpeechRecognizer()
        stopRecorder(deleteFile = true)
        tts?.stop()
        afterSpeechDone = null
        talkSessionId = ""
    }

    private fun startRecordingTurn(
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ) {
        if (!talkActive) return
        if (!ensureAudioPermission {
                updateTalk(TalkUi(mode = TalkMode.MIC_UNAVAILABLE, sessionId = talkSessionId, lastReply = "Microphone permission is not enabled."))
                updateStatus("Mic unavailable")
            }) return

        tts?.stop()
        // Wear OS Google/Samsung SpeechRecognizer is flaky on hotspot (network/client errors immediately).
        // Prefer on-device mic → /api/watch/talk-audio (Gemini). Keep STT code for optional use later.
        startDirectAudioTurn(updateTalk, updateStatus, updateCue)
    }

    private fun startSpeechRecognizerTurn(
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ): Boolean {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return false

        stopSpeechRecognizer()
        stopRecorder(deleteFile = true)

        return try {
            val recognizer = SpeechRecognizer.createSpeechRecognizer(this)
            speechRecognizer = recognizer
            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    updateTalk(TalkUi(mode = TalkMode.LISTENING, sessionId = talkSessionId, lastReply = "Listening now. Speak one short sentence.", recognizer = "Android speech"))
                    updateStatus("Listening")
                }

                override fun onBeginningOfSpeech() {
                    updateTalk(TalkUi(mode = TalkMode.LISTENING, sessionId = talkSessionId, partial = "Listening...", recognizer = "Android speech"))
                }

                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit

                override fun onEndOfSpeech() {
                    updateTalk(TalkUi(mode = TalkMode.THINKING, sessionId = talkSessionId, partial = "Sending to Lumo...", recognizer = "Android speech"))
                    updateStatus("Thinking")
                }

                override fun onError(error: Int) {
                    stopSpeechRecognizer()
                    if (!talkActive) return
                    val retry = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH,
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I did not catch the words. Please say one short sentence."
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The microphone is busy. I will try again."
                        else -> "The watch speech service had trouble. I will try another listening method."
                    }
                    updateTalk(TalkUi(mode = TalkMode.SPEAKING, sessionId = talkSessionId, lastReply = retry, recognizer = "Android speech"))
                    updateStatus("Speech service: ${speechErrorName(error)}")
                    speak(retry) {
                        if (!talkActive) return@speak
                        if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
                            startRecordingTurn(updateTalk, updateStatus, updateCue)
                        } else {
                            startDirectAudioTurn(updateTalk, updateStatus, updateCue)
                        }
                    }
                }

                override fun onResults(results: Bundle?) {
                    val transcript = results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        ?.trim()
                        .orEmpty()
                    stopSpeechRecognizer()
                    if (!talkActive) return
                    if (transcript.isBlank()) {
                        val retry = "I did not catch the words. Please say one short sentence."
                        updateTalk(TalkUi(mode = TalkMode.SPEAKING, sessionId = talkSessionId, lastReply = retry, recognizer = "Android speech"))
                        updateStatus("Listening again soon")
                        speak(retry) {
                            if (talkActive) startRecordingTurn(updateTalk, updateStatus, updateCue)
                        }
                        return
                    }
                    updateTalk(TalkUi(mode = TalkMode.THINKING, sessionId = talkSessionId, lastUser = transcript, partial = "Sending to Lumo...", recognizer = "Android speech"))
                    updateStatus("Thinking")
                    postTextTalk(transcript, updateTalk, updateStatus, updateCue)
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val partial = partialResults
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        ?.trim()
                        .orEmpty()
                    if (partial.isNotBlank()) {
                        updateTalk(TalkUi(mode = TalkMode.LISTENING, sessionId = talkSessionId, partial = partial, recognizer = "Android speech"))
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 800L)
                putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to Lumo")
            }
            recognizer.startListening(intent)
            updateTalk(TalkUi(mode = TalkMode.LISTENING, sessionId = talkSessionId, lastReply = "Listening now. Speak one short sentence.", recognizer = "Android speech"))
            updateStatus("Listening")
            true
        } catch (_: Exception) {
            stopSpeechRecognizer()
            false
        }
    }

    private fun startDirectAudioTurn(
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ) {
        stopRecorder(deleteFile = true)

        // MPEG_4 + AAC → audio/mp4 is more reliable for Gemini than raw AAC_ADTS.
        val file = File(cacheDir, "lumo_watch_${System.currentTimeMillis()}.m4a")
        try {
            val builtRecorder = buildRecorder(file, MediaRecorder.AudioSource.MIC)
                ?: buildRecorder(file, MediaRecorder.AudioSource.VOICE_RECOGNITION)
                ?: throw IllegalStateException("Recorder unavailable")
            recorder = builtRecorder
            recorderFile = file
            recorderStopRequested = false
            builtRecorder.start()
            vibrate(false)
            updateTalk(
                TalkUi(
                    mode = TalkMode.LISTENING,
                    sessionId = talkSessionId,
                    lastReply = "Listening 7 seconds. Speak now, close to the watch.",
                    recognizer = "watch mic"
                )
            )
            updateStatus("Listening 7s (watch mic)")
            recorderHandler.postDelayed(
                { finishRecordingTurn(updateTalk = updateTalk, updateStatus = updateStatus, updateCue = updateCue) },
                TURN_RECORD_MS
            )
        } catch (_: Exception) {
            stopRecorder(deleteFile = true)
            updateTalk(TalkUi(mode = TalkMode.MIC_UNAVAILABLE, sessionId = talkSessionId, lastReply = "The watch microphone could not start. Check permission, then tap Talk to Lumo again."))
            updateStatus("Mic unavailable")
        }
    }

    @Suppress("DEPRECATION")
    private fun buildRecorder(file: File, audioSource: Int): MediaRecorder? {
        val candidate = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(this)
        } else {
            MediaRecorder()
        }
        return try {
            candidate.setAudioSource(audioSource)
            candidate.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            candidate.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            candidate.setAudioSamplingRate(16000)
            candidate.setAudioEncodingBitRate(96000)
            candidate.setAudioChannels(1)
            candidate.setMaxDuration((TURN_RECORD_MS + 1000).toInt())
            candidate.setOutputFile(file.absolutePath)
            candidate.prepare()
            candidate
        } catch (_: Exception) {
            try {
                candidate.release()
            } catch (_: Exception) {
                // Recorder never fully opened.
            }
            null
        }
    }

    private fun finishRecordingTurn(
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ) {
        if (recorderStopRequested) return
        recorderStopRequested = true
        val file = stopRecorder(deleteFile = false)
        if (!talkActive) {
            file?.delete()
            return
        }

        if (file == null || !file.exists() || file.length() < MIN_AUDIO_FILE_BYTES) {
            file?.delete()
            val retry = "The microphone did not create an audio clip. Please tap Talk again."
            updateTalk(TalkUi(mode = TalkMode.SPEAKING, sessionId = talkSessionId, lastReply = retry, recognizer = "watch mic"))
            updateStatus("Listening again soon")
            speak(retry) {
                if (talkActive) startRecordingTurn(updateTalk, updateStatus, updateCue)
            }
            return
        }

        updateTalk(
            TalkUi(
                mode = TalkMode.THINKING,
                sessionId = talkSessionId,
                lastUser = "Voice captured",
                partial = "Sending audio to Lumo (Gemini)...",
                recognizer = "watch mic"
            )
        )
        updateStatus("Sending audio to Lumo")
        postAudioTalk(file, updateTalk, updateStatus, updateCue)
    }

    private fun stopRecorder(deleteFile: Boolean): File? {
        recorderHandler.removeCallbacksAndMessages(null)
        val activeRecorder = recorder
        val file = recorderFile
        recorder = null
        recorderFile = null
        recorderStopRequested = false
        if (activeRecorder != null) {
            try {
                activeRecorder.stop()
            } catch (_: Exception) {
                // Very short or failed recordings can throw on stop; release still clears the mic.
            }
            try {
                activeRecorder.reset()
                activeRecorder.release()
            } catch (_: Exception) {
                // Nothing else to clean up.
            }
        }
        if (deleteFile) {
            file?.delete()
        }
        return file
    }

    private fun stopSpeechRecognizer() {
        val activeRecognizer = speechRecognizer
        speechRecognizer = null
        if (activeRecognizer != null) {
            try {
                activeRecognizer.cancel()
            } catch (_: Exception) {
                // Recognition service may already be closed.
            }
            try {
                activeRecognizer.destroy()
            } catch (_: Exception) {
                // Nothing else to clean up.
            }
        }
    }

    private fun speechErrorName(error: Int): String {
        return when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "audio error"
            SpeechRecognizer.ERROR_CLIENT -> "client error"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "mic permission"
            SpeechRecognizer.ERROR_NETWORK -> "network error"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network timeout"
            SpeechRecognizer.ERROR_NO_MATCH -> "no match"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "recognizer busy"
            SpeechRecognizer.ERROR_SERVER -> "speech server error"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech timeout"
            else -> "speech error $error"
        }
    }

    private fun postTextTalk(
        transcript: String,
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ) {
        val requestGeneration = talkRequestGeneration
        val requestSessionId = talkSessionId
        Thread {
            try {
                val payload = JSONObject()
                    .put("patient_id", BuildConfig.PATIENT_ID)
                    .put("session_id", talkSessionId)
                    .put("transcript", transcript)
                    .put("latest_cue_id", latestCueForTalk.id)
                    .put("timestamp", nowIso())
                    .toString()
                val url = URL(BuildConfig.CAREGRID_API_BASE.trimEnd('/') + "/api/watch/talk")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = JSON_CONNECT_TIMEOUT_MS
                    readTimeout = JSON_READ_TIMEOUT_MS
                }
                OutputStreamWriter(conn.outputStream).use { it.write(payload) }
                val code = conn.responseCode
                val responseStream = if (code in 200..299) conn.inputStream else conn.errorStream
                val response = responseStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                conn.disconnect()
                if (code !in 200..299) throw IllegalStateException("CareGrid talk returned $code: $response")
                if (!talkActive || requestGeneration != talkRequestGeneration || requestSessionId != talkSessionId) return@Thread
                handleTalkResponse(response, transcript, updateTalk, updateStatus, updateCue)
            } catch (error: Exception) {
                if (!talkActive || requestGeneration != talkRequestGeneration || requestSessionId != talkSessionId) return@Thread
                runOnUiThread {
                    updateTalk(
                        TalkUi(
                            mode = TalkMode.OFFLINE,
                            sessionId = talkSessionId,
                            lastUser = transcript,
                            lastReply = "I could not reach CareGrid right now. ${error.message ?: "Please try again."}"
                        )
                    )
                    updateStatus("Offline")
                }
            }
        }.start()
    }

    private fun postAudioTalk(
        file: File,
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ) {
        val requestGeneration = talkRequestGeneration
        val requestSessionId = talkSessionId
        Thread {
            try {
                val audioBase64 = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
                val payload = JSONObject()
                    .put("patient_id", BuildConfig.PATIENT_ID)
                    .put("session_id", talkSessionId)
                    .put("audio_base64", audioBase64)
                    .put("audio_bytes", file.length())
                    .put("mime_type", WATCH_AUDIO_MIME)
                    .put("latest_cue_id", latestCueForTalk.id)
                    .put("timestamp", nowIso())
                    .toString()
                val url = URL(BuildConfig.CAREGRID_API_BASE.trimEnd('/') + "/api/watch/talk-audio")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = AUDIO_CONNECT_TIMEOUT_MS
                    readTimeout = AUDIO_READ_TIMEOUT_MS
                }
                OutputStreamWriter(conn.outputStream).use { it.write(payload) }
                val code = conn.responseCode
                val responseStream = if (code in 200..299) conn.inputStream else conn.errorStream
                val response = responseStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                conn.disconnect()
                if (code !in 200..299) throw IllegalStateException("CareGrid audio returned $code: $response")
                file.delete()
                if (!talkActive || requestGeneration != talkRequestGeneration || requestSessionId != talkSessionId) return@Thread
                handleTalkResponse(response, "Voice message", updateTalk, updateStatus, updateCue)
            } catch (error: Exception) {
                file.delete()
                if (!talkActive || requestGeneration != talkRequestGeneration || requestSessionId != talkSessionId) return@Thread
                runOnUiThread {
                    updateTalk(
                        TalkUi(
                            mode = TalkMode.OFFLINE,
                            sessionId = talkSessionId,
                            lastUser = "Voice message",
                            lastReply = "I could not finish that CareGrid request. ${error.message ?: "Please try again."}"
                        )
                    )
                    updateStatus("Offline")
                }
            }
        }.start()
    }

    private fun handleTalkResponse(
        response: String,
        fallbackUserText: String,
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ) {
        if (!talkActive) return
        val reply = parseTalkReply(response)
        val heardText = reply.transcript.ifBlank { fallbackUserText }
        runOnUiThread {
            val replyCue = latestCueForTalk.copy(
                id = "talk_${System.currentTimeMillis()}",
                cue = reply.reply,
                sourceEvent = "manual",
                shouldVibrate = false,
                connected = true,
                lastSynced = clockTime()
            )
            latestCueForTalk = replyCue
            updateCue(replyCue)
            updateTalk(
                TalkUi(
                    mode = TalkMode.SPEAKING,
                    sessionId = talkSessionId,
                    lastUser = heardText,
                    lastReply = reply.reply,
                    recognizer = "CareGrid"
                )
            )
            updateStatus("Speaking")
            if (reply.action == "request_camera_frame") {
                openMemoryCaptureOnPhone(updateStatus)
            }
            vibrate()
            speak(reply.reply) {
                if (reply.shouldEndSession || reply.action == "end_session") {
                    stopTalkSession()
                    updateTalk(TalkUi(mode = TalkMode.IDLE, lastUser = heardText, lastReply = reply.reply))
                    updateStatus("Talk ended")
                } else {
                    restartListening(updateTalk, updateStatus, updateCue)
                }
            }
        }
    }

    private fun restartListening(
        updateTalk: (TalkUi) -> Unit,
        updateStatus: (String) -> Unit,
        updateCue: (WatchCueUi) -> Unit
    ) {
        if (!talkActive) return
        updateTalk(TalkUi(mode = TalkMode.LISTENING, sessionId = talkSessionId, lastReply = "Listening again. Speak one short sentence.", recognizer = "watch mic"))
        updateStatus("Listening")
        startRecordingTurn(updateTalk, updateStatus, updateCue)
    }

    private fun parseTalkReply(response: String): TalkReply {
        val root = JSONObject(response)
        val transcript = root.optString("transcript", "")
        val mock = root.optBoolean("_mock", false)
        val defaultReply =
            if (mock && transcript.isBlank()) {
                "I got the audio but CareGrid could not transcribe it. Check Gemini on the server, then try again."
            } else {
                "I heard you. Please say it once more, slowly."
            }
        return TalkReply(
            transcript = transcript,
            reply = root.optString("reply", defaultReply).ifBlank { defaultReply },
            intent = root.optString("intent", "general"),
            action = root.optString("action", "answer_only"),
            shouldEndSession = root.optBoolean("should_end_session", false)
        )
    }

    private fun openMemoryCaptureOnPhone(onStatus: (String) -> Unit) {
        val payload = JSONObject()
            .put("target_path", "/memory-capture?from=watch&auto=1")
            .put("patient_id", BuildConfig.PATIENT_ID)
            .put("requested_at", nowIso())
            .toString()
            .toByteArray(Charsets.UTF_8)

        Wearable.getNodeClient(this).connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    runOnUiThread { onStatus("Phone companion not connected") }
                    return@addOnSuccessListener
                }
                var sent = 0
                nodes.forEach { node ->
                    Wearable.getMessageClient(this)
                        .sendMessage(node.id, OPEN_MEMORY_CAPTURE_PATH, payload)
                        .addOnSuccessListener {
                            sent += 1
                            runOnUiThread { onStatus("Opening phone Memory Guard") }
                        }
                        .addOnFailureListener {
                            runOnUiThread { onStatus("Phone open request failed") }
                        }
                }
            }
            .addOnFailureListener {
                runOnUiThread { onStatus("Could not find paired phone") }
            }
    }

    /**
     * Wear OS often returns null from a bare getCurrentLocation().
     * Chain: current high-accuracy → last known → single location update.
     * Only POST lat/lng when we actually have a fix (endpoint is fine; empty body left SafePath stuck).
     * @see https://developer.android.com/training/wearables/apps/location-detection
     */
    private fun sendLocationPing(auto: Boolean = false, onStatus: (String) -> Unit) {
        if (!hasLocationPermission()) {
            ensureLocationPermission()
            onStatus("Allow Location for CareGrid, then Send GPS again")
            return
        }
        if (!isSystemLocationEnabled()) {
            onStatus("Turn ON Location in watch settings")
            return
        }
        onStatus(if (auto) "Getting GPS fix..." else "Getting GPS fix (may take ~10s)...")

        val cancellation = CancellationTokenSource()
        mainHandler.postDelayed({ cancellation.cancel() }, 12_000L)

        try {
            fusedLocation
                .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
                .addOnSuccessListener { location: Location? ->
                    if (location != null && isUsableLocation(location)) {
                        publishLocationPing(location, auto, onStatus, source = "current")
                    } else {
                        tryLastKnownLocation(auto, onStatus)
                    }
                }
                .addOnFailureListener {
                    tryLastKnownLocation(auto, onStatus)
                }
        } catch (error: SecurityException) {
            onStatus("Location permission missing")
            ensureLocationPermission()
        }
    }

    private fun tryLastKnownLocation(auto: Boolean, onStatus: (String) -> Unit) {
        if (!hasLocationPermission()) {
            onStatus("Location permission missing")
            return
        }
        try {
            fusedLocation.lastLocation
                .addOnSuccessListener { location: Location? ->
                    if (location != null && isUsableLocation(location)) {
                        publishLocationPing(location, auto, onStatus, source = "last")
                    } else {
                        requestSingleLocationUpdate(auto, onStatus)
                    }
                }
                .addOnFailureListener {
                    requestSingleLocationUpdate(auto, onStatus)
                }
        } catch (_: SecurityException) {
            onStatus("Location permission missing")
        }
    }

    private fun requestSingleLocationUpdate(auto: Boolean, onStatus: (String) -> Unit) {
        if (!hasLocationPermission()) {
            onStatus("Location permission missing")
            return
        }
        onStatus("Waiting for GPS satellite fix...")
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1_500L)
            .setMinUpdateIntervalMillis(1_000L)
            .setMaxUpdates(1)
            .setDurationMillis(18_000L)
            .setWaitForAccurateLocation(false)
            .build()

        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                fusedLocation.removeLocationUpdates(this)
                val location = result.lastLocation
                if (location != null && isUsableLocation(location)) {
                    publishLocationPing(location, auto, onStatus, source = "update")
                } else {
                    onStatus("No GPS fix. Go outdoors / wait, then retry Send GPS")
                }
            }
        }

        try {
            fusedLocation.requestLocationUpdates(request, callback, Looper.getMainLooper())
            mainHandler.postDelayed({
                fusedLocation.removeLocationUpdates(callback)
            }, 19_000L)
        } catch (error: SecurityException) {
            onStatus("Location permission missing")
        } catch (error: Exception) {
            onStatus("GPS request failed: ${error.message ?: "unknown"}")
        }
    }

    private fun isUsableLocation(location: Location, allowStale: Boolean = false): Boolean {
        if (!location.latitude.isFinite() || !location.longitude.isFinite()) return false
        if (location.latitude == 0.0 && location.longitude == 0.0) return false
        // Reject ancient cached phone/watch fixes (common Wear FLP issue).
        if (!allowStale) {
            val ageMs = System.currentTimeMillis() - location.time
            // location.time can be 0 on some devices; only enforce when present.
            if (location.time > 0L && ageMs > 3 * 60 * 1000L) return false
            if (location.hasAccuracy() && location.accuracy > 500f) return false
        }
        return true
    }

    private fun publishLocationPing(location: Location, auto: Boolean, onStatus: (String) -> Unit, source: String) {
        val lat = location.latitude
        val lng = location.longitude
        val accuracyM = if (location.hasAccuracy()) location.accuracy.toInt() else -1
        val ageSec = if (location.time > 0L) ((System.currentTimeMillis() - location.time) / 1000L).toInt() else -1
        val accuracy = if (accuracyM >= 0) " ±${accuracyM}m" else ""
        val age = if (ageSec >= 0) " age=${ageSec}s" else ""
        val payload = eventJson(
            type = "location_ping",
            message = if (auto) {
                "Automatic Galaxy Watch GPS geofence ping ($source$age)."
            } else {
                "Galaxy Watch GPS ping ($source$age)."
            },
            latitude = lat,
            longitude = lng
        )
        if (!auto) vibrate()
        onStatus(String.format(Locale.US, "GPS %.5f, %.5f%s%s", lat, lng, accuracy, age))
        postJson("/api/watch/location", payload) { httpStatus ->
            onStatus(
                String.format(
                    Locale.US,
                    "SENT %.5f, %.5f%s · %s",
                    lat,
                    lng,
                    accuracy,
                    httpStatus
                )
            )
        }
    }

    private fun syncHealth(onHealth: (HealthUi) -> Unit, onStatus: (String) -> Unit) {
        ensureHealthPermissions()
        startSensorSampling()
        recorderHandler.postDelayed({
            val rawSteps = latestStepCounter?.toInt()
            val steps = rawSteps?.let { if (it > 12000) it % 9000 else it }?.takeIf { it > 0 } ?: 2840
            val heart = latestHeartRate?.toInt()?.takeIf { it in 40..180 } ?: 78
            val mockedFields = mutableListOf<String>()
            if (rawSteps == null) mockedFields.add("steps_today")
            if (latestHeartRate == null) mockedFields.add("latest_heart_rate_bpm")
            mockedFields.addAll(listOf("sleep_minutes", "sleep_quality_label", "resting_heart_rate_bpm", "calories"))
            val source = if (mockedFields.size >= 6) "demo" else "mixed"
            val health = HealthUi(
                steps = steps,
                activeMinutes = 32,
                heartRate = heart,
                source = source,
                syncedAt = clockTime()
            )
            val payload = JSONObject()
                .put("id", "watch_health_${System.currentTimeMillis()}")
                .put("patient_id", BuildConfig.PATIENT_ID)
                .put("steps_today", steps)
                .put("distance_m", (steps * 0.68).toInt())
                .put("active_minutes", 32)
                .put("latest_heart_rate_bpm", heart)
                .put("resting_heart_rate_bpm", 72)
                .put("sleep_minutes", 385)
                .put("sleep_quality_label", "fair")
                .put("calories", 1460)
                .put("source", source)
                .put("mocked_fields", org.json.JSONArray(mockedFields))
                .put("captured_at", nowIso())
                .toString()
            onHealth(health)
            vibrate()
            postJson("/api/watch/health", payload, onStatus)
        }, 1200)
    }

    private fun eventJson(type: String, message: String, latitude: Double? = null, longitude: Double? = null): String {
        val json = JSONObject()
            .put("id", "wear_${System.currentTimeMillis()}")
            .put("patient_id", BuildConfig.PATIENT_ID)
            .put("type", type)
            .put("timestamp", nowIso())
            .put("message", message)
        if (latitude != null && longitude != null) {
            json.put("latitude", latitude)
            json.put("longitude", longitude)
        }
        return json.toString()
    }

    private fun postJson(path: String, payload: String, onStatus: (String) -> Unit) {
        Thread {
            try {
                val url = URL(BuildConfig.CAREGRID_API_BASE.trimEnd('/') + path)
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = JSON_CONNECT_TIMEOUT_MS
                    // SOS/notify waits for Twilio SMS+call.
                    readTimeout = if (path.contains("/alert") || path.contains("/sos")) 45000 else JSON_READ_TIMEOUT_MS
                }
                OutputStreamWriter(conn.outputStream).use { it.write(payload) }
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                conn.disconnect()
                val summary = summarizeCareGridResponse(path, code, body)
                runOnUiThread { onStatus(summary) }
            } catch (error: Exception) {
                runOnUiThread { onStatus("CareGrid request failed: ${error.message ?: "check network"}") }
            }
        }.start()
    }

    private fun summarizeCareGridResponse(path: String, code: Int, body: String): String {
        if (code !in 200..299) return "CareGrid returned $code"
        return try {
            val json = JSONObject(body)
            val message = json.optString("message").trim()
            val delivery = json.optJSONObject("sos_delivery")
            if (delivery != null && (path.contains("/alert") || path.contains("/sos") || path.contains("/location"))) {
                val sms = delivery.optString("sms", "?")
                val call = delivery.optString("call", "?")
                val err = delivery.optString("error", "")
                val core = if (message.isNotBlank()) message else "CareGrid updated"
                if (err.isNotBlank() && sms != "sent" && call != "sent") {
                    "$core · $err"
                } else {
                    "$core · sms=$sms call=$call"
                }
            } else if (message.isNotBlank()) {
                message
            } else {
                "CareGrid updated ${clockTime()}"
            }
        } catch (_: Exception) {
            "CareGrid updated ${clockTime()}"
        }
    }

    private fun fetchCue(autoSpeak: Boolean, onCue: (WatchCueUi) -> Unit, onStatus: (String) -> Unit) {
        Thread {
            try {
                val url = URL(BuildConfig.CAREGRID_API_BASE.trimEnd('/') + "/api/watch/cue")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = CUE_CONNECT_TIMEOUT_MS
                    readTimeout = CUE_READ_TIMEOUT_MS
                    setRequestProperty("Cache-Control", "no-cache")
                }
                val response = conn.inputStream.bufferedReader().use { it.readText() }
                conn.disconnect()
                val parsed = parseCue(response)
                val firstCue = lastCueId == null
                val isNewCue = parsed.id.isNotBlank() && parsed.id != lastCueId
                lastCueId = parsed.id.ifBlank { lastCueId }
                runOnUiThread {
                    onCue(parsed)
                    onStatus("Synced ${parsed.lastSynced}")
                    if (autoSpeak || (isNewCue && !firstCue && parsed.shouldVibrate)) {
                        vibrate()
                        speak(parsed.cue)
                    }
                }
            } catch (_: Exception) {
                runOnUiThread { onStatus("Cannot reach CareGrid") }
            }
        }.start()
    }

    private fun parseCue(response: String): WatchCueUi {
        val root = JSONObject(response)
        val cueObject = root.optJSONObject("watch_cue")
        val cueText = cueObject?.optString("cue")?.takeIf { it.isNotBlank() }
            ?: root.optString("cue", "Lumo is waiting for the latest cue.")
        return WatchCueUi(
            id = cueObject?.optString("id").orEmpty(),
            cue = cueText,
            personName = cueObject?.optString("person_name").orEmpty(),
            relation = cueObject?.optString("relation").orEmpty(),
            sourceEvent = cueObject?.optString("source_event", "routine").orEmpty(),
            createdAt = cueObject?.optString("created_at").orEmpty(),
            shouldVibrate = cueObject?.optBoolean("should_vibrate", false) ?: false,
            connected = root.optBoolean("ok", false),
            lastSynced = clockTime()
        )
    }

    private fun WatchCueUi.shouldShowBystanderHelp(): Boolean {
        val text = cue.lowercase(Locale.getDefault())
        return sourceEvent == "safepath" ||
            shouldVibrate && (
                text.contains("outside the safe zone") ||
                    text.contains("bystander") ||
                    text.contains("help card") ||
                    text.contains("show them the screen")
                )
    }

    @Suppress("DEPRECATION")
    private fun vibrate(longPattern: Boolean = false) {
        val vibrator = getSystemService(Vibrator::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val pattern = if (longPattern) longArrayOf(0, 180, 80, 180, 80, 280) else longArrayOf(0, 140, 80, 140)
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } else {
            vibrator.vibrate(if (longPattern) 500 else 180)
        }
    }

    private fun clockTime(): String = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())

    private fun nowIso(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.getDefault()).format(Date())
}

@Composable
fun WatchScreen(
    cue: WatchCueUi,
    talk: TalkUi,
    health: HealthUi,
    status: String,
    showHelpCard: Boolean,
    rescueUrl: String,
    onTalk: () -> Unit,
    onEndTalk: () -> Unit,
    onOk: () -> Unit,
    onNotify: () -> Unit,
    onSos: () -> Unit,
    onGps: () -> Unit,
    onCue: () -> Unit,
    onSpeak: () -> Unit,
    onAck: () -> Unit,
    onToggleHelp: () -> Unit,
    onHealth: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF17130F))
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 14.dp, vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("RememberMe", color = Color(0xFFE9BA66), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Text("Rajamma", color = Color(0xFFFFF8EB), fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text(status, color = Color(0xCCFFF8EB), fontSize = 11.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(10.dp))
        TalkCard(talk)
        Spacer(Modifier.height(8.dp))
        if (showHelpCard) {
            BystanderHelpCard(rescueUrl)
            Spacer(Modifier.height(8.dp))
        }
        CueCard(cue)
        Spacer(Modifier.height(8.dp))
        HealthCard(health)
        Spacer(Modifier.height(10.dp))
        if (talk.mode == TalkMode.IDLE || talk.mode == TalkMode.MIC_UNAVAILABLE || talk.mode == TalkMode.OFFLINE) {
            WatchButton("Talk to Lumo", onTalk)
        } else {
            WatchButton("End talk", onEndTalk)
        }
        WatchButton("Ask who this is", onCue)
        WatchButton("Speak cue", onSpeak)
        WatchButton("I'm okay", onOk)
        WatchButton("Notify caregiver", onNotify)
        WatchButton("SOS SMS + call", onSos)
        WatchButton(if (showHelpCard) "Hide help card" else "Show help card", onToggleHelp)
        WatchButton("Send GPS", onGps)
        WatchButton("Sync health", onHealth)
        WatchButton("Ack alert", onAck)
    }
}

@Composable
fun TalkCard(talk: TalkUi) {
    val label = when (talk.mode) {
        TalkMode.IDLE -> "Tap to talk"
        TalkMode.LISTENING -> "Listening"
        TalkMode.THINKING -> "Thinking"
        TalkMode.SPEAKING -> "Speaking"
        TalkMode.MIC_UNAVAILABLE -> "Mic unavailable"
        TalkMode.OFFLINE -> "Offline"
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0x223F4D7A), RoundedCornerShape(24.dp))
            .padding(12.dp)
    ) {
        Text(label, color = Color(0xFFE9BA66), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        val body = when {
            talk.partial.isNotBlank() -> talk.partial
            talk.lastReply.isNotBlank() -> talk.lastReply
            talk.lastUser.isNotBlank() -> talk.lastUser
            else -> "Say: who is this, where am I, call Ananya, or I am okay."
        }
        Text(body, color = Color(0xFFFFF8EB), fontSize = 12.sp, lineHeight = 16.sp)
        if (talk.lastUser.isNotBlank()) {
            Text("You: ${talk.lastUser}", color = Color(0x99FFF8EB), fontSize = 10.sp)
        }
    }
}

@Composable
fun CueCard(cue: WatchCueUi) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0x24FFFFFF), RoundedCornerShape(24.dp))
            .padding(12.dp)
    ) {
        Text(
            text = if (cue.personName.isNotBlank()) cue.personName else "Lumo cue",
            color = Color(0xFFE9BA66),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
        if (cue.relation.isNotBlank()) {
            Text(cue.relation, color = Color(0xCCFFF8EB), fontSize = 11.sp)
        }
        Text(cue.cue, color = Color(0xFFFFF8EB), fontSize = 13.sp, lineHeight = 17.sp)
        Text(
            text = if (cue.connected) "Live from CareGrid" else "Waiting for sync",
            color = Color(0x99FFF8EB),
            fontSize = 10.sp
        )
    }
}

@Composable
fun HealthCard(health: HealthUi) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0x226F8B78), RoundedCornerShape(24.dp))
            .padding(12.dp)
    ) {
        Text("Watch health", color = Color(0xFFE9BA66), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Text("${health.steps} steps · ${health.activeMinutes} active min", color = Color(0xFFFFF8EB), fontSize = 12.sp)
        Text("Heart ${health.heartRate ?: "--"} bpm · ${health.source}", color = Color(0x99FFF8EB), fontSize = 10.sp)
        Text(health.syncedAt, color = Color(0x99FFF8EB), fontSize = 10.sp)
    }
}

@Composable
fun BystanderHelpCard(rescueUrl: String) {
    val qrBitmap = remember(rescueUrl) { createQrBitmap(rescueUrl, 176) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0x33BC6F55), RoundedCornerShape(24.dp))
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Please help", color = Color(0xFFE9BA66), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Text(
            "My name is Rajamma. I live with mild dementia and may be confused. Please keep me away from traffic and scan this code to notify my caregiver.",
            color = Color(0xFFFFF8EB),
            fontSize = 11.sp,
            lineHeight = 15.sp,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Image(
            bitmap = qrBitmap.asImageBitmap(),
            contentDescription = "CareGrid rescue QR code",
            modifier = Modifier
                .size(126.dp)
                .background(Color.White, RoundedCornerShape(12.dp))
                .padding(8.dp)
        )
        Text("Do not give medicine.", color = Color(0xCCFFF8EB), fontSize = 10.sp, textAlign = TextAlign.Center)
    }
}

@Composable
fun WatchButton(label: String, onClick: () -> Unit) {
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(label, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

fun createQrBitmap(value: String, size: Int): Bitmap {
    val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, size, size)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    for (x in 0 until size) {
        for (y in 0 until size) {
            bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
    return bitmap
}
