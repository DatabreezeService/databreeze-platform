package com.databreeze.android.network

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.net.URLEncoder

data class MobileTaskCard(
    val resourceType: String,
    val resourceId: String,
    val revision: Long,
    val taskType: String,
    val safeTitleKey: String,
    val evidenceAvailability: String,
    val permittedActions: List<String>,
)

data class MobileConflictCard(val conflictId: String, val operationId: String, val reason: String, val status: String)

sealed interface MobileApiResult<out TValue> {
    data class Ready<TValue>(val value: TValue) : MobileApiResult<TValue>
    data class Rejected(val code: String) : MobileApiResult<Nothing>
    data object Retryable : MobileApiResult<Nothing>
}

/** Mobile control-plane boundary for tasks, reports, route tokens and push registration. */
class AuthenticatedMobileApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()

    suspend fun tasks(): MobileApiResult<List<MobileTaskCard>> = when (
        val response = transport.execute(AuthenticatedHttpRequest("GET", "/v1/mobile/tasks"))
    ) {
        is AuthenticatedHttpResult.Success -> runCatching {
            val rows = mapper.readTree(response.body).get("items")
            if (rows == null || !rows.isArray || rows.size() > 100) return@runCatching MobileApiResult.Rejected("mobile_tasks_response_invalid")
            val result = rows.mapNotNull { row ->
                val resourceType = row.get("resourceType")?.textValue()
                val resourceId = row.get("resourceId")?.textValue()
                val revision = row.get("revision")?.longValue()
                val taskType = row.get("taskType")?.textValue()
                val title = row.get("safeTitleKey")?.textValue()
                val evidence = row.get("evidenceAvailability")?.textValue()
                val actions = row.get("permittedActions")?.takeIf { it.isArray }?.mapNotNull { it.textValue() }
                if (resourceType.isNullOrBlank() || resourceId.isNullOrBlank() || revision == null || revision < 1L || taskType.isNullOrBlank() || title.isNullOrBlank() || evidence.isNullOrBlank() || actions == null) null
                else MobileTaskCard(resourceType.take(64), resourceId.take(128), revision, taskType.take(32), title.take(128), evidence.take(32), actions.take(16).map { it.take(64) })
            }
            if (result.size != rows.size()) MobileApiResult.Rejected("mobile_tasks_response_invalid") else MobileApiResult.Ready(result)
        }.getOrElse { MobileApiResult.Rejected("mobile_tasks_response_invalid") }
        is AuthenticatedHttpResult.TerminalAuthFailure -> MobileApiResult.Rejected("mobile_tasks_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure,
        is AuthenticatedHttpResult.NetworkFailure,
        -> MobileApiResult.Retryable
    }

    suspend fun resolveRouteToken(token: String): MobileApiResult<String> {
        if (token.isBlank() || token.length > 512) return MobileApiResult.Rejected("route_token_invalid")
        val encoded = URLEncoder.encode(token, "UTF-8").replace("+", "%20")
        return when (val response = transport.execute(AuthenticatedHttpRequest("POST", "/v1/mobile/route-tokens/$encoded/resolve"))) {
            is AuthenticatedHttpResult.Success -> {
                val route = runCatching { mapper.readTree(response.body).get("value")?.get("route")?.textValue() }.getOrNull()
                if (route.isNullOrBlank() || route.length > 256) MobileApiResult.Rejected("route_token_response_invalid") else MobileApiResult.Ready(route)
            }
            is AuthenticatedHttpResult.TerminalAuthFailure -> MobileApiResult.Rejected("route_token_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> MobileApiResult.Retryable
        }
    }

    suspend fun registerPush(providerToken: String, installationIdHash: String): MobileApiResult<String> {
        if (providerToken.isBlank() || providerToken.length > 4096 || !installationIdHash.matches(DIGEST)) return MobileApiResult.Rejected("push_registration_invalid")
        val body = mapper.writeValueAsString(mapOf("platform" to "ANDROID", "providerToken" to providerToken, "installationIdHash" to installationIdHash))
        return when (val response = transport.execute(AuthenticatedHttpRequest("POST", "/v1/mobile/push-registrations", body))) {
            is AuthenticatedHttpResult.Success -> {
                val id = runCatching { mapper.readTree(response.body).get("value")?.get("registrationId")?.textValue() }.getOrNull()
                if (id.isNullOrBlank()) MobileApiResult.Rejected("push_registration_response_invalid") else MobileApiResult.Ready(id)
            }
            is AuthenticatedHttpResult.TerminalAuthFailure -> MobileApiResult.Rejected("push_registration_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> MobileApiResult.Retryable
        }
    }

    suspend fun submitReport(reportType: String, payloadDigest: String, subjectId: String? = null): MobileApiResult<String> {
        if (reportType.isBlank() || reportType.length > 64 || !payloadDigest.matches(DIGEST)) return MobileApiResult.Rejected("report_invalid")
        val body = mapper.writeValueAsString(buildMap {
            put("reportType", reportType)
            put("payloadDigest", payloadDigest)
            subjectId?.let { put("subjectId", it) }
        })
        return when (val response = transport.execute(AuthenticatedHttpRequest("POST", "/v1/mobile/reports", body))) {
            is AuthenticatedHttpResult.Success -> runCatching { mapper.readTree(response.body).get("value")?.get("reportId")?.textValue() }
                .getOrNull()?.let { MobileApiResult.Ready(it) } ?: MobileApiResult.Rejected("report_response_invalid")
            is AuthenticatedHttpResult.TerminalAuthFailure -> MobileApiResult.Rejected("report_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure, is AuthenticatedHttpResult.NetworkFailure -> MobileApiResult.Retryable
        }
    }

    suspend fun conflicts(): MobileApiResult<List<MobileConflictCard>> = when (val response = transport.execute(AuthenticatedHttpRequest("GET", "/v1/devices/sync/conflicts"))) {
        is AuthenticatedHttpResult.Success -> runCatching {
            val rows = mapper.readTree(response.body).takeIf { it.isArray } ?: mapper.readTree(response.body).get("value")
            if (rows == null || !rows.isArray || rows.size() > 100) return@runCatching MobileApiResult.Rejected("conflicts_response_invalid")
            MobileApiResult.Ready(rows.mapNotNull { row ->
                val id = row.get("conflictId")?.textValue(); val op = row.get("operationId")?.textValue(); val reason = row.get("reason")?.textValue(); val status = row.get("status")?.textValue()
                if (id.isNullOrBlank() || op.isNullOrBlank() || reason.isNullOrBlank() || status.isNullOrBlank()) null else MobileConflictCard(id.take(128), op.take(128), reason.take(64), status.take(32))
            })
        }.getOrElse { MobileApiResult.Rejected("conflicts_response_invalid") }
        is AuthenticatedHttpResult.TerminalAuthFailure -> MobileApiResult.Rejected("conflicts_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure, is AuthenticatedHttpResult.NetworkFailure -> MobileApiResult.Retryable
    }

    private companion object { val DIGEST = Regex("^[a-f0-9]{64}$") }
}
