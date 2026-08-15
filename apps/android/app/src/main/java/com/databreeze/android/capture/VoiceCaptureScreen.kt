package com.databreeze.android.capture

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.R
import com.databreeze.android.AndroidRuntime
import java.io.File
import java.util.UUID

/** Voice intake uses the platform recognizer and never treats transcript text as server evidence. */
@Composable
fun VoiceCaptureScreen(
    runtime: AndroidRuntime? = null,
    onSave: (String) -> Unit,
    onBack: () -> Unit,
) {
    var transcript by remember { mutableStateOf("") }
    var recordingFile by remember { mutableStateOf<File?>(null) }
    var recorder by remember { mutableStateOf<MediaRecorder?>(null) }
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        runCatching { recorder?.stop() }
        recorder?.release(); recorder = null
        recordingFile?.let { file ->
            runtime?.let { app -> runCatching { EncryptedVoiceArtifactStore(context, app.deviceKeyStore, app.receiptKeyHandle).stage(file.readBytes()) } }
            file.delete()
        }
        recordingFile = null
        transcript = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty()
    }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.voice_capture_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.voice_capture_body))
        Button(
            onClick = {
                if (runtime != null) {
                    val file = File.createTempFile("voice-", ".m4a", context.cacheDir)
                    runCatching {
                        MediaRecorder().apply {
                            setAudioSource(MediaRecorder.AudioSource.MIC)
                            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                            setOutputFile(file.absolutePath); prepare(); start()
                        }.also { recorder = it; recordingFile = file }
                    }
                }
                launcher.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, configuration.locales[0].toLanguageTag())
                })
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.voice_capture_start)) }
        if (transcript.isNotBlank()) {
            Text(transcript, modifier = Modifier.fillMaxWidth())
            Button(onClick = { onSave(transcript) }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.voice_capture_save))
            }
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back_action)) }
    }
}
