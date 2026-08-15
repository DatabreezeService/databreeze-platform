package com.databreeze.android.receipts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.CaptureBundleEntity
import com.databreeze.android.storage.CaptureItemEntity
import com.databreeze.android.storage.LocalStorePort
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ReceiptCaptureUiState(
    val cameraPermissionGranted: Boolean = false,
    val destination: ReceiptDestination? = null,
    val scopeAuthorized: Boolean = false,
    val previewReady: Boolean = false,
    val pageCount: Int = 0,
    val pageOrder: List<Int> = emptyList(),
    val transferPolicy: ReceiptTransferPolicy = ReceiptTransferPolicy(),
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
    private val localStore: LocalStorePort? = null,
    private val deviceId: String? = null,
    private val gate: ReceiptCaptureGate = ReceiptCaptureGate(),
    /** IAE identifiers are server-side stable UUIDs; never use timestamps as resource IDs. */
    private val sessionIdFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _state = MutableStateFlow(ReceiptCaptureUiState())
    val state: StateFlow<ReceiptCaptureUiState> = _state.asStateFlow()

    private data class PendingPage(
        val itemId: String,
        val sessionId: String,
        val contentDigest: String,
        val byteLength: Long,
    )

    private val pendingPages = mutableListOf<PendingPage>()
    private var bundleId: String? = null

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

    fun setTransferPolicy(policy: ReceiptTransferPolicy) {
        _state.value = _state.value.copy(transferPolicy = policy)
    }

    fun onPreviewFrameCaptured(originalBytes: ByteArray) {
        if (originalBytes.isEmpty()) return
        val sessionId = sessionIdFactory()
        val digest = "sha256:${sha256Hex(originalBytes)}"
        val staged = stagingStore.stage(scope, keyHandle, sessionId, originalBytes, digest)
        if (!staged.accepted) {
            _state.value = _state.value.copy(statusMessageKey = "receipt_capture_staging_failed")
            return
        }
        val currentBundleId = bundleId ?: sessionIdFactory().also { bundleId = it }
        val item = PendingPage(
            itemId = sessionIdFactory(),
            sessionId = sessionId,
            contentDigest = digest,
            byteLength = originalBytes.size.toLong(),
        )
        pendingPages += item
        localStore?.let { store ->
            val now = System.currentTimeMillis()
            viewModelScope.launch {
                store.saveCaptureBundle(
                    CaptureBundleEntity(
                        accountId = scope.accountId,
                        workspaceId = scope.workspaceId,
                        bundleId = currentBundleId,
                        kind = "receipt",
                        state = CaptureBundleEntity.DRAFT_STATE,
                        dataModeSnapshot = currentDataMode(),
                        operationId = currentBundleId,
                        createdAtEpochMs = now,
                    ),
                )
                store.saveCaptureItem(
                    CaptureItemEntity(
                        accountId = scope.accountId,
                        workspaceId = scope.workspaceId,
                        itemId = item.itemId,
                        bundleId = currentBundleId,
                        ordinal = pendingPages.lastIndex,
                        mediaType = "image/jpeg",
                        appPrivateUri = "app-private://receipt/${item.sessionId}",
                        byteLength = item.byteLength,
                        sha256 = item.contentDigest,
                        source = "CAMERA",
                        original = true,
                        syncState = CaptureBundleEntity.DRAFT_STATE,
                        createdAtEpochMs = now,
                    ),
                )
            }
        }
        _state.value = _state.value.copy(
            previewReady = true,
            confirmed = false,
            pageCount = pendingPages.size,
            pageOrder = pendingPages.indices.map { it + 1 },
            statusMessageKey = "receipt_capture_retake_or_confirm",
        )
    }

    fun retake() {
        pendingPages.removeLastOrNull()?.let { page ->
            stagingStore.delete(scope, page.sessionId)
            localStore?.let { store ->
                viewModelScope.launch { store.deleteCaptureItem(scope, page.itemId) }
            }
        }
        _state.value = _state.value.copy(
            previewReady = pendingPages.isNotEmpty(),
            confirmed = false,
            pageCount = pendingPages.size,
            pageOrder = pendingPages.indices.map { it + 1 },
            statusMessageKey = "receipt_capture_idle",
        )
    }

    /** Keeps earlier pages and opens the camera for the next page in the same capture batch. */
    fun addPage() {
        _state.value = _state.value.copy(previewReady = false, confirmed = false, statusMessageKey = "receipt_capture_idle")
    }

    fun removePage(index: Int) {
        if (index !in pendingPages.indices) return
        val page = pendingPages.removeAt(index)
        stagingStore.delete(scope, page.sessionId)
        localStore?.let { store -> viewModelScope.launch { store.deleteCaptureItem(scope, page.itemId) } }
        _state.value = _state.value.copy(
            previewReady = pendingPages.isNotEmpty(),
            pageCount = pendingPages.size,
            pageOrder = pendingPages.indices.map { it + 1 },
            confirmed = false,
            statusMessageKey = "receipt_capture_idle",
        )
    }

    fun movePage(fromIndex: Int, toIndex: Int) {
        if (fromIndex !in pendingPages.indices || toIndex !in pendingPages.indices || fromIndex == toIndex) return
        val page = pendingPages.removeAt(fromIndex)
        pendingPages.add(toIndex, page)
        _state.value = _state.value.copy(pageOrder = pendingPages.indices.map { it + 1 }, confirmed = false)
    }

    fun confirmAndUpload(): String? {
        refreshGate()
        val current = _state.value
        if (current.denyReason != null) return null
        if (pendingPages.isEmpty()) return null
        var firstSessionId: String? = null
        val localOnly = current.destination is ReceiptDestination.StrictLocal
        var allScheduled = localOnly
        val capturedPageCount = pendingPages.size
        if (!localOnly) {
            pendingPages.toList().forEach { page ->
                val scheduled = uploadScheduler.schedule(
                    ReceiptUploadRequest(
                        scope = scope,
                        artifactSessionId = page.sessionId,
                        contentDigest = page.contentDigest,
                        destination = current.destination,
                        uploadedBytes = 0L,
                        totalBytes = page.byteLength,
                        policy = current.transferPolicy,
                    ),
                )
                if (scheduled.accepted && firstSessionId == null) firstSessionId = page.sessionId
                else if (!scheduled.accepted) allScheduled = false
            }
        }
        bundleId?.let { id ->
            localStore?.let { store ->
                viewModelScope.launch {
                    store.updateCaptureState(
                        scope,
                        id,
                        when {
                            !allScheduled -> CaptureBundleEntity.FAILED_STATE
                            localOnly -> CaptureBundleEntity.READY_STATE
                            else -> CaptureBundleEntity.QUEUED_STATE
                        },
                    )
                    // A Strict-Local capture is deliberately not admitted to the online
                    // DSO queue. Its only egress is the explicit encrypted package handoff.
                    if (allScheduled && !localOnly && deviceId.orEmpty().isNotBlank()) {
                        val operationId = UUID.randomUUID().toString()
                        val payloadDigest = MessageDigest.getInstance("SHA-256")
                            .digest("capture-bundle:$id:$capturedPageCount".toByteArray(Charsets.UTF_8))
                            .joinToString("") { "%02x".format(it) }
                        runCatching {
                            store.enqueueDeviceOperation(
                                com.databreeze.android.storage.DeviceSyncOperationEntity(
                                    accountId = scope.accountId,
                                    workspaceId = scope.workspaceId,
                                    operationId = operationId,
                                    deviceId = deviceId.orEmpty(),
                                    entityType = "capture_bundle",
                                    entityId = id,
                                    kind = "ACKNOWLEDGE",
                                    payloadClass = "CONTROL_METADATA",
                                    payloadDigest = payloadDigest,
                                    createdAtEpochMs = System.currentTimeMillis(),
                                ),
                            )
                        }
                    }
                }
            }
        }
        pendingPages.clear()
        _state.value = current.copy(
            confirmed = allScheduled,
            stagedSessionId = firstSessionId,
            uploadScheduled = allScheduled && !localOnly && firstSessionId != null,
            statusMessageKey = if (allScheduled && firstSessionId != null) {
                "receipt_capture_upload_queued"
            } else if (allScheduled && localOnly) {
                "receipt_capture_local_ready"
            } else {
                "receipt_capture_upload_denied"
            },
        )
        return firstSessionId.takeIf { allScheduled }
    }

    private fun currentDataMode(): String = when (val destination = _state.value.destination) {
        is ReceiptDestination.Cloud -> "CLOUD"
        is ReceiptDestination.Hybrid -> "HYBRID"
        ReceiptDestination.StrictLocal, null -> "LOCAL"
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
