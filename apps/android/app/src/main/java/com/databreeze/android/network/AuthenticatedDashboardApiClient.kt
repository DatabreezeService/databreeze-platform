package com.databreeze.android.network

import com.databreeze.android.dashboard.DashboardSnapshot
import com.databreeze.android.dashboard.DashboardWidget
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

sealed interface DashboardApiResult {
    data class Ready(val snapshot: DashboardSnapshot) : DashboardApiResult
    data class Rejected(val code: String) : DashboardApiResult
    data object Retryable : DashboardApiResult
}

/** Reads a permission-filtered snapshot. Dashboard/snapshot IDs are supplied by the user/server. */
class AuthenticatedDashboardApiClient(private val transport: AuthenticatedApiTransport) {
    private val mapper = jacksonObjectMapper()

    suspend fun view(snapshotId: String): DashboardApiResult {
        if (!UUID_PATTERN.matches(snapshotId)) return DashboardApiResult.Rejected("dashboard_snapshot_invalid")
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/dda/dashboards/query/view",
                    jsonBody = mapper.writeValueAsString(mapOf("snapshotId" to snapshotId)),
                ),
            )
        ) {
            is AuthenticatedHttpResult.Success -> runCatching {
                val rows = mapper.readTree(response.body).get("value")?.get("rows")
                if (rows == null || !rows.isArray || rows.size() > 100) {
                    return@runCatching DashboardApiResult.Rejected("dashboard_response_invalid")
                }
                val widgets = rows.flatMapIndexed { rowIndex, row ->
                    if (!row.isObject) return@flatMapIndexed emptyList()
                    row.fields().asSequence().map { (key, value) ->
                        DashboardWidget("$rowIndex-$key", "value", key, value.asText())
                    }.toList()
                }
                DashboardApiResult.Ready(
                    DashboardSnapshot(snapshotId, "Dashboard", widgets, emptyList()),
                )
            }.getOrElse { DashboardApiResult.Rejected("dashboard_response_invalid") }
            is AuthenticatedHttpResult.TerminalAuthFailure -> DashboardApiResult.Rejected("dashboard_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> DashboardApiResult.Retryable
        }
    }

    private companion object {
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    }
}
