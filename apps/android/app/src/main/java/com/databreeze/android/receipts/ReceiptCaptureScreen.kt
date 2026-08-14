package com.databreeze.android.receipts

import android.Manifest
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import java.io.ByteArrayOutputStream

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
                    runCatching {
                        provider.unbindAll()
                        provider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            capture,
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
        state.denyReason?.let { reason ->
            Text(
                text = denyMessage(reason),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("receipt-capture-deny"),
            )
        }
        val shutterDescription = stringResource(R.string.receipt_capture_shutter_description)
        Button(
            onClick = {
                if (!state.cameraPermissionGranted) {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                } else {
                    imageCapture?.takePicture(
                        executor,
                        object : ImageCapture.OnImageCapturedCallback() {
                            override fun onCaptureSuccess(image: ImageProxy) {
                                try {
                                    image.toJpegBytes()?.let(viewModel::onPreviewFrameCaptured)
                                } finally {
                                    image.close()
                                }
                            }
                        },
                    )
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

private fun ImageProxy.toJpegBytes(): ByteArray? {
    if (format != ImageFormat.YUV_420_888 || planes.size != 3) return null
    val nv21 = ByteArray(width * height * 3 / 2)
    copyPlane(planes[0], width, height, nv21, 0)
    copyChromaPlanes(
        vPlane = planes[2],
        uPlane = planes[1],
        width = width / 2,
        height = height / 2,
        output = nv21,
        outputOffset = width * height,
    )
    return ByteArrayOutputStream().use { output ->
        val encoded = YuvImage(nv21, ImageFormat.NV21, width, height, null)
            .compressToJpeg(Rect(0, 0, width, height), 100, output)
        output.toByteArray().takeIf { encoded }
    }
}

private fun copyChromaPlanes(
    vPlane: ImageProxy.PlaneProxy,
    uPlane: ImageProxy.PlaneProxy,
    width: Int,
    height: Int,
    output: ByteArray,
    outputOffset: Int,
) {
    val vBuffer = vPlane.buffer
    val uBuffer = uPlane.buffer
    var offset = outputOffset
    for (row in 0 until height) {
        val vRowStart = row * vPlane.rowStride
        val uRowStart = row * uPlane.rowStride
        for (column in 0 until width) {
            output[offset++] = vBuffer.get(vRowStart + column * vPlane.pixelStride)
            output[offset++] = uBuffer.get(uRowStart + column * uPlane.pixelStride)
        }
    }
}

private fun copyPlane(
    plane: ImageProxy.PlaneProxy,
    width: Int,
    height: Int,
    output: ByteArray,
    outputOffset: Int,
) {
    val buffer = plane.buffer
    var offset = outputOffset
    for (row in 0 until height) {
        val rowStart = row * plane.rowStride
        for (column in 0 until width) {
            output[offset++] = buffer.get(rowStart + column * plane.pixelStride)
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
