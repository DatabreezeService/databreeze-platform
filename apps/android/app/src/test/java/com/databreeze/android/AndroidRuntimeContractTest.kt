package com.databreeze.android

import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.sync.SyncWorkInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidRuntimeContractTest {
    @Test
    fun scope_rejects_path_like_or_unbounded_identifiers() {
        assertThrows(IllegalArgumentException::class.java) {
            AccountWorkspaceScope(accountId = "account/one", workspaceId = "workspace-1")
        }
        assertThrows(IllegalArgumentException::class.java) {
            AccountWorkspaceScope(accountId = "a".repeat(129), workspaceId = "workspace-1")
        }
    }

    @Test
    fun work_input_round_trips_only_opaque_ids_and_revisions() {
        val input = SyncWorkInput(
            scope = AccountWorkspaceScope("account-1", "workspace-1"),
            cursor = "cursor-1",
            revision = 4L,
        )

        val restored = SyncWorkInput.fromData(input.toData())

        assertEquals(input, restored)
        assertTrue(input.toData().keyValueMap.keys.all { it in setOf("account_id", "workspace_id", "cursor", "revision") })
    }

    @Test
    fun work_input_rejects_missing_scope() {
        assertThrows(IllegalArgumentException::class.java) {
            SyncWorkInput.fromData(androidx.work.Data.EMPTY)
        }
    }

    @Test
    fun work_input_rejects_source_content_fields() {
        val data = androidx.work.Data.Builder()
            .putString("account_id", "account-1")
            .putString("workspace_id", "workspace-1")
            .putString("source_bytes", "must-not-be-carried")
            .build()

        assertThrows(IllegalArgumentException::class.java) { SyncWorkInput.fromData(data) }
    }
}
