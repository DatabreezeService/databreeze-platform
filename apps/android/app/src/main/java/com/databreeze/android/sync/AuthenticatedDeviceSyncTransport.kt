package com.databreeze.android.sync

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import com.databreeze.android.storage.AccountWorkspaceScope
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.time.Instant

/**
 * Production DSO transport. It sends only opaque operation identifiers and signed cursor
 * metadata; source bytes never enter the device sync queue. The server remains the authority for
 * grant, revision, conflict and data-mode decisions.
 */
class AuthenticatedDeviceSyncTransport(
    private val transport: AuthenticatedApiTransport,
    private val deviceId: String,
    private val grantId: String,
    private val now: () -> String = { Instant.now().toString() },
) : SyncTransport {
    private val mapper = jacksonObjectMapper()

    override suspend fun synchronize(
        request: SyncRequest,
        mutations: List<String>,
    ): SyncTransportResult {
        if (deviceId.isBlank() || grantId.isBlank()) return SyncTransportResult.Rejected("device_enrollment_required")
        val cursor = if (request.cursor.isNullOrBlank()) {
            val bootstrap = transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/devices/sync/cursors/bootstrap",
                    jsonBody = mapper.writeValueAsString(
                        linkedMapOf(
                            "grantId" to grantId,
                            "deviceId" to deviceId,
                            "now" to now(),
                            "dataMode" to "Hybrid",
                            "protocolVersion" to "android-v1",
                        ),
                    ),
                ),
            )
            when (bootstrap) {
                is AuthenticatedHttpResult.Success -> {
                    val root = runCatching { mapper.readTree(bootstrap.body) }.getOrNull()
                    if (root?.get("accepted")?.booleanValue() != true) return bootstrap.toSyncResult()
                    root.get("value")?.takeIf { it.isObject } ?: return SyncTransportResult.Rejected("sync_cursor_invalid")
                }
                else -> return bootstrap.toSyncResult()
            }
        } else requestCursor(request)
        val pull = transport.execute(
            AuthenticatedHttpRequest(
                method = "POST",
                path = "/v1/devices/sync/pull",
                jsonBody = mapper.writeValueAsString(
                    linkedMapOf(
                        "grantId" to grantId,
                        "deviceId" to deviceId,
                        "cursor" to cursor,
                        "now" to now(),
                        "minimumRevision" to 0,
                        "pageSize" to 64,
                        "dataMode" to "Hybrid",
                        "protocolVersion" to "android-v1",
                    ),
                ),
            ),
        )
        val pullOutcome = pull.toSyncResult()
        if (pullOutcome !is SyncTransportResult.Accepted) return pullOutcome
        // The local queue deliberately stores only opaque IDs/digests. It must never fabricate a
        // DSO batch (which requires tenant scope, entity identity and a signed cursor). Callers
        // that have a complete typed change use the operation API; the background worker retries
        // safely after that operation has been admitted.
        if (mutations.isNotEmpty()) return SyncTransportResult.Rejected("sync_mutation_contract_required")

        val push = transport.execute(
            AuthenticatedHttpRequest(
                method = "POST",
                path = "/v1/devices/sync/push",
                jsonBody = mapper.writeValueAsString(
                    linkedMapOf(
                        "grantId" to grantId,
                        "batch" to linkedMapOf("operationIds" to mutations.take(64)),
                        "now" to now(),
                        "minimumRevision" to 0,
                    ),
                ),
                idempotencyKey = "android-sync-${request.scope.stableKey}-${mutations.joinToString(",")}".take(240),
            ),
        )
        return push.toSyncResult()
    }

    private fun requestCursor(request: SyncRequest): Map<String, Any> {
        val raw = request.cursor ?: return emptyMap()
        val node = runCatching { mapper.readTree(raw) }.getOrNull()
        return node?.takeIf { it.isObject }?.fields()?.asSequence()?.associate { entry ->
            entry.key to safeJsonValue(entry.value)
        } ?: mapOf("opaque" to raw.take(512))
    }

    private fun safeJsonValue(node: JsonNode): Any = when {
        node.isTextual -> node.textValue().take(512)
        node.isIntegralNumber -> node.longValue()
        node.isBoolean -> node.booleanValue()
        else -> node.toString().take(1024)
    }

    private fun AuthenticatedHttpResult.toSyncResult(): SyncTransportResult = when (this) {
        is AuthenticatedHttpResult.Success -> {
            val root = runCatching { mapper.readTree(body) }.getOrNull()
            if (root?.get("accepted")?.isBoolean == true && !root.get("accepted").booleanValue()) {
                SyncTransportResult.Rejected(root.text("code") ?: "sync_rejected")
            } else {
                SyncTransportResult.Accepted
            }
        }
        is AuthenticatedHttpResult.TerminalAuthFailure -> SyncTransportResult.Rejected("sync_auth_denied")
        is AuthenticatedHttpResult.RetryableFailure,
        is AuthenticatedHttpResult.NetworkFailure,
        -> SyncTransportResult.Retryable
    }

    private fun JsonNode.text(key: String): String? =
        get(key)?.takeIf { it.isTextual }?.textValue()?.takeIf { it.isNotBlank() }
}
