package com.databreeze.android.network

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

data class AuditEventSummary(val id: String, val type: String, val at: String)

sealed interface OperationsApiResult {
    data class Ready(val events: List<AuditEventSummary>) : OperationsApiResult
    data class Rejected(val code: String) : OperationsApiResult
    data object Retryable : OperationsApiResult
}

/** Content-safe admin tracking reader. It never exposes event payloads or actor secrets to UI. */
class AuthenticatedOperationsApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()

    suspend fun auditEvents(limit: Int = 50): OperationsApiResult {
        if (limit !in 1..100) return OperationsApiResult.Rejected("audit_limit_invalid")
        return when (val response = transport.execute(AuthenticatedHttpRequest("GET", "/v1/audit/events?limit=$limit"))) {
            is AuthenticatedHttpResult.Success -> runCatching {
                val rows = mapper.readTree(response.body).get("items")
                if (rows == null || !rows.isArray || rows.size() > 100) return@runCatching OperationsApiResult.Rejected("audit_response_invalid")
                val events = rows.mapNotNull { row ->
                    val id = row.get("eventId")?.textValue() ?: row.get("id")?.textValue()
                    // Audit payloads are intentionally not forwarded to Compose. Keep only a
                    // bounded event label while tolerating the v1 ledger's historical names.
                    val type = row.get("eventType")?.textValue()
                        ?: row.get("type")?.textValue()
                        ?: row.get("kind")?.textValue()
                        ?: row.get("action")?.textValue()
                    val at = row.get("occurredAt")?.textValue() ?: row.get("createdAt")?.textValue()
                    if (id.isNullOrBlank() || type.isNullOrBlank() || at.isNullOrBlank()) null
                    else AuditEventSummary(id.take(128), type.take(128), at.take(64))
                }
                if (events.size != rows.size()) OperationsApiResult.Rejected("audit_response_invalid")
                else OperationsApiResult.Ready(events)
            }.getOrElse { OperationsApiResult.Rejected("audit_response_invalid") }
            is AuthenticatedHttpResult.TerminalAuthFailure -> OperationsApiResult.Rejected("audit_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> OperationsApiResult.Retryable
        }
    }
}
