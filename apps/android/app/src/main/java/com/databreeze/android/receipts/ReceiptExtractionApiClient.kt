package com.databreeze.android.receipts

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

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
    val artifactVersionId: String? = null,
    val correlationId: String? = null,
)

data class ReceiptProfile(val profileVersionId: String, val profileKind: String)

sealed interface ReceiptProfileResult {
    data class Ready(val profile: ReceiptProfile) : ReceiptProfileResult
    data class Rejected(val code: String) : ReceiptProfileResult
    data object Retryable : ReceiptProfileResult
}

sealed interface ReceiptAcceptanceApiResult {
    data class Accepted(val datasetVersionId: String) : ReceiptAcceptanceApiResult
    data class Rejected(val code: String) : ReceiptAcceptanceApiResult
    data object Retryable : ReceiptAcceptanceApiResult
}

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
 * Tenant authority comes exclusively from the authenticated server session. Control-plane
 * requests contain resource IDs and idempotency only; the client never sends a tenant scope,
 * runs OCR, or holds a provider key.
 */
class ReceiptExtractionApiClient(
    private val transport: AuthenticatedApiTransport,
    @Suppress("UNUSED_PARAMETER") organizationId: String = "",
    @Suppress("UNUSED_PARAMETER") workspaceId: String = "",
    @Suppress("UNUSED_PARAMETER") nowIso: () -> String = { "" },
) {
    private data class CandidateContext(
        val artifactVersionId: String,
        val profileVersionId: String,
        val correlationId: String,
        val fields: List<ReceiptFieldCandidate>,
    )

    private data class ParsedCandidate(
        val ready: ReceiptCandidateReadResult.Ready,
        val artifactVersionId: String,
        val profileVersionId: String,
    )

    private val mapper = jacksonObjectMapper()
    private val candidateContexts = mutableMapOf<String, CandidateContext>()

    suspend fun fetchProfile(): ReceiptProfileResult = when (
        val response = transport.execute(
            AuthenticatedHttpRequest(method = "GET", path = "/v1/dda/receipts/profile"),
        )
    ) {
        is AuthenticatedHttpResult.Success -> {
            val root = readTree(response.body)
            val profileVersionId = root?.text("profileVersionId")
            val profileKind = root?.text("profileKind")
            if (profileVersionId == null || profileKind == null || !isUuid(profileVersionId) || profileKind != "receipt") {
                ReceiptProfileResult.Rejected("receipt_profile_invalid")
            } else {
                ReceiptProfileResult.Ready(ReceiptProfile(profileVersionId, profileKind))
            }
        }
        is AuthenticatedHttpResult.TerminalAuthFailure -> ReceiptProfileResult.Rejected("receipt_profile_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure,
        is AuthenticatedHttpResult.NetworkFailure,
        -> ReceiptProfileResult.Retryable
    }

    suspend fun requestExtraction(request: ReceiptExtractionRequest): ReceiptExtractionApiResult {
        val body =
            mapper.writeValueAsString(
                linkedMapOf(
                    "artifactVersionId" to request.artifactVersionId,
                    "profileVersionId" to request.profileVersionId,
                    "profileKind" to "receipt",
                    "correlationId" to request.correlationId,
                    "idempotencyKey" to request.idempotencyKey,
                ),
            )
        return when (
            val response =
                transport.execute(
                    AuthenticatedHttpRequest(
                        method = "POST",
                        path = "/v1/dda/receipts/extract",
                        jsonBody = body,
                        idempotencyKey = request.idempotencyKey,
                    ),
                )
        ) {
            is AuthenticatedHttpResult.Success -> {
                val unavailable = parseUnavailable(response.body)
                if (unavailable != null) return unavailable
                val parsed = parseCandidate(response.body)
                    ?: return ReceiptExtractionApiResult.Rejected("receipt_candidate_invalid")
                if (
                    parsed.artifactVersionId != request.artifactVersionId ||
                    parsed.profileVersionId != request.profileVersionId
                ) {
                    return ReceiptExtractionApiResult.Rejected("receipt_candidate_scope_mismatch")
                }
                remember(parsed, request.correlationId)
                ReceiptExtractionApiResult.Accepted(parsed.ready.candidateId)
            }
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
        artifactVersionId: String? = null,
    ): ReceiptCandidateReadResult {
        val artifactId = artifactVersionId ?: candidateContexts[candidateId]?.artifactVersionId
            ?: return ReceiptCandidateReadResult.Rejected("receipt_artifact_context_missing")
        if (!isUuid(candidateId) || !isUuid(artifactId) || revision < 1) {
            return ReceiptCandidateReadResult.Rejected("receipt_candidate_request_invalid")
        }
        return when (
            val response =
                transport.execute(
                    AuthenticatedHttpRequest(
                        method = "GET",
                        path =
                            "/v1/dda/receipts/candidates/$candidateId" +
                                "?artifactVersionId=$artifactId",
                        idempotencyKey = idempotencyKey,
                    ),
                )
        ) {
            is AuthenticatedHttpResult.Success -> {
                val unavailable = parseCandidateUnavailable(response.body)
                if (unavailable != null) return unavailable
                val parsed = parseCandidate(response.body)
                    ?: return ReceiptCandidateReadResult.Rejected("receipt_candidate_invalid")
                if (
                    parsed.ready.candidateId != candidateId ||
                    parsed.artifactVersionId != artifactId
                ) {
                    return ReceiptCandidateReadResult.Rejected("receipt_candidate_scope_mismatch")
                }
                val priorCorrelation = candidateContexts[candidateId]?.correlationId ?: candidateId
                remember(parsed, priorCorrelation)
                parsed.ready
            }
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                ReceiptCandidateReadResult.Rejected("receipt_candidate_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ReceiptCandidateReadResult.Retryable
        }
    }

    suspend fun correctCandidate(correction: ReceiptCandidateCorrection): ReceiptExtractionApiResult {
        val prior = candidateContexts[correction.priorCandidateId]
            ?: return ReceiptExtractionApiResult.Rejected("receipt_candidate_context_missing")
        if (
            correction.artifactVersionId != null &&
            correction.artifactVersionId != prior.artifactVersionId
        ) {
            return ReceiptExtractionApiResult.Rejected("receipt_candidate_scope_mismatch")
        }
        if (correction.revision < 1) {
            return ReceiptExtractionApiResult.Rejected("receipt_correction_request_invalid")
        }

        val priorByField = prior.fields.associateBy { it.field }
        if (priorByField.size != prior.fields.size || correction.fields.map { it.field }.toSet().size != correction.fields.size) {
            return ReceiptExtractionApiResult.Rejected("receipt_correction_fields_invalid")
        }
        val updates = linkedMapOf<String, String>()
        for (field in correction.fields) {
            val original = priorByField[field.field]
                ?: return ReceiptExtractionApiResult.Rejected("receipt_correction_fields_invalid")
            if (field.value != original.value) updates[field.field] = field.value
        }
        if (updates.isEmpty()) {
            return ReceiptExtractionApiResult.Rejected("receipt_correction_empty")
        }

        val correlationId = correction.correlationId ?: prior.correlationId
        val requestBody =
            mapper.writeValueAsString(
                linkedMapOf(
                    "priorCandidateId" to correction.priorCandidateId,
                    "artifactVersionId" to prior.artifactVersionId,
                    "correlationId" to correlationId,
                    "fieldUpdates" to updates,
                    "idempotencyKey" to correction.idempotencyKey,
                ),
            )
        return when (
            val response =
                transport.execute(
                    AuthenticatedHttpRequest(
                        method = "POST",
                        path = "/v1/dda/receipts/correct",
                        jsonBody = requestBody,
                        idempotencyKey = correction.idempotencyKey,
                    ),
                )
        ) {
            is AuthenticatedHttpResult.Success -> {
                val unavailable = parseUnavailable(response.body)
                if (unavailable != null) return unavailable
                val parsed = parseCandidate(response.body)
                    ?: return ReceiptExtractionApiResult.Rejected("receipt_candidate_invalid")
                if (parsed.artifactVersionId != prior.artifactVersionId) {
                    return ReceiptExtractionApiResult.Rejected("receipt_candidate_scope_mismatch")
                }
                remember(parsed, correlationId)
                ReceiptExtractionApiResult.Accepted(parsed.ready.candidateId)
            }
            is AuthenticatedHttpResult.TerminalAuthFailure ->
                ReceiptExtractionApiResult.Rejected("receipt_correction_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ReceiptExtractionApiResult.Retryable
        }
    }

    suspend fun acceptCandidate(
        candidateId: String,
        artifactContentHash: String,
        expectedRevision: Long,
        correlationId: String,
        idempotencyKey: String,
    ): ReceiptAcceptanceApiResult {
        val context = candidateContexts[candidateId]
            ?: return ReceiptAcceptanceApiResult.Rejected("receipt_candidate_context_missing")
        if (!isUuid(candidateId) || !isUuid(context.artifactVersionId) ||
            !SHA256_PATTERN.matches(artifactContentHash) || expectedRevision < 1 || !isUuid(correlationId)
        ) return ReceiptAcceptanceApiResult.Rejected("receipt_accept_request_invalid")
        val byField = context.fields.associateBy { it.field }
        val required = listOf("merchant", "transactionDateTime", "currency", "subtotal", "tax", "total")
        if (required.any { byField[it]?.value.isNullOrBlank() }) {
            return ReceiptAcceptanceApiResult.Rejected("receipt_required_field_missing")
        }
        val record = linkedMapOf<String, Any>(
            "merchant" to byField.getValue("merchant").value,
            "transactionDateTime" to byField.getValue("transactionDateTime").value,
            "currency" to byField.getValue("currency").value,
            "subtotal" to byField.getValue("subtotal").value,
            "tax" to byField.getValue("tax").value,
            "total" to byField.getValue("total").value,
            "fieldConfidence" to context.fields.associate { it.field to it.confidence },
        )
        val body = mapper.writeValueAsString(
            linkedMapOf(
                "candidateId" to candidateId,
                "artifactVersionId" to context.artifactVersionId,
                "artifactContentHash" to artifactContentHash,
                "expectedRevision" to expectedRevision,
                "correlationId" to correlationId,
                "idempotencyKey" to idempotencyKey,
                "record" to record,
            ),
        )
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/dda/receipts/accept",
                    jsonBody = body,
                    idempotencyKey = idempotencyKey,
                ),
            )
        ) {
            is AuthenticatedHttpResult.Success -> {
                val root = readTree(response.body)
                val datasetVersionId = root?.get("value")?.text("datasetVersionId")
                if (datasetVersionId == null || !isUuid(datasetVersionId)) ReceiptAcceptanceApiResult.Rejected("receipt_accept_response_invalid")
                else ReceiptAcceptanceApiResult.Accepted(datasetVersionId)
            }
            is AuthenticatedHttpResult.TerminalAuthFailure -> ReceiptAcceptanceApiResult.Rejected("receipt_accept_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> ReceiptAcceptanceApiResult.Retryable
        }
    }

    private fun remember(parsed: ParsedCandidate, correlationId: String) {
        candidateContexts[parsed.ready.candidateId] =
            CandidateContext(
                artifactVersionId = parsed.artifactVersionId,
                profileVersionId = parsed.profileVersionId,
                correlationId = correlationId,
                fields = parsed.ready.fields.map { it.copy() },
            )
    }

    private fun parseUnavailable(body: String): ReceiptExtractionApiResult.Unavailable? {
        val root = readTree(body) ?: return null
        if (root.text("status") != "provider_unavailable") return null
        return ReceiptExtractionApiResult.Unavailable(
            root.text("code") ?: "server_ocr_unavailable",
        )
    }

    private fun parseCandidateUnavailable(body: String): ReceiptCandidateReadResult.Unavailable? {
        val root = readTree(body) ?: return null
        if (root.text("status") != "provider_unavailable") return null
        return ReceiptCandidateReadResult.Unavailable(
            root.text("code") ?: "server_ocr_unavailable",
        )
    }

    private fun parseCandidate(body: String): ParsedCandidate? {
        val root = readTree(body) ?: return null
        val schemaVersion = root.get("schemaVersion") ?: return null
        if (!schemaVersion.canConvertToLong() || schemaVersion.longValue() != 1L) return null
        val candidateId = root.text("candidateId") ?: return null
        val artifactVersionId = root.text("artifactVersionId") ?: return null
        val profileVersionId = root.text("profileVersionId") ?: return null
        val adapterVersion = root.text("adapterVersion") ?: return null
        val evidenceReferenceId = root.text("evidenceReferenceId") ?: return null
        val candidateHash = root.text("candidateHash") ?: return null
        if (
            !isUuid(candidateId) ||
            !isUuid(artifactVersionId) ||
            !isUuid(profileVersionId) ||
            !isUuid(evidenceReferenceId) ||
            adapterVersion.length !in 1..64 ||
            !SHA256_PATTERN.matches(candidateHash) ||
            !isTenantScopeShape(root.get("tenantScope"))
        ) {
            return null
        }
        val fieldsNode = root.get("fieldCandidates") ?: return null
        if (!fieldsNode.isArray || fieldsNode.size() > 64) return null
        val fields = mutableListOf<ReceiptFieldCandidate>()
        for (fieldNode in fieldsNode) {
            val field = fieldNode.text("field") ?: return null
            val value = fieldNode.text("value") ?: return null
            val confidenceNode = fieldNode.get("confidence") ?: return null
            if (!confidenceNode.canConvertToInt()) return null
            val confidence = confidenceNode.intValue()
            if (field.length !in 1..64 || value.length !in 1..500 || confidence !in 0..100) {
                return null
            }
            fields +=
                ReceiptFieldCandidate(
                    field = field,
                    value = value,
                    confidence = confidence,
                    evidenceCropId = evidenceReferenceId,
                )
        }
        if (fields.map { it.field }.toSet().size != fields.size) return null
        return ParsedCandidate(
            ready = ReceiptCandidateReadResult.Ready(candidateId, adapterVersion, fields),
            artifactVersionId = artifactVersionId,
            profileVersionId = profileVersionId,
        )
    }

    private fun readTree(body: String): JsonNode? =
        runCatching { mapper.readTree(body) }.getOrNull()?.takeIf { it.isObject }

    private fun JsonNode.text(key: String): String? =
        get(key)?.takeIf { it.isTextual }?.textValue()?.takeIf { it.isNotEmpty() }

    private fun isUuid(value: String): Boolean =
        UUID_PATTERN.matches(value)

    private fun isTenantScopeShape(node: JsonNode?): Boolean {
        if (node == null || !node.isObject) return false
        val scopeType = node.text("scopeType") ?: return false
        if (!isUuid(node.text("organizationId") ?: return false)) return false
        return when (scopeType) {
            "organization" -> true
            "workspace" -> isUuid(node.text("workspaceId") ?: return false)
            "project" ->
                isUuid(node.text("workspaceId") ?: return false) &&
                    isUuid(node.text("projectId") ?: return false)
            else -> false
        }
    }

    private companion object {
        val UUID_PATTERN =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        val SHA256_PATTERN = Regex("^[0-9a-f]{64}$")
    }
}
