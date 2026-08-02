package com.databreeze.android.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.databreeze.contracts.v1.Identifier

private const val SYNC_WORKSPACE_ID = "workspace_id"

data class SyncRequest(val workspaceId: Identifier, val cursor: String?)

interface SyncTransport {
    suspend fun synchronize(request: SyncRequest): Result<String>
}

interface SyncScheduler {
    fun enqueue(workspaceId: Identifier)
}

class WorkManagerSyncScheduler(private val context: Context) : SyncScheduler {
    override fun enqueue(workspaceId: Identifier) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInputData(androidx.work.Data.Builder().putString(SYNC_WORKSPACE_ID, workspaceId).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "sync-$workspaceId",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }
}

class SyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val workspaceId = inputData.getString(SYNC_WORKSPACE_ID)
            ?: return Result.failure()
        // The transport is injected by the application layer in the next vertical slice.
        return if (workspaceId.isNotBlank()) Result.success() else Result.failure()
    }

}
