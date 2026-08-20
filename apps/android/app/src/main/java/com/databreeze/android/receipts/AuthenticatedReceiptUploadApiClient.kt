package com.databreeze.android.receipts

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64

/** Production resumable client for the IAE control-plane contract. Source bytes are sent only to
 * the single-use presigned PUT returned by the server; all state transitions are idempotent. */
fun interface PresignedPartUploader {
    fun upload(url: String, headers: JsonNode?, bytes: ByteArray): PresignedUploadResult
}

sealed interface PresignedUploadResult { data object Accepted : PresignedUploadResult; data object Retryable : PresignedUploadResult; data class Rejected(val code: String) : PresignedUploadResult }

class AuthenticatedReceiptUploadApiClient(
    private val transport: AuthenticatedApiTransport,
    private val organizationId: String,
    private val workspaceId: String,
    private val nowIso: () -> String = { Instant.now().toString() },
    private val presignedUploader: PresignedPartUploader = PresignedPartUploader { url, headers, bytes -> putPresignedDefault(url, headers, bytes) },
    private val references: ReceiptArtifactReferenceStore? = null,
) : ReceiptUploadApiClient {
    private val mapper = jacksonObjectMapper()

    override suspend fun upload(command: ReceiptArtifactUploadCommand): ReceiptUploadApiResult {
        if (command.originalBytes.size.toLong() != command.totalBytes) return ReceiptUploadApiResult.Rejected("upload_length_mismatch")
        val digest = sha256Hex(command.originalBytes)
        if (digest != command.contentDigest.removePrefix("sha256:")) return ReceiptUploadApiResult.Rejected("upload_digest_mismatch")
        val create = executeJson("POST", "/v1/artifact-upload-sessions", mapper.writeValueAsString(mapOf(
            "intakeId" to command.artifactSessionId,
            "expectedSha256" to digest,
            "expectedByteSize" to command.totalBytes,
            "mediaType" to command.mediaType,
            "requestedPartSize" to PART_SIZE,
        )), command.idempotencyKey) ?: return ReceiptUploadApiResult.Retryable
        val createValue = create.acceptedValue() ?: return ReceiptUploadApiResult.Rejected(create.code())
        val sessionId = createValue.get("sessionId")?.textValue() ?: return ReceiptUploadApiResult.Rejected("upload_session_invalid")
        var revision = createValue.get("revision")?.intValue() ?: 1
        val partSize = createValue.get("partSize")?.intValue()?.takeIf { it >= 1 } ?: PART_SIZE
        var offset = 0
        var partNumber = 1
        while (offset < command.originalBytes.size) {
            val end = minOf(offset + partSize, command.originalBytes.size)
            val bytes = command.originalBytes.copyOfRange(offset, end)
            val partDigest = sha256Hex(bytes)
            val existingPart = createValue.get("parts")
                ?.takeIf { it.isArray }
                ?.firstOrNull { part ->
                    part.get("partNumber")?.intValue() == partNumber &&
                        part.get("contentSha256")?.textValue()?.equals(partDigest, ignoreCase = true) == true &&
                        part.get("byteSize")?.intValue() == bytes.size
                }
            if (existingPart != null) {
                // A retry after process death can reuse a recorded part. Do not issue a second
                // presigned transfer or mutate the revision when the server already verified it.
                offset = end
                partNumber++
                continue
            }
            val transferResponse = executeJson("POST", "/v1/artifact-upload-sessions/$sessionId/parts/transfer", mapper.writeValueAsString(mapOf(
                "partNumber" to partNumber, "contentSha256" to partDigest, "byteSize" to bytes.size,
            )), "${command.idempotencyKey}:transfer:$partNumber") ?: return ReceiptUploadApiResult.Retryable
            val transfer = transferResponse.acceptedValue()?.get("transferId")?.textValue()?.let { id -> transferResponse.acceptedValue() to id }
                ?: return ReceiptUploadApiResult.Rejected("transfer_grant_missing")
            val transferNode = transfer.first ?: return ReceiptUploadApiResult.Rejected("transfer_grant_missing")
            val url = transferNode.get("url")?.textValue() ?: return ReceiptUploadApiResult.Rejected("transfer_url_missing")
            val headers = transferNode.get("requiredHeaders")
            when (val put = presignedUploader.upload(url, headers, bytes)) {
                is PresignedUploadResult.Rejected -> return ReceiptUploadApiResult.Rejected(put.code)
                PresignedUploadResult.Retryable -> return ReceiptUploadApiResult.Retryable
                PresignedUploadResult.Accepted -> Unit
            }
            val recorded = executeJson("POST", "/v1/artifact-upload-sessions/$sessionId/parts", mapper.writeValueAsString(mapOf(
                "transferId" to transfer.second, "partNumber" to partNumber, "contentSha256" to partDigest,
                "byteSize" to bytes.size, "uploadedAt" to nowIso(), "expectedRevision" to revision,
            )), "${command.idempotencyKey}:record:$partNumber") ?: return ReceiptUploadApiResult.Retryable
            revision = recorded.acceptedValue()?.get("revision")?.intValue() ?: revision + 1
            offset = end; partNumber++
        }
        val complete = executeJson("POST", "/v1/artifact-upload-sessions/$sessionId/complete", mapper.writeValueAsString(mapOf(
            "assembledSha256" to digest, "expectedRevision" to revision,
        )), "${command.idempotencyKey}:complete") ?: return ReceiptUploadApiResult.Retryable
        val completedValue = complete.acceptedValue()
        if (completedValue == null) return ReceiptUploadApiResult.Rejected(complete.code())
        // The artifact version is normally minted by the complete transition; accept the
        // create response only for providers that return the immutable version early.
        val artifactVersionId = completedValue.get("artifactVersionId")?.textValue()
            ?: createValue.get("artifactVersionId")?.textValue()
        if (artifactVersionId != null && isUuid(artifactVersionId)) {
            references?.save(command.artifactSessionId, artifactVersionId, command.contentDigest)
            return ReceiptUploadApiResult.AcceptedArtifact(artifactVersionId, sessionId)
        }
        return ReceiptUploadApiResult.Accepted
    }

    private suspend fun executeJson(method: String, path: String, body: String, idempotency: String): JsonNode? {
        return when (val result = transport.execute(AuthenticatedHttpRequest(method, path, body, idempotency))) {
            is AuthenticatedHttpResult.Success -> runCatching { mapper.readTree(result.body) }.getOrNull()
            is AuthenticatedHttpResult.TerminalAuthFailure -> mapper.createObjectNode().put("error", "receipt_upload_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure, is AuthenticatedHttpResult.NetworkFailure -> null
        }
    }

    private companion object {
        const val PART_SIZE = 8 * 1024 * 1024
        fun putPresignedDefault(url: String, headers: JsonNode?, bytes: ByteArray): PresignedUploadResult {
            if (!url.startsWith("https://") || url.length > 4096) return PresignedUploadResult.Rejected("transfer_url_invalid")
        return try {
            val connection = (URI.create(url).toURL().openConnection() as HttpURLConnection).apply {
                requestMethod = "PUT"; connectTimeout = 15_000; readTimeout = 60_000; doOutput = true
                setRequestProperty("Content-Length", bytes.size.toString())
                setRequestProperty("x-amz-checksum-sha256", Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes)))
                headers?.fields()?.forEachRemaining { (name, value) -> if (value.isTextual && name.length <= 64) setRequestProperty(name, value.textValue()) }
                outputStream.use { it.write(bytes) }
            }
            when (connection.responseCode) { in 200..299 -> PresignedUploadResult.Accepted; 408, 429 -> PresignedUploadResult.Retryable; in 500..599 -> PresignedUploadResult.Retryable; else -> PresignedUploadResult.Rejected("transfer_rejected") }
        } catch (_: IOException) { PresignedUploadResult.Retryable }
        }
        fun isUuid(value: String): Boolean =
            UUID_PATTERN.matches(value)
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    }

    private fun JsonNode.acceptedValue(): JsonNode? = takeIf { get("accepted")?.booleanValue() == true }?.get("value")
    private fun JsonNode.code(): String = get("code")?.textValue()?.take(64) ?: get("error")?.textValue()?.take(64) ?: "upload_rejected"
    private fun sha256Hex(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
