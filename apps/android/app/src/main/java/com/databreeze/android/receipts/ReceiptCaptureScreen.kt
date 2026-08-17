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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.ui.draw.clip
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
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Active, permission-gated CameraX capture. Each shutter result is staged before it is shown as a page. */
@Composable
fun ReceiptCaptureScreen(
    viewModel: ReceiptCaptureViewModel,
    workspaceGrantId: String = "",
    onBack: () -> Unit,
    onOpenReview: (String) -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember(context) { ContextCompat.getMainExecutor(context) }
    val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()
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
            .padding(horizontal = 20.dp, vertical = 18.dp)
            .testTag("receipt-capture-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        AppSectionHeader(
            eyebrow = stringResource(R.string.receipt_capture_action),
            title = stringResource(R.string.receipt_capture_title),
            description = stringResource(R.string.receipt_capture_body),
        )
        if (state.pageCount > 0) {
            AppStatusBanner(stringResource(R.string.receipt_capture_page_count, state.pageCount))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(state.pageOrder) { index, pageNumber ->
                    AppCard {
                        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(stringResource(R.string.receipt_capture_page, pageNumber), style = MaterialTheme.typography.labelLarge)
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                androidx.compose.material3.OutlinedButton(
                                    onClick = { viewModel.movePage(index, index - 1) },
                                    enabled = index > 0,
                                ) { Text("↑") }
                                androidx.compose.material3.OutlinedButton(
                                    onClick = { viewModel.movePage(index, index + 1) },
                                    enabled = index < state.pageOrder.lastIndex,
                                ) { Text("↓") }
                                androidx.compose.material3.OutlinedButton(onClick = { viewModel.removePage(index) }) {
                                    Text(stringResource(R.string.receipt_capture_remove_page))
                                }
                            }
                        }
                    }
                }
            }
        }
        if (state.cameraPermissionGranted) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(320.dp)
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(20.dp))
                    .testTag("receipt-capture-preview"),
            ) {
                AndroidView(
                    factory = { previewView },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        qualityWarning?.let { warning ->
            val text = when (warning) {
                "blur_likely" -> stringResource(R.string.receipt_capture_hint_blur)
                "glare_likely" -> stringResource(R.string.receipt_capture_hint_glare)
                "focus_likely" -> stringResource(R.string.receipt_capture_hint_focus)
                else -> stringResource(R.string.receipt_capture_hint_generic)
            }
            AppStatusBanner(text, error = true)
        }
        state.denyReason?.let { reason ->
            AppStatusBanner(denyMessage(reason), error = true, modifier = Modifier.testTag("receipt-capture-deny"))
        }
        AppCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.receipt_capture_data_mode), style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.OutlinedButton(
                        onClick = { viewModel.setDestination(ReceiptDestination.Hybrid(workspaceGrantId)) },
                        enabled = workspaceGrantId.isNotBlank(),
                    ) { Text(stringResource(R.string.receipt_capture_hybrid)) }
                    androidx.compose.material3.OutlinedButton(
                        onClick = { viewModel.setDestination(ReceiptDestination.StrictLocal) },
                    ) { Text(stringResource(R.string.receipt_capture_local)) }
                }
            }
        }
        AppCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
            }
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
                                    coroutineScope.launch(Dispatchers.IO) {
                                        try {
                                            runCatching { outputFile.readBytes() }
                                                .getOrNull()
                                                ?.takeIf { it.isNotEmpty() }
                                                ?.let(viewModel::onPreviewFrameCaptured)
                                        } finally {
                                            outputFile.delete()
                                        }
                                    }
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
        if (state.statusMessageKey == "receipt_capture_local_ready") {
            AppStatusBanner(stringResource(R.string.receipt_capture_local_ready))
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
