package com.databreeze.android

import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.sync.SyncScheduler
import com.databreeze.android.sync.InMemorySyncRevocationGuard
import com.databreeze.android.sync.WorkManagerSyncScheduler
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SyncSchedulerContractTest {
    @Test
    fun unique_work_name_is_stable_and_scope_bound() {
        val scope = AccountWorkspaceScope("account-1", "workspace-1")

        assertEquals("sync-${scope.stableKey}", SyncScheduler.uniqueWorkName(scope))
    }

    @Test
    fun scheduler_type_is_the_workmanager_adapter() {
        assertEquals("WorkManagerSyncScheduler", WorkManagerSyncScheduler::class.simpleName)
    }

    @Test
    fun revocation_blocks_a_worker_that_has_not_started_transport() = runBlocking {
        val guard = InMemorySyncRevocationGuard()
        val scope = AccountWorkspaceScope("account-1", "workspace-1")
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()

        val inFlight = async {
            guard.withPermit(scope) {
                entered.complete(Unit)
                release.await()
                "sent"
            }
        }
        entered.await()
        val revocation = async { guard.revoke(scope) }
        release.complete(Unit)

        assertEquals("sent", inFlight.await())
        revocation.await()
        assertNull(guard.withPermit(scope) { "must-not-send" })
    }
}
