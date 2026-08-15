package com.databreeze.android.receipts

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.sync.SyncRevocationGuard
import java.util.concurrent.TimeUnit

private const val ACCOUNT_ID = "account_id"
private const val WORKSPACE_ID = "workspace_id"
private const val SESSION_ID = "artifact_session_id"
private const val DIGEST = "content_digest"
private const val DESTINATION_KIND = "destination_kind"
private const val GRANT_ID = "workspace_grant_id"
private const val UPLOADED = "uploaded_bytes"
private const val TOTAL = "total_bytes"
private const val WIFI_ONLY = "wifi_only"
private const val REQUIRES_CHARGING = "requires_charging"

data class ReceiptUploadWorkInput(
    val request: ReceiptUploadRequest,
) {
    fun toData(): Data = Data.Builder()
        .putString(ACCOUNT_ID, request.scope.accountId)
        .putString(WORKSPACE_ID, request.scope.workspaceId)
        .putString(SESSION_ID, request.artifactSessionId)
        .putString(DIGEST, request.contentDigest)
        .putString(DESTINATION_KIND, destinationKind(request.destination))
        .putString(GRANT_ID, grantId(request.destination))
        .putLong(UPLOADED, request.uploadedBytes)
        .putLong(TOTAL, request.totalBytes)
        .putBoolean(WIFI_ONLY, request.policy.wifiOnly)
        .putBoolean(REQUIRES_CHARGING, request.policy.requiresCharging)
        .build()

    companion object {
        fun fromData(data: Data): ReceiptUploadWorkInput {
            val accountId = data.getString(ACCOUNT_ID) ?: error("account_id required")
            val workspaceId = data.getString(WORKSPACE_ID) ?: error("workspace_id required")
            val destination = when (data.getString(DESTINATION_KIND)) {
                "hybrid" -> ReceiptDestination.Hybrid(data.getString(GRANT_ID) ?: error("grant"))
                "cloud" -> ReceiptDestination.Cloud(data.getString(GRANT_ID) ?: error("grant"))
                "strict_local" -> ReceiptDestination.StrictLocal
                else -> null
            }
            return ReceiptUploadWorkInput(
                ReceiptUploadRequest(
                    scope = AccountWorkspaceScope(accountId, workspaceId),
                    artifactSessionId = data.getString(SESSION_ID) ?: error("session"),
                    contentDigest = data.getString(DIGEST) ?: error("digest"),
                    destination = destination,
                    uploadedBytes = data.getLong(UPLOADED, 0L),
                    totalBytes = data.getLong(TOTAL, 0L),
                    policy = ReceiptTransferPolicy(
                        wifiOnly = data.getBoolean(WIFI_ONLY, false),
                        requiresCharging = data.getBoolean(REQUIRES_CHARGING, false),
                    ),
                ),
            )
        }

        private fun destinationKind(destination: ReceiptDestination?): String = when (destination) {
            is ReceiptDestination.Hybrid -> "hybrid"
            is ReceiptDestination.Cloud -> "cloud"
            is ReceiptDestination.StrictLocal -> "strict_local"
            null -> "missing"
        }

        private fun grantId(destination: ReceiptDestination?): String = when (destination) {
            is ReceiptDestination.Hybrid -> destination.workspaceGrantId
            is ReceiptDestination.Cloud -> destination.workspaceGrantId
            else -> ""
        }
    }
}

sealed interface ReceiptUploadTransportResult {
    data object Accepted : ReceiptUploadTransportResult
    data object Retryable : ReceiptUploadTransportResult
    data class Rejected(val code: String) : ReceiptUploadTransportResult
}

interface ReceiptUploadTransport {
    suspend fun upload(request: ReceiptUploadRequest): ReceiptUploadTransportResult
}

class UnconfiguredReceiptUploadTransport : ReceiptUploadTransport {
    override suspend fun upload(request: ReceiptUploadRequest): ReceiptUploadTransportResult =
        ReceiptUploadTransportResult.Rejected("transport_not_configured")
}

class WorkManagerReceiptUploadScheduler(
    private val context: Context,
    private val revokedScopes: () -> Set<String> = { emptySet() },
) : ReceiptUploadScheduler {
    override fun schedule(request: ReceiptUploadRequest): ReceiptUploadScheduleResult {
        when (request.destination) {
            null -> return ReceiptUploadScheduleResult(false, ReceiptUploadDenyReason.MISSING_DESTINATION)
            is ReceiptDestination.StrictLocal ->
                return ReceiptUploadScheduleResult(false, ReceiptUploadDenyReason.STRICT_LOCAL_DESTINATION)
            is ReceiptDestination.Hybrid, is ReceiptDestination.Cloud -> Unit
        }
        if (request.scope.stableKey in revokedScopes()) {
            return ReceiptUploadScheduleResult(false, ReceiptUploadDenyReason.SCOPE_REVOKED)
        }
        val work = OneTimeWorkRequestBuilder<ReceiptUploadWorker>()
            .setInputData(ReceiptUploadWorkInput(request).toData())
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(if (request.policy.wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
                    .setRequiresCharging(request.policy.requiresCharging)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30L, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            ReceiptUploadScheduler.uniqueWorkName(request.scope, request.artifactSessionId),
            ExistingWorkPolicy.KEEP,
            work,
        )
        return ReceiptUploadScheduleResult(true)
    }
}

class ReceiptUploadWorker(
    appContext: Context,
    params: WorkerParameters,
    private val transport: ReceiptUploadTransport,
    private val revocationGuard: SyncRevocationGuard,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val input = try {
            ReceiptUploadWorkInput.fromData(inputData)
        } catch (_: IllegalArgumentException) {
            return Result.failure()
        } catch (_: IllegalStateException) {
            return Result.failure()
        }
        val request = input.request
        if (request.destination == null || request.destination is ReceiptDestination.StrictLocal) {
            return Result.failure()
        }
        val outcome = revocationGuard.withPermit(request.scope) {
            transport.upload(request)
        } ?: return Result.failure(Data.Builder().putString("reason_code", "scope_revoked").build())
        return when (outcome) {
            ReceiptUploadTransportResult.Accepted -> Result.success()
            ReceiptUploadTransportResult.Retryable -> Result.retry()
            is ReceiptUploadTransportResult.Rejected -> Result.failure(
                Data.Builder().putString("reason_code", outcome.code).build(),
            )
        }
    }
}
