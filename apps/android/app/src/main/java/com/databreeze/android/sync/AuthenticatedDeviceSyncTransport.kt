package com.databreeze.android.sync

import com.databreeze.android.network.AuthenticatedApiTransport
import com.databreeze.android.network.AuthenticatedHttpRequest
import com.databreeze.android.network.AuthenticatedHttpResult
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.DeviceSyncOperationEntity
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
    private val organizationId: String? = null,
    private val now: () -> String = { Instant.now().toString() },
) : SyncTransport {
    private val mapper = jacksonObjectMapper()

    override suspend fun synchronize(
        request: SyncRequest,
        mutations: List<String>,
    ): SyncTransportResult = synchronize(request, mutations, emptyList())

    override suspend fun synchronize(
        request: SyncRequest,
        mutations: List<String>,
        operations: List<DeviceSyncOperationEntity>,
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
        // Admit complete typed operations through the durable DSO endpoint. The Room queue keeps
        // the encrypted payload and the worker passes only identifiers in WorkManager input.
        // Each request is idempotent by operation ID, so a lost acknowledgement is safe to retry.
        for (operation in operations.take(100)) {
            when (val admitted = admit(operation, request.scope)) {
                SyncTransportResult.Accepted -> Unit
                else -> return admitted
            }
        }

        // Legacy digest-only queue records do not contain enough typed identity for DSO. Keep the
        // fail-closed behavior instead of fabricating an entity or sending source content.
        if (mutations.isNotEmpty()) return SyncTransportResult.Rejected("sync_mutation_contract_required")

        if (operations.isNotEmpty()) return SyncTransportResult.Accepted

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

    private suspend fun admit(
        operation: DeviceSyncOperationEntity,
        scope: AccountWorkspaceScope,
    ): SyncTransportResult {
        if (operation.accountId != scope.accountId || operation.workspaceId != scope.workspaceId) {
            return SyncTransportResult.Rejected("sync_scope_mismatch")
        }
        val dependencies = operation.dependencyIds?.let {
            runCatching { mapper.readTree(it).takeIf { node -> node.isArray }?.mapNotNull { id -> id.textValue() }?.takeIf { ids -> ids.size <= 64 } }.getOrNull()
        }
        if (operation.dependencyIds != null && dependencies == null) return SyncTransportResult.Rejected("sync_dependency_invalid")
        val body = mapper.writeValueAsString(
            linkedMapOf(
                "operationId" to operation.operationId,
                "deviceId" to operation.deviceId,
                "tenantScope" to buildMap {
                    put("scopeType", "workspace")
                    put("accountId", operation.accountId)
                    put("workspaceId", operation.workspaceId)
                    organizationId?.takeIf { it.isNotBlank() }?.let { put("organizationId", it) }
                },
                "entityType" to operation.entityType,
                "entityId" to operation.entityId,
                "kind" to operation.kind,
                "payloadClass" to operation.payloadClass,
                "payloadDigest" to operation.payloadDigest,
                "createdAt" to Instant.ofEpochMilli(operation.createdAtEpochMs).toString(),
                "encryptedPayload" to operation.encryptedPayload,
                "dependencyIds" to dependencies,
                "baseRevision" to operation.baseRevision,
                "policyVersionId" to operation.policyVersionId,
                "classification" to operation.classification,
            ).filterValues { it != null },
        )
        return when (
            val response = transport.execute(
                AuthenticatedHttpRequest(
                    method = "POST",
                    path = "/v1/devices/sync/operations",
                    jsonBody = body,
                    idempotencyKey = "android-operation-${operation.operationId}",
                ),
            )
        ) {
            is AuthenticatedHttpResult.Success -> response.toSyncResult()
            is AuthenticatedHttpResult.TerminalAuthFailure -> SyncTransportResult.Rejected("sync_auth_denied")
            is AuthenticatedHttpResult.RetryableFailure,
            is AuthenticatedHttpResult.NetworkFailure,
            -> SyncTransportResult.Retryable
        }
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
