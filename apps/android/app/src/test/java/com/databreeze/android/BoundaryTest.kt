package com.databreeze.android

import com.databreeze.android.security.AndroidDeviceKeyStore
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.InMemoryLocalStore
import com.databreeze.android.storage.SyncQueueEntity
import com.databreeze.android.sync.SyncRequest
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class BoundaryTest {
    @Test
    fun syncRequestUsesOpaqueWorkspaceIdentity() {
        val request = SyncRequest(
            scope = AccountWorkspaceScope("account-1", "workspace-1"),
            cursor = null,
        )
        assertEquals("workspace-1", request.workspaceId)
        assertEquals(null, request.cursor)
    }

    @Test
    fun queuedMutationCarriesHashAndDependencyWithoutSourceBytes() {
        val mutation = SyncQueueEntity(
            accountId = "account-1",
            workspaceId = "workspace-1",
            mutationId = "mutation-1",
            operationType = "capture.submit",
            payloadHash = "sha256:${"a".repeat(64)}",
            dependencyId = null,
        )
        assertTrue(mutation.payloadHash.startsWith("sha256:"))
        assertEquals(null, mutation.dependencyId)
    }

    @Test
    fun keystorePortHasStableDeviceKeyHandleType() {
        assertEquals("AndroidDeviceKeyStore", AndroidDeviceKeyStore::class.simpleName)
        assertThrows(IllegalArgumentException::class.java) {
            AndroidDeviceKeyStore.validateAlias("../credential")
        }
    }

    @Test
    fun scope_key_is_stable_and_content_free() {
        val scope = AccountWorkspaceScope("account-1", "workspace-1")
        assertEquals(70, scope.stableKey.length)
        assertTrue(scope.stableKey.startsWith("scope-"))
    }

    @Test
    fun in_memory_store_cannot_cross_account_or_workspace_boundaries() = runBlocking {
        val store = InMemoryLocalStore()
        val first = AccountWorkspaceScope("account-1", "workspace-1")
        val second = AccountWorkspaceScope("account-2", "workspace-1")
        store.enqueue(
            SyncQueueEntity(
                accountId = first.accountId,
                workspaceId = first.workspaceId,
                mutationId = "mutation-1",
                operationType = "capture.submit",
                payloadHash = "sha256:${"b".repeat(64)}",
            ),
        )
        store.enqueue(
            SyncQueueEntity(
                accountId = second.accountId,
                workspaceId = second.workspaceId,
                mutationId = "mutation-1",
                operationType = "capture.submit",
                payloadHash = "sha256:${"c".repeat(64)}",
            ),
        )

        assertEquals(1, store.snapshotQueue(first).size)
        assertEquals("account-1", store.snapshotQueue(first).single().accountId)
        store.clear(first)
        assertEquals(1, store.snapshotQueue(second).size)
    }
}
