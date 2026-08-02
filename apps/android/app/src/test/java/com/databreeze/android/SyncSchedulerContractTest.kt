package com.databreeze.android

import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.sync.SyncScheduler
import com.databreeze.android.sync.WorkManagerSyncScheduler
import org.junit.Assert.assertEquals
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
}
