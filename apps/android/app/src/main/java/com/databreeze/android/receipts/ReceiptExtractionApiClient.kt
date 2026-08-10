package com.databreeze.android.receipts

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult

data class ReceiptExtractionRequest(
    val artifactVersionId: String,
    val profileVersionId: String,
    val correlationId: String,
    val idempotencyKey: String,
    val revision: Long,
)

data class ReceiptCandidateCorrection(
    val priorCandidateId: String,
    val fields: List<ReceiptFieldCandidate>,
    val idempotencyKey: String,
    val revision: Long,
)

sealed interface ReceiptExtractionApiResult {
    data class Accepted(val candidateId: String) : ReceiptExtractionApiResult
    data class Unavailable(val code: String) : ReceiptExtractionApiResult
    data class Rejected(val code: String) : ReceiptExtractionApiResult
    data object Retryable : ReceiptExtractionApiResult
}

sealed interface ReceiptCandidateReadResult {
    data class Ready(
        val candidateId: String,
        val adapterVersion: String,
        val fields: List<ReceiptFieldCandidate>,
    ) : ReceiptCandidateReadResult

    data class Unavailable(val code: String) : ReceiptCandidateReadResult
    data class Rejected(val code: String) : ReceiptCandidateReadResult
    data object Retryable : ReceiptCandidateReadResult
}

/**
 * Authenticated server OCR extraction/review client.
 *
 * Uses published contracts v2 receipt-upload wire operations. The client never runs OCR or holds
 * a provider key; provider failure retains the original and the manual correction path.
 */
class ReceiptExtractionApiClient(
    private val transport: AuthenticatedApiTransport,
    private val organizationId: String,
    private val workspaceId: String,
    private val nowIso: () -> String,
) {
    suspend fun requestExtraction(request: ReceiptExtractionRequest): ReceiptExtractionApiResult {
        val body =
            ReceiptWireEnvelope.requestExtraction(
                organizationId = organizationId,
                workspaceId = workspaceId,
                artifactVersionId = request.artifactVersionId,
                profileVersionId = request.profileVersionId,
                correlationId = request.correlationId,
                idempotencyKey = request.idempotencyKey,
                revision = request.revision,
            )
        return when (
            val response =
                transport.execute(
                    AuthenticatedHttpRequest(
                        method = "POST",
                        path = "/v1/receipt-candidates/${request.artifactVersionId}/extraction",
                        jsonBody = body,
                        idempotencyKey = request.idempotencyKey,
                    ),
                )
        ) {
            is AuthenticatedHttpResult.Success -> parseExtractionAccepted(response.body)
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                ReceiptExtractionApiResult.Rejected("receipt_extraction_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ReceiptExtractionApiResult.Retryable
        }
    }

    suspend fun readCandidate(
        candidateId: String,
        idempotencyKey: String,
        revision: Long,
    ): ReceiptCandidateReadResult {
        val body =
            ReceiptWireEnvelope.readCandidate(
                organizationId = organizationId,
                workspaceId = workspaceId,
                candidateId = candidateId,
                idempotencyKey = idempotencyKey,
                revision = revision,
            )
        // Control-plane envelope travels as the request body for idempotent read intent; the
        // route remains a GET of the exact candidate version.
        return when (
            val response =
                transport.execute(
                    AuthenticatedHttpRequest(
                        method = "GET",
                        path = "/v1/receipt-candidates/$candidateId",
                        jsonBody = body,
                        idempotencyKey = idempotencyKey,
                    ),
                )
        ) {
            is AuthenticatedHttpResult.Success -> parseCandidate(response.body)
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                ReceiptCandidateReadResult.Rejected("receipt_candidate_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ReceiptCandidateReadResult.Retryable
        }
    }

    suspend fun correctCandidate(correction: ReceiptCandidateCorrection): ReceiptExtractionApiResult {
        val envelope =
            ReceiptWireEnvelope.correctCandidate(
                organizationId = organizationId,
                workspaceId = workspaceId,
                candidateId = correction.priorCandidateId,
                idempotencyKey = correction.idempotencyKey,
                revision = correction.revision,
            )
        // Field values travel on the dedicated correction DTO beside the v2 envelope; they are
        // never written to ordinary telemetry.
        val fieldsJson =
            correction.fields.joinToString(prefix = "[", postfix = "]") { field ->
                """{"field":"${escape(field.field)}","value":"${escape(field.value)}","confidence":${field.confidence}}"""
            }
        val requestBody =
            """{"envelope":$envelope,"fields":$fieldsJson,"correctedAt":"${nowIso()}"}"""
        return when (
            val response =
                transport.execute(
                    AuthenticatedHttpRequest(
                        method = "POST",
                        path = "/v1/receipt-candidates/${correction.priorCandidateId}/corrections",
                        jsonBody = requestBody,
                        idempotencyKey = correction.idempotencyKey,
                    ),
                )
        ) {
            is AuthenticatedHttpResult.Success -> parseExtractionAccepted(response.body)
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                ReceiptExtractionApiResult.Rejected("receipt_correction_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ReceiptExtractionApiResult.Retryable
        }
    }

    private fun parseExtractionAccepted(body: String): ReceiptExtractionApiResult {
        val status = extractJsonString(body, "status")
        if (status == "provider_unavailable") {
            return ReceiptExtractionApiResult.Unavailable(
                extractJsonString(body, "code") ?: "server_ocr_unavailable",
            )
        }
        val candidateId = extractJsonString(body, "candidateId")
            ?: return ReceiptExtractionApiResult.Rejected("candidate_id_missing")
        return ReceiptExtractionApiResult.Accepted(candidateId)
    }

    private fun parseCandidate(body: String): ReceiptCandidateReadResult {
        val status = extractJsonString(body, "status")
        if (status == "provider_unavailable") {
            return ReceiptCandidateReadResult.Unavailable(
                extractJsonString(body, "code") ?: "server_ocr_unavailable",
            )
        }
        val candidateId =
            extractJsonString(body, "candidateId")
                ?: return ReceiptCandidateReadResult.Rejected("candidate_id_missing")
        val adapterVersion = extractJsonString(body, "adapterVersion") ?: "unknown"
        val fields = parseFields(body)
        return ReceiptCandidateReadResult.Ready(candidateId, adapterVersion, fields)
    }

    private fun parseFields(body: String): List<ReceiptFieldCandidate> {
        val block =
            Regex(""""fields"\s*:\s*\[(.*)]""", RegexOption.DOT_MATCHES_ALL)
                .find(body)
                ?.groupValues
                ?.getOrNull(1)
                ?: return emptyList()
        return Regex(
            """\{[^{}]*"field"\s*:\s*"([^"]+)"[^{}]*"value"\s*:\s*"([^"]*)"[^{}]*"confidence"\s*:\s*(\d+)[^{}]*("evidenceCropId"\s*:\s*"([^"]*)")?[^{}]*}""",
        ).findAll(block)
            .map { match ->
                ReceiptFieldCandidate(
                    field = match.groupValues[1],
                    value = match.groupValues[2],
                    confidence = match.groupValues[3].toInt(),
                    evidenceCropId = match.groupValues.getOrNull(5)?.takeIf { it.isNotEmpty() },
                )
            }.toList()
    }

    private fun extractJsonString(body: String, key: String): String? {
        val match = Regex("\"${Regex.escape(key)}\"\\s*:\\s*\"([^\"]+)\"").find(body) ?: return null
        return match.groupValues.getOrNull(1)?.takeIf { it.isNotEmpty() }
    }

    private fun escape(value: String): String =
        value.replace("\\", "\\\\").replace("\"", "\\\"")
}
