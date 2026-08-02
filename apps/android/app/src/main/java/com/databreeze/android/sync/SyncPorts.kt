package com.databreeze.android.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.LocalStorePort
import com.databreeze.android.storage.SyncQueueEntity
import com.databreeze.contracts.v1.Identifier
import java.util.concurrent.TimeUnit

private const val ACCOUNT_ID = "account_id"
private const val WORKSPACE_ID = "workspace_id"
private const val CURSOR = "cursor"
private const val REVISION = "revision"

data class SyncWorkInput(
    val scope: AccountWorkspaceScope,
    val cursor: String? = null,
    val revision: Long? = null,
) {
    init {
        require(cursor == null || cursor.length <= 512) { "cursor must be bounded" }
        require(cursor?.contains('\n') != true) { "cursor cannot contain line breaks" }
        require(revision == null || revision >= 0L) { "revision cannot be negative" }
    }

    fun toData(): Data = Data.Builder()
        .putString(ACCOUNT_ID, scope.accountId)
        .putString(WORKSPACE_ID, scope.workspaceId)
        .apply { cursor?.let { putString(CURSOR, it) } }
        .apply { revision?.let { putLong(REVISION, it) } }
        .build()

    companion object {
        fun fromData(data: Data): SyncWorkInput {
            require(data.keyValueMap.keys.all { it in setOf(ACCOUNT_ID, WORKSPACE_ID, CURSOR, REVISION) }) {
                "sync work input contains an unsupported field"
            }
            val accountId = data.getString(ACCOUNT_ID)
                ?: throw IllegalArgumentException("account_id is required")
            val workspaceId = data.getString(WORKSPACE_ID)
                ?: throw IllegalArgumentException("workspace_id is required")
            val revision = if (data.keyValueMap.containsKey(REVISION)) data.getLong(REVISION, -1L) else null
            return SyncWorkInput(
                scope = AccountWorkspaceScope(accountId, workspaceId),
                cursor = data.getString(CURSOR),
                revision = revision,
            )
        }
    }
}

data class SyncRequest(val scope: AccountWorkspaceScope, val cursor: String?) {
    val accountId: Identifier get() = scope.accountId
    val workspaceId: Identifier get() = scope.workspaceId
}

sealed interface SyncTransportResult {
    data object Accepted : SyncTransportResult
    data object Retryable : SyncTransportResult
    data class Rejected(val code: String) : SyncTransportResult
}

interface SyncTransport {
    suspend fun synchronize(request: SyncRequest, mutations: List<String>): SyncTransportResult
}

interface SyncScheduler {
    fun enqueue(scope: AccountWorkspaceScope, cursor: String? = null, revision: Long? = null)
    fun cancel(scope: AccountWorkspaceScope)

    companion object {
        fun uniqueWorkName(scope: AccountWorkspaceScope): String = "sync-${scope.stableKey}"
    }
}

class WorkManagerSyncScheduler(private val context: Context) : SyncScheduler {
    override fun enqueue(scope: AccountWorkspaceScope, cursor: String?, revision: Long?) {
        val request: OneTimeWorkRequest = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInputData(SyncWorkInput(scope, cursor, revision).toData())
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30L, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            SyncScheduler.uniqueWorkName(scope),
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    override fun cancel(scope: AccountWorkspaceScope) {
        WorkManager.getInstance(context).cancelUniqueWork(SyncScheduler.uniqueWorkName(scope))
    }
}

class SyncWorker(
    appContext: Context,
    params: WorkerParameters,
    private val store: LocalStorePort,
    private val transport: SyncTransport,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): ListenableWorker.Result {
        val input = try {
            SyncWorkInput.fromData(inputData)
        } catch (_: IllegalArgumentException) {
            return Result.failure()
        }
        val mutations = store.snapshotQueue(input.scope)
            .filter { it.state != SyncQueueEntity.COMPLETED_STATE }
            .map { it.mutationId }
        return when (val outcome = transport.synchronize(SyncRequest(input.scope, input.cursor), mutations)) {
            SyncTransportResult.Accepted -> {
                mutations.forEach { store.markCompleted(input.scope, it) }
                Result.success()
            }
            SyncTransportResult.Retryable -> Result.retry()
            is SyncTransportResult.Rejected -> Result.failure(
                Data.Builder().putString("reason_code", outcome.code).build(),
            )
        }
    }
}

class DataBreezeWorkerFactory(
    private val store: LocalStorePort,
    private val transport: SyncTransport,
) : WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters,
    ): ListenableWorker? = when (workerClassName) {
        SyncWorker::class.qualifiedName -> SyncWorker(appContext, workerParameters, store, transport)
        else -> null
    }
}

class UnconfiguredSyncTransport : SyncTransport {
    override suspend fun synchronize(request: SyncRequest, mutations: List<String>): SyncTransportResult =
        SyncTransportResult.Rejected("transport_not_configured")
}
