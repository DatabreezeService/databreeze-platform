package com.databreeze.android.receipts

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.security.MessageDigest
import java.util.Base64

/** Authenticated bounded intake adapter used by production Android. */
class AuthenticatedReceiptIntakeApiClient(
    private val transport: AuthenticatedApiTransport,
    private val references: ReceiptArtifactReferenceStore,
) : ReceiptUploadApiClient {
    private val mapper = jacksonObjectMapper()

    override suspend fun upload(command: ReceiptArtifactUploadCommand): ReceiptUploadApiResult {
        if (command.originalBytes.size.toLong() != command.totalBytes) {
            return ReceiptUploadApiResult.Rejected("upload_length_mismatch")
        }
        if (!command.artifactSessionId.matches(UUID_PATTERN)) {
            return ReceiptUploadApiResult.Rejected("upload_session_invalid")
        }
        val expected = command.contentDigest.removePrefix("sha256:").lowercase()
        val actual = sha256Hex(command.originalBytes)
        if (!SHA256_PATTERN.matches(expected) || actual != expected) {
            return ReceiptUploadApiResult.Rejected("upload_digest_mismatch")
        }
        val body = mapper.writeValueAsString(
            linkedMapOf(
                "fileName" to command.fileName,
                "mediaType" to command.mediaType,
                "expectedSha256" to expected,
                "contentBase64" to Base64.getEncoder().encodeToString(command.originalBytes),
                "idempotencyKey" to command.idempotencyKey,
            ),
        )
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/dda/receipts/intake",
                    jsonBody = body,
                    idempotencyKey = command.idempotencyKey,
                ),
            )
        ) {
            is AuthenticatedHttpResult.Success -> {
                val value = runCatching { mapper.readTree(response.body).get("value") }.getOrNull()
                val artifactVersionId = value?.text("artifactVersionId")
                val sessionId = value?.text("sessionId")
                if (artifactVersionId == null || sessionId == null || !isUuid(artifactVersionId) || !isUuid(sessionId)) {
                    ReceiptUploadApiResult.Rejected("receipt_intake_response_invalid")
                } else {
                    references.save(command.artifactSessionId, artifactVersionId, expected)
                    ReceiptUploadApiResult.AcceptedArtifact(artifactVersionId, sessionId)
                }
            }
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                ReceiptUploadApiResult.Rejected("receipt_upload_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ReceiptUploadApiResult.Retryable
        }
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun isUuid(value: String?): Boolean = value != null && UUID_PATTERN.matches(value)

    private fun JsonNode.text(key: String): String? =
        get(key)?.takeIf { it.isTextual }?.textValue()?.takeIf { it.isNotBlank() }

    private companion object {
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        val SHA256_PATTERN = Regex("^[0-9a-f]{64}$")
    }
}
