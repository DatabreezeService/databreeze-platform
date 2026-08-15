package com.databreeze.android.network

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

/** Reads server-issued workspace grants; the app never creates or guesses a grant. */
class DeviceGrantApiClient(
    private val transport: AuthenticatedApiTransport,
    private val workspaceId: String,
) {
    data class Grant(
        val id: String,
        val workspaceId: String,
        val status: String,
        val revision: Long,
        val allowedActionTypes: Set<String>,
    )

    sealed interface Result {
        data class Ready(val grants: List<Grant>) : Result
        data class Rejected(val code: String) : Result
        data object Retryable : Result
    }

    suspend fun list(deviceId: String): Result {
        if (!isUuid(deviceId) || !isUuid(workspaceId)) return Result.Rejected("device_grant_request_invalid")
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest("GET", "/v1/devices/$deviceId/grants"),
            )
        ) {
            is AuthenticatedHttpResult.Success -> parse(response.body)
            is AuthenticatedHttpResult.TerminalAuthFailure -> Result.Rejected("session_invalid")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> Result.Retryable
        }
    }

    private fun parse(body: String): Result = runCatching {
        val root = mapper.readTree(body)
        if (root.get("accepted")?.booleanValue() != true) return Result.Rejected("device_grant_response_rejected")
        val value = root.get("value") ?: return Result.Rejected("device_grant_response_invalid")
        if (!value.isArray) return Result.Rejected("device_grant_response_invalid")
        val grants = value.map { row ->
            val id = row.text("grantId") ?: row.text("id") ?: return Result.Rejected("device_grant_response_invalid")
            val rowWorkspace = row.text("workspaceId") ?: return Result.Rejected("device_grant_response_invalid")
            val status = row.text("status") ?: return Result.Rejected("device_grant_response_invalid")
            val revision = row.get("revision")?.takeIf { it.canConvertToLong() }?.longValue()
                ?: return Result.Rejected("device_grant_response_invalid")
            if (!isUuid(id) || rowWorkspace != workspaceId || revision < 1L) {
                return Result.Rejected("device_grant_response_invalid")
            }
            val actions = row.get("allowedActionTypes")?.takeIf { it.isArray }
                ?.mapNotNull { it.textValue()?.takeIf(String::isNotBlank) }
                ?.toSet()
                ?: emptySet()
            Grant(id, rowWorkspace, status, revision, actions)
        }
        Result.Ready(grants)
    }.getOrElse { Result.Rejected("device_grant_response_invalid") }

    private companion object {
        val mapper = jacksonObjectMapper()
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

        fun isUuid(value: String): Boolean = UUID_PATTERN.matches(value)
        fun JsonNode.text(key: String): String? = get(key)?.takeIf { it.isTextual }?.textValue()?.takeIf(String::isNotBlank)
    }
}
