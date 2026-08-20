package com.databreeze.android.network

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

data class ApprovalCard(val requestId: String, val subjectType: String, val requestedAction: String, val status: String, val subjectHash: String)

sealed interface ApprovalApiResult<out T> {
    data class Ready<T>(val value: T) : ApprovalApiResult<T>
    data class Rejected(val code: String) : ApprovalApiResult<Nothing>
    data object Retryable : ApprovalApiResult<Nothing>
}

/** Online approval boundary. The server validates membership, subject hash, revision and MFA. */
class AuthenticatedApprovalApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()

    suspend fun list(status: String = "OPEN"): ApprovalApiResult<List<ApprovalCard>> = when (val response = transport.execute(AuthenticatedHttpRequest("GET", "/v1/approvals/requests?status=${status.take(32)}"))) {
        is AuthenticatedHttpResult.Success -> runCatching {
            val rows = mapper.readTree(response.body).takeIf { it.isArray } ?: mapper.readTree(response.body).get("value")
            if (rows == null || !rows.isArray || rows.size() > 100) return@runCatching ApprovalApiResult.Rejected("approval_response_invalid")
            ApprovalApiResult.Ready(rows.mapNotNull { row ->
                val id = row.get("requestId")?.textValue(); val type = row.get("subjectType")?.textValue(); val action = row.get("requestedAction")?.textValue(); val state = row.get("status")?.textValue(); val hash = row.get("subjectHash")?.textValue()
                if (id.isNullOrBlank() || type.isNullOrBlank() || action.isNullOrBlank() || state.isNullOrBlank() || hash.isNullOrBlank()) null else ApprovalCard(id.take(128), type.take(80), action.take(80), state.take(24), hash)
            })
        }.getOrElse { ApprovalApiResult.Rejected("approval_response_invalid") }
        is AuthenticatedHttpResult.TerminalAuthFailure -> ApprovalApiResult.Rejected("approval_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure, is AuthenticatedHttpResult.NetworkFailure -> ApprovalApiResult.Retryable
    }

    suspend fun decide(requestId: String, decisionId: String, decision: String, subjectHash: String, mfaAssertionId: String, actorRole: String, reason: String? = null): ApprovalApiResult<Boolean> {
        if (!SAFE_ID.matches(requestId) || !SAFE_ID.matches(decisionId) || !SAFE_ID.matches(mfaAssertionId) || !DIGEST.matches(subjectHash) || decision !in setOf("APPROVE", "REJECT")) return ApprovalApiResult.Rejected("approval_input_invalid")
        val body = mapper.writeValueAsString(buildMap { put("decisionId", decisionId); put("decision", decision); put("subjectHash", subjectHash); put("mfaAssertionId", mfaAssertionId); put("actorRole", actorRole); put("decidedAt", java.time.Instant.now().toString()); reason?.let { put("reason", it) } })
        return when (val response = transport.execute(AuthenticatedHttpRequest("POST", "/v1/approvals/requests/$requestId/decisions", body))) {
            is AuthenticatedHttpResult.Success -> ApprovalApiResult.Ready(true)
            is AuthenticatedHttpResult.TerminalAuthFailure -> ApprovalApiResult.Rejected("approval_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure, is AuthenticatedHttpResult.NetworkFailure -> ApprovalApiResult.Retryable
        }
    }

    private companion object { val SAFE_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"); val DIGEST = Regex("^[a-f0-9]{64}$") }
}
