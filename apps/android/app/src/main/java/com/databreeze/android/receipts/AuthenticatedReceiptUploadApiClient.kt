package com.databreeze.android.receipts

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import java.security.MessageDigest

/**
 * Authenticated resumable receipt upload client.
 *
 * Uses IAE upload control-plane routes with opaque transfer grants. Canonical bytes are streamed
 * only after scope/hash/length checks and are never logged.
 *
 * Wire envelope draft (not yet published into immutable contracts v1):
 * `packages/contracts/schemas/draft/dda-receipt-upload.schema.json`.
 */
class AuthenticatedReceiptUploadApiClient(
    private val transport: AuthenticatedApiTransport,
    private val organizationId: String,
    private val nowIso: () -> String,
) : ReceiptUploadApiClient {
    override suspend fun upload(command: ReceiptArtifactUploadCommand): ReceiptUploadApiResult {
        require(organizationId.isNotEmpty())
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
            """{"sessionId":"$sessionId","artifactId":"$sessionId","expectedSha256":"$digest","expectedByteSize":${command.totalBytes},"mediaType":"image/jpeg","partSize":${command.totalBytes.coerceAtMost(5_242_880)},"createdAt":"${nowIso()}","expiresAt":"${nowIso()}"}"""

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

        val transfer =
            transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/artifact-upload-sessions/$sessionId/parts/transfer",
                    jsonBody = """{"partNumber":1}""",
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
            """{"transferId":"$transferId","partNumber":1,"contentSha256":"$digest","byteSize":${command.totalBytes},"uploadedAt":"${nowIso()}","expectedRevision":1}"""
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

        val completeBody = """{"assembledSha256":"$digest","expectedRevision":2}"""
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
