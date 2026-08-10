package com.databreeze.android.receipts

import com.databreeze.android.security.DeviceKeyHandle
import com.databreeze.android.storage.AccountWorkspaceScope
import java.security.MessageDigest

/**
 * Typed Android boundary for the server-owned receipt intake API.
 *
 * A concrete authenticated client is composed only after the generated intake contract is
 * available. This adapter never substitutes a local OCR result or an unauthenticated upload.
 */
interface ReceiptUploadApiClient {
    suspend fun upload(command: ReceiptArtifactUploadCommand): ReceiptUploadApiResult
}

data class ReceiptArtifactUploadCommand(
    val scope: AccountWorkspaceScope,
    val artifactSessionId: String,
    val contentDigest: String,
    val workspaceGrantId: String,
    val originalBytes: ByteArray,
    val totalBytes: Long,
    val idempotencyKey: String,
)

sealed interface ReceiptUploadApiResult {
    data object Accepted : ReceiptUploadApiResult
    data object Retryable : ReceiptUploadApiResult
    data class Rejected(val code: String) : ReceiptUploadApiResult
}

/** Production-safe placeholder until authenticated generated API bindings are supplied. */
class FailClosedReceiptUploadApiClient : ReceiptUploadApiClient {
    override suspend fun upload(command: ReceiptArtifactUploadCommand): ReceiptUploadApiResult =
        ReceiptUploadApiResult.Rejected("receipt_upload_client_not_configured")
}

/**
 * Rehydrates only the encrypted scope-bound original immediately before upload, verifies it
 * against its staging metadata, and supplies a deterministic opaque idempotency key.
 */
class StagedReceiptUploadTransport(
    private val stagingStore: ReceiptStagingStore,
    private val keyHandle: DeviceKeyHandle,
    private val apiClient: ReceiptUploadApiClient,
) : ReceiptUploadTransport {
    override suspend fun upload(request: ReceiptUploadRequest): ReceiptUploadTransportResult {
        val workspaceGrantId = request.destination.workspaceGrantIdOrNull()
            ?: return ReceiptUploadTransportResult.Rejected("upload_destination_not_authorized")
        val metadata = stagingStore.metadata(request.scope, request.artifactSessionId)
            ?: return ReceiptUploadTransportResult.Rejected("staged_metadata_missing")
        if (metadata.contentDigest != request.contentDigest || metadata.byteLength.toLong() != request.totalBytes) {
            return ReceiptUploadTransportResult.Rejected("staged_metadata_mismatch")
        }
        val original = stagingStore.loadOriginal(request.scope, keyHandle, request.artifactSessionId)
            ?: return ReceiptUploadTransportResult.Rejected("staged_original_missing")
        if (original.size.toLong() != request.totalBytes || contentDigest(original) != request.contentDigest) {
            return ReceiptUploadTransportResult.Rejected("staged_original_mismatch")
        }
        return apiClient.upload(
            ReceiptArtifactUploadCommand(
                scope = request.scope,
                artifactSessionId = request.artifactSessionId,
                contentDigest = request.contentDigest,
                workspaceGrantId = workspaceGrantId,
                originalBytes = original,
                totalBytes = request.totalBytes,
                idempotencyKey = idempotencyKey(request),
            ),
        ).toTransportResult()
    }

    private fun contentDigest(bytes: ByteArray): String =
        "sha256:${MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }}"

    private fun idempotencyKey(request: ReceiptUploadRequest): String {
        val stableInput =
            "${request.scope.stableKey}\u0000${request.artifactSessionId}\u0000${request.contentDigest}"
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(stableInput.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return "receipt-upload-$digest"
    }
}

private fun ReceiptDestination?.workspaceGrantIdOrNull(): String? = when (this) {
    is ReceiptDestination.Hybrid -> workspaceGrantId
    is ReceiptDestination.Cloud -> workspaceGrantId
    ReceiptDestination.StrictLocal, null -> null
}

private fun ReceiptUploadApiResult.toTransportResult(): ReceiptUploadTransportResult = when (this) {
    ReceiptUploadApiResult.Accepted -> ReceiptUploadTransportResult.Accepted
    ReceiptUploadApiResult.Retryable -> ReceiptUploadTransportResult.Retryable
    is ReceiptUploadApiResult.Rejected -> ReceiptUploadTransportResult.Rejected(code)
}
