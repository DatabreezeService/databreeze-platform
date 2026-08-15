package com.databreeze.android.receipts

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.ui.Alignment
import androidx.compose.material3.Switch
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.databreeze.android.R
import java.io.File

/** Active, permission-gated CameraX capture. The original stays in memory until encrypted staging. */
@Composable
fun ReceiptCaptureScreen(
    viewModel: ReceiptCaptureViewModel,
    onBack: () -> Unit,
    onOpenReview: (String) -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember(context) { ContextCompat.getMainExecutor(context) }
    val previewView = remember { PreviewView(context) }
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var qualityWarning by remember { mutableStateOf<String?>(null) }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        viewModel.updateCameraPermission(granted)
    }

    LaunchedEffect(context) {
        viewModel.updateCameraPermission(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED,
        )
    }
    DisposableEffect(lifecycleOwner, state.cameraPermissionGranted) {
        if (!state.cameraPermissionGranted) {
            imageCapture = null
            onDispose { Unit }
        } else {
            cameraProviderFuture.addListener(
                {
                    val provider = runCatching { cameraProviderFuture.get() }.getOrNull() ?: return@addListener
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    val capture = ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .build()
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also { it.setAnalyzer(executor, CaptureQualityAnalyzer { qualityWarning = it.warning }) }
                    runCatching {
                        provider.unbindAll()
                        provider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            capture,
                            analysis,
                        )
                    }.onSuccess {
                        imageCapture = capture
                    }
                },
                executor,
            )
            onDispose {
                imageCapture = null
                runCatching { cameraProviderFuture.get().unbindAll() }
            }
        }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("receipt-capture-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = stringResource(R.string.receipt_capture_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = stringResource(R.string.receipt_capture_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        if (state.pageCount > 0) {
            Text(stringResource(R.string.receipt_capture_page_count, state.pageCount))
        }
        if (state.cameraPermissionGranted) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .height(320.dp)
                    .testTag("receipt-capture-preview"),
            ) {
                AndroidView(
                    factory = { previewView },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        qualityWarning?.let { Text("capture_hint_$it", color = MaterialTheme.colorScheme.error) }
        state.denyReason?.let { reason ->
            Text(
                text = denyMessage(reason),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("receipt-capture-deny"),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(
                checked = state.transferPolicy.wifiOnly,
                onCheckedChange = { enabled -> viewModel.setTransferPolicy(state.transferPolicy.copy(wifiOnly = enabled)) },
            )
            Text(stringResource(R.string.receipt_capture_wifi_only))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(
                checked = state.transferPolicy.requiresCharging,
                onCheckedChange = { enabled -> viewModel.setTransferPolicy(state.transferPolicy.copy(requiresCharging = enabled)) },
            )
            Text(stringResource(R.string.receipt_capture_requires_charging))
        }
        val shutterDescription = stringResource(R.string.receipt_capture_shutter_description)
        Button(
            onClick = {
                if (!state.cameraPermissionGranted) {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                } else {
                    // Use CameraX's native JPEG output. Converting ImageProxy YUV planes in the
                    // app would be a lossy replacement of the immutable original (AND-004).
                    val outputFile = runCatching {
                        File.createTempFile("capture-", ".jpg", context.cacheDir)
                    }.getOrNull()
                    if (outputFile != null) {
                        val output = ImageCapture.OutputFileOptions.Builder(outputFile).build()
                        imageCapture?.takePicture(
                            output,
                            executor,
                            object : ImageCapture.OnImageSavedCallback {
                                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                                    runCatching { outputFile.readBytes() }
                                        .getOrNull()
                                        ?.takeIf { it.isNotEmpty() }
                                        ?.let(viewModel::onPreviewFrameCaptured)
                                    outputFile.delete()
                                }

                                override fun onError(exception: ImageCaptureException) {
                                    outputFile.delete()
                                }
                            },
                        )
                    }
                }
            },
            modifier = Modifier
                .testTag("receipt-capture-shutter")
                .semantics { contentDescription = shutterDescription },
            enabled = state.denyReason == null ||
                state.denyReason == ReceiptCaptureDenyReason.CAMERA_PERMISSION_MISSING,
        ) {
            Text(stringResource(R.string.receipt_capture_shutter))
        }
        if (state.previewReady) {
            Button(
                onClick = { viewModel.retake() },
                modifier = Modifier.testTag("receipt-capture-retake"),
            ) {
                Text(stringResource(R.string.receipt_capture_retake))
            }
            Button(
                onClick = { viewModel.addPage() },
                modifier = Modifier.testTag("receipt-capture-add-page"),
            ) {
                Text(stringResource(R.string.receipt_capture_add_page))
            }
            Button(
                onClick = {
                    viewModel.confirmAndUpload()?.let(onOpenReview)
                },
                modifier = Modifier.testTag("receipt-capture-confirm"),
            ) {
                Text(stringResource(R.string.receipt_capture_confirm))
            }
        }
        if (state.uploadScheduled) {
            Text(
                text = stringResource(R.string.receipt_capture_upload_queued),
                modifier = Modifier.testTag("receipt-capture-queued"),
            )
        }
        Button(onClick = onBack, modifier = Modifier.testTag("receipt-capture-back")) {
            Text(stringResource(R.string.back_action))
        }
    }
}

@Composable
private fun denyMessage(reason: ReceiptCaptureDenyReason): String = when (reason) {
    ReceiptCaptureDenyReason.CAMERA_PERMISSION_MISSING ->
        stringResource(R.string.receipt_capture_need_camera)
    ReceiptCaptureDenyReason.MISSING_DESTINATION ->
        stringResource(R.string.receipt_capture_need_destination)
    ReceiptCaptureDenyReason.STRICT_LOCAL_DESTINATION ->
        stringResource(R.string.receipt_capture_strict_local_blocked)
    ReceiptCaptureDenyReason.SCOPE_UNAUTHORIZED ->
        stringResource(R.string.receipt_capture_scope_blocked)
}
