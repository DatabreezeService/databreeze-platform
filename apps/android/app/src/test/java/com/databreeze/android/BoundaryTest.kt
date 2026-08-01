package com.databreeze.android

import com.databreeze.android.security.AndroidDeviceKeyStore
import com.databreeze.android.storage.SyncQueueEntity
import com.databreeze.android.sync.SyncRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BoundaryTest {
    @Test
    fun syncRequestUsesOpaqueWorkspaceIdentity() {
        val request = SyncRequest(workspaceId = "workspace-1", cursor = null)
        assertEquals("workspace-1", request.workspaceId)
        assertEquals(null, request.cursor)
    }

    @Test
    fun queuedMutationCarriesHashAndDependencyWithoutSourceBytes() {
        val mutation = SyncQueueEntity(
            mutationId = "mutation-1",
            workspaceId = "workspace-1",
            operationType = "capture.submit",
            payloadHash = "sha256:abc",
            dependencyId = null,
        )
        assertTrue(mutation.payloadHash.startsWith("sha256:"))
        assertEquals(null, mutation.dependencyId)
    }

    @Test
    fun keystorePortHasStableDeviceKeyHandleType() {
        assertEquals("AndroidDeviceKeyStore", AndroidDeviceKeyStore::class.simpleName)
    }
}
