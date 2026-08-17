package com.databreeze.android.capture

import android.Manifest
import android.content.Intent
import android.media.MediaRecorder
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.AndroidRuntime
import com.databreeze.android.R
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.CaptureBundleEntity
import com.databreeze.android.storage.CaptureItemEntity
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class VoiceState { IDLE, RECORDING, PAUSED, READY }

/** Foreground, user-initiated voice intake. Audio is encrypted before the screen can save it. */
@Composable
fun VoiceCaptureScreen(
    runtime: AndroidRuntime? = null,
    scope: AccountWorkspaceScope? = null,
    onSave: (String) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    var state by remember { mutableStateOf(VoiceState.IDLE) }
    var recorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var recordingFile by remember { mutableStateOf<File?>(null) }
    var voiceVersionId by remember { mutableStateOf<String?>(null) }
    var transcript by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()

    val transcriptLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        transcript = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty()
        state = if (voiceVersionId != null) VoiceState.READY else VoiceState.IDLE
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) message = null else message = context.getString(R.string.voice_capture_permission_required)
    }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { recorder?.stop() }
            recorder?.release()
            recordingFile?.delete()
        }
    }

    fun startRecording() {
        val file = File.createTempFile("voice-", ".m4a", context.cacheDir)
        runCatching {
            MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setMaxDuration(10 * 60 * 1000)
                setMaxFileSize(20L * 1024L * 1024L)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }.also {
                recorder = it
                recordingFile = file
                state = VoiceState.RECORDING
                message = null
            }
        }.onFailure {
            file.delete()
            message = context.getString(R.string.voice_capture_failed)
        }
    }

    fun stopRecording() {
        val file = recordingFile
        val active = recorder
        recorder = null
        recordingFile = null
        runCatching { active?.stop() }
        active?.release()
        if (file == null || runtime == null) {
            file?.delete()
            state = VoiceState.IDLE
            message = context.getString(R.string.voice_capture_failed)
            return
        }
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val raw = file.takeIf { it.isFile }?.readBytes() ?: error("voice_source_missing")
                file.delete()
                val version = (runtime.voiceArtifactStore
                    ?: EncryptedVoiceArtifactStore(context, runtime.deviceKeyStore, runtime.receiptKeyHandle))
                    .stage(raw, scope)
                val bundleId = java.util.UUID.randomUUID().toString()
                val createdAt = System.currentTimeMillis()
                if (scope != null) {
                    runtime.localStore.saveCaptureBundle(
                        CaptureBundleEntity(
                            accountId = scope.accountId,
                            workspaceId = scope.workspaceId,
                            bundleId = bundleId,
                            kind = "voice",
                            state = CaptureBundleEntity.READY_STATE,
                            dataModeSnapshot = "HYBRID",
                            operationId = bundleId,
                            createdAtEpochMs = createdAt,
                        ),
                    )
                    runtime.localStore.saveCaptureItem(
                        CaptureItemEntity(
                            accountId = scope.accountId,
                            workspaceId = scope.workspaceId,
                            itemId = version.versionId,
                            bundleId = bundleId,
                            ordinal = 0,
                            mediaType = "audio/mp4",
                            appPrivateUri = "app-private://voice/${version.versionId}",
                            byteLength = version.byteSize.toLong(),
                            sha256 = "sha256:${version.contentDigest}",
                            source = "VOICE",
                            durationMs = null,
                            original = true,
                            syncState = CaptureBundleEntity.READY_STATE,
                            createdAtEpochMs = createdAt,
                        ),
                    )
                }
                withContext(Dispatchers.Main) {
                    voiceVersionId = version.versionId
                    state = VoiceState.READY
                    message = context.getString(R.string.voice_capture_saved_securely)
                    transcriptLauncher.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, configuration.locales[0].toLanguageTag())
                        putExtra(RecognizerIntent.EXTRA_PROMPT, context.getString(R.string.voice_capture_transcript_prompt))
                    })
                }
            } catch (_: Exception) {
                file.delete()
                withContext(Dispatchers.Main) {
                    state = VoiceState.IDLE
                    message = context.getString(R.string.voice_capture_failed)
                }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppSectionHeader(
            eyebrow = stringResource(R.string.voice_capture_action),
            title = stringResource(R.string.voice_capture_title),
            description = stringResource(R.string.voice_capture_body),
        )
        AppCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                message?.let { AppStatusBanner(it, error = state == VoiceState.IDLE && voiceVersionId == null) }
                Text(
                    text = when (state) {
                        VoiceState.IDLE -> stringResource(R.string.voice_capture_idle)
                        VoiceState.RECORDING -> stringResource(R.string.voice_capture_recording)
                        VoiceState.PAUSED -> stringResource(R.string.voice_capture_paused)
                        VoiceState.READY -> stringResource(R.string.voice_capture_ready)
                    },
                    style = MaterialTheme.typography.titleMedium,
                )
                when (state) {
                    VoiceState.IDLE -> Button(
                        onClick = { permissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.voice_capture_start)) }
                    VoiceState.RECORDING -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { recorder?.pause(); state = VoiceState.PAUSED }, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.voice_capture_pause))
                        }
                        OutlinedButton(onClick = ::stopRecording, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.voice_capture_stop))
                        }
                    }
                    VoiceState.PAUSED -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { recorder?.resume(); state = VoiceState.RECORDING }, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.voice_capture_resume))
                        }
                        OutlinedButton(onClick = ::stopRecording, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(R.string.voice_capture_stop))
                        }
                    }
                    VoiceState.READY -> Unit
                }
                if (transcript.isNotBlank()) AppStatusBanner(transcript)
                if (state == VoiceState.READY && voiceVersionId != null) {
                    Button(onClick = { onSave(voiceVersionId.orEmpty()) }, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.voice_capture_save))
                    }
                }
            }
        }
        OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.back_action))
        }
    }
}
