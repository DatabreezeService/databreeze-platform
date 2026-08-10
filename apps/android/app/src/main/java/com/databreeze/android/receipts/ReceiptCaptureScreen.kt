package com.databreeze.android.receipts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.databreeze.android.R

/**
 * Prototype capture surface. CameraX preview is represented as an explicit user-initiated
 * capture action; full CameraX binding is wired when an emulator is available for Task 1.
 */
@Composable
fun ReceiptCaptureScreen(
    viewModel: ReceiptCaptureViewModel,
    onBack: () -> Unit,
    onOpenReview: (String) -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
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
        state.denyReason?.let { reason ->
            Text(
                text = denyMessage(reason),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("receipt-capture-deny"),
            )
        }
        Button(
            onClick = {
                viewModel.updateCameraPermission(true)
                viewModel.onPreviewFrameCaptured(byteArrayOf(10, 20, 30, 40))
            },
            modifier = Modifier
                .testTag("receipt-capture-shutter")
                .semantics { contentDescription = "Capture receipt photo" },
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
