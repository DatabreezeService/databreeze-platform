package com.databreeze.android.receipts

import androidx.lifecycle.ViewModel
import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.storage.AccountWorkspaceScope
import java.security.MessageDigest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ReceiptCaptureUiState(
    val cameraPermissionGranted: Boolean = false,
    val destination: ReceiptDestination? = null,
    val scopeAuthorized: Boolean = false,
    val previewReady: Boolean = false,
    val confirmed: Boolean = false,
    val stagedSessionId: String? = null,
    val uploadScheduled: Boolean = false,
    val denyReason: ReceiptCaptureDenyReason? = null,
    val statusMessageKey: String = "receipt_capture_idle",
)

/**
 * Active capture orchestration. CameraX preview is owned by the screen; this ViewModel only
 * applies DDA-040 gates and immutable original staging/upload scheduling.
 */
class ReceiptCaptureViewModel(
    private val scope: AccountWorkspaceScope,
    private val stagingStore: ReceiptStagingStore,
    private val uploadScheduler: ReceiptUploadScheduler,
    private val keyHandle: DeviceKeyHandle,
    private val gate: ReceiptCaptureGate = ReceiptCaptureGate(),
    private val sessionIdFactory: () -> String = { "session-${System.currentTimeMillis()}" },
) : ViewModel() {
    private val _state = MutableStateFlow(ReceiptCaptureUiState())
    val state: StateFlow<ReceiptCaptureUiState> = _state.asStateFlow()

    private var pendingOriginal: ByteArray? = null

    fun updateCameraPermission(granted: Boolean) {
        _state.value = _state.value.copy(cameraPermissionGranted = granted)
        refreshGate()
    }

    fun setDestination(destination: ReceiptDestination?) {
        _state.value = _state.value.copy(destination = destination)
        refreshGate()
    }

    fun setScopeAuthorized(authorized: Boolean) {
        _state.value = _state.value.copy(scopeAuthorized = authorized)
        refreshGate()
    }

    fun onPreviewFrameCaptured(originalBytes: ByteArray) {
        pendingOriginal = originalBytes.copyOf()
        _state.value = _state.value.copy(
            previewReady = true,
            confirmed = false,
            statusMessageKey = "receipt_capture_retake_or_confirm",
        )
    }

    fun retake() {
        pendingOriginal = null
        _state.value = _state.value.copy(
            previewReady = false,
            confirmed = false,
            statusMessageKey = "receipt_capture_idle",
        )
    }

    fun confirmAndUpload(): String? {
        refreshGate()
        val current = _state.value
        if (current.denyReason != null) return null
        val bytes = pendingOriginal ?: return null
        val sessionId = sessionIdFactory()
        val digest = "sha256:${sha256Hex(bytes)}"
        val staged = stagingStore.stage(scope, keyHandle, sessionId, bytes, digest)
        if (!staged.accepted) return null
        val scheduled = uploadScheduler.schedule(
            ReceiptUploadRequest(
                scope = scope,
                artifactSessionId = sessionId,
                contentDigest = digest,
                destination = current.destination,
                uploadedBytes = 0L,
                totalBytes = bytes.size.toLong(),
            ),
        )
        _state.value = current.copy(
            confirmed = true,
            stagedSessionId = sessionId,
            uploadScheduled = scheduled.accepted,
            statusMessageKey = if (scheduled.accepted) {
                "receipt_capture_upload_queued"
            } else {
                "receipt_capture_upload_denied"
            },
        )
        return if (scheduled.accepted) sessionId else null
    }

    private fun refreshGate() {
        val current = _state.value
        _state.value = current.copy(
            denyReason = gate.evaluate(
                cameraPermissionGranted = current.cameraPermissionGranted,
                destination = current.destination,
                scopeAuthorized = current.scopeAuthorized,
            ),
        )
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }
}
