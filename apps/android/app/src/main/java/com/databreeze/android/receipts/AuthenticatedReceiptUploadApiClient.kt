package com.databreeze.android.receipts

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import java.security.MessageDigest

/**
 * Authenticated resumable receipt upload client.
 *
 * Uses IAE upload control-plane routes with opaque transfer grants and the published contracts v2
 * `dda-receipt-upload` wire envelope. Canonical bytes are streamed only after scope/hash/length
 * checks and are never logged.
 */
class AuthenticatedReceiptUploadApiClient(
    private val transport: AuthenticatedApiTransport,
    private val organizationId: String,
    private val workspaceId: String,
    private val nowIso: () -> String,
) : ReceiptUploadApiClient {
    override suspend fun upload(command: ReceiptArtifactUploadCommand): ReceiptUploadApiResult {
        require(organizationId.isNotEmpty())
        require(workspaceId.isNotEmpty())
        if (command.originalBytes.size.toLong() != command.totalBytes) {
            return ReceiptUploadApiResult.Rejected("upload_length_mismatch")
        }
        val digest = sha256Hex(command.originalBytes)
        val expected = command.contentDigest.removePrefix("sha256:")
        if (digest != expected) {
            return ReceiptUploadApiResult.Rejected("upload_digest_mismatch")
        }

        val sessionId = command.artifactSessionId
        val createBody =
            ReceiptWireEnvelope.createSession(
                organizationId = organizationId,
                workspaceId = workspaceId,
                sessionId = sessionId,
                artifactId = sessionId,
                workspaceGrantId = command.workspaceGrantId,
                expectedSha256 = digest,
                expectedByteSize = command.totalBytes,
                idempotencyKey = command.idempotencyKey,
                revision = 1,
                issuedAt = nowIso(),
                expiresAt = nowIso(),
            )

        when (
            transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/artifact-upload-sessions",
                    jsonBody = createBody,
                    idempotencyKey = command.idempotencyKey,
                ),
            )
        ) {
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                return ReceiptUploadApiResult.Rejected("receipt_upload_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> return ReceiptUploadApiResult.Retryable
            is AuthenticatedHttpResult.Success -> Unit
        }

        val transferBody =
            ReceiptWireEnvelope.issuePartTransfer(
                organizationId = organizationId,
                workspaceId = workspaceId,
                sessionId = sessionId,
                partNumber = 1,
                idempotencyKey = "${command.idempotencyKey}:part-1",
                revision = 1,
            )
        val transfer =
            transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/artifact-upload-sessions/$sessionId/parts/transfer",
                    jsonBody = transferBody,
                    idempotencyKey = "${command.idempotencyKey}:part-1",
                ),
            )
        val transferId =
            when (transfer) {
                is AuthenticatedHttpResult.Success ->
                    extractJsonString(transfer.body, "transferId")
                        ?: return ReceiptUploadApiResult.Rejected("transfer_grant_missing")
                is AuthenticatedHttpResult.TerminalAuthFailure ->
                    return ReceiptUploadApiResult.Rejected("receipt_upload_auth_denied")
                is AuthenticatedHttpResult.RetryableFailure,
                is AuthenticatedHttpResult.NetworkFailure,
                -> return ReceiptUploadApiResult.Retryable
            }

        when (
            transport.execute(
                AuthenticatedHttpRequest(
                    method = "PUT",
                    path = "/v1/artifact-upload-transfers/$transferId",
                    binaryBody = command.originalBytes,
                    contentType = "application/octet-stream",
                    idempotencyKey = "${command.idempotencyKey}:bytes",
                ),
            )
        ) {
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                return ReceiptUploadApiResult.Rejected("receipt_upload_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> return ReceiptUploadApiResult.Retryable
            is AuthenticatedHttpResult.Success -> Unit
        }

        val recordBody =
            ReceiptWireEnvelope.recordPart(
                organizationId = organizationId,
                workspaceId = workspaceId,
                sessionId = sessionId,
                transferId = transferId,
                partNumber = 1,
                partSha256 = digest,
                partByteSize = command.totalBytes,
                idempotencyKey = "${command.idempotencyKey}:record",
                revision = 2,
            )
        when (
            transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/artifact-upload-sessions/$sessionId/parts",
                    jsonBody = recordBody,
                    idempotencyKey = "${command.idempotencyKey}:record",
                ),
            )
        ) {
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                return ReceiptUploadApiResult.Rejected("receipt_upload_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> return ReceiptUploadApiResult.Retryable
            is AuthenticatedHttpResult.Success -> Unit
        }

        val completeBody =
            ReceiptWireEnvelope.completeSession(
                organizationId = organizationId,
                workspaceId = workspaceId,
                sessionId = sessionId,
                expectedSha256 = digest,
                idempotencyKey = "${command.idempotencyKey}:complete",
                revision = 3,
            )
        return when (
            transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/artifact-upload-sessions/$sessionId/complete",
                    jsonBody = completeBody,
                    idempotencyKey = "${command.idempotencyKey}:complete",
                ),
            )
        ) {
            is AuthenticatedHttpResult.Success -> ReceiptUploadApiResult.Accepted
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                ReceiptUploadApiResult.Rejected("receipt_upload_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ReceiptUploadApiResult.Retryable
        }
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun extractJsonString(body: String, key: String): String? {
        val match = Regex("\"${Regex.escape(key)}\"\\s*:\\s*\"([^\"]+)\"").find(body) ?: return null
        return match.groupValues.getOrNull(1)?.takeIf { it.isNotEmpty() }
    }
}
