package com.databreeze.android

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.databreeze.android.storage.DataBreezeDatabase
import com.databreeze.android.storage.SyncQueueEntity
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoomIsolationTest {
    @Test
    fun queue_queries_are_account_and_workspace_scoped_and_idempotent() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext<Context>(),
            DataBreezeDatabase::class.java,
        ).allowMainThreadQueries().build()
        try {
            val first = SyncQueueEntity(
                accountId = "account-a",
                workspaceId = "workspace-a",
                mutationId = "mutation-1",
                operationType = "capture.submit",
                payloadHash = "sha256:${"a".repeat(64)}",
            )
            database.syncQueue().enqueue(first)
            database.syncQueue().enqueue(first)
            database.syncQueue().enqueue(first.copy(accountId = "account-b"))

            assertEquals(listOf(first), database.syncQueue().snapshot("account-a", "workspace-a"))
            assertEquals(1, database.syncQueue().snapshot("account-b", "workspace-a").size)
            assertTrue(database.syncQueue().snapshot("account-a", "workspace-b").isEmpty())
        } finally {
            database.close()
        }
    }
}
