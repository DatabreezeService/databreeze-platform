package com.databreeze.android.folderautopilot

import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.InMemoryLocalStore
import com.databreeze.android.sync.SyncScheduler
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Assert.assertTrue
import org.junit.Test

class FolderAutopilotOfflineQueueTest {
    private val scope = AccountWorkspaceScope("account-1", "workspace-1")
    private val assignment = FolderAutopilotAssignmentSummary(
        assignmentId = "assignment-1",
        displayName = "Invoice intake",
        state = FolderAutopilotAssignmentState.ACTIVE,
        revision = 3,
        watcherState = FolderAutopilotWatcherState.HEALTHY,
    )
    private val approval = FolderAutopilotApprovalSummary(
        approvalId = "approval-1",
        previewId = "preview-1",
        planHash = "a".repeat(64),
        affectedCount = 1,
        blockedCount = 0,
        decision = FolderAutopilotApprovalDecision.PENDING,
        expiresAt = "2026-08-05T00:00:00Z",
    )
    private val outcome = FolderAutopilotOutcomeSummary(
        executionId = "execution-1",
        outcome = FolderAutopilotOutcome.UNDO_AVAILABLE,
        affectedCount = 1,
        undoState = FolderAutopilotUndoState.AVAILABLE,
    )

    @Test
    fun queues_only_opaque_ids_revisions_and_hashes() = runBlocking {
        val store = InMemoryLocalStore()
        val scheduler = RecordingScheduler()
        val queue = FolderAutopilotOfflineActionQueue(store, scope, scheduler) { 1_000L }

        queue.enqueuePause(assignment)
        queue.enqueueApproval(approval, FolderAutopilotApprovalDecision.APPROVED)
        queue.enqueueUndo(outcome)

        val queued = store.snapshotQueue(scope)
        assertEquals(3, queued.size)
        assertTrue(queued.all { it.operationType.startsWith("autopilot.") })
        assertTrue(queued.all { it.payloadHash.matches(Regex("sha256:[0-9a-f]{64}")) })
        assertTrue(queued.all { it.mutationId.contains("/").not() })
        assertEquals(3, scheduler.enqueued.size)
        assertEquals(1_000L, queued.first().createdAtEpochMs)
    }

    @Test
    fun approval_queue_requires_pending_state_and_exact_plan_hash() = runBlocking {
        val store = InMemoryLocalStore()
        val queue = FolderAutopilotOfflineActionQueue(store, scope, null) { 2_000L }

        queue.enqueueApproval(approval, FolderAutopilotApprovalDecision.APPROVED)
        val completed = approval.copy(decision = FolderAutopilotApprovalDecision.APPROVED)
        try {
            queue.enqueueApproval(completed, FolderAutopilotApprovalDecision.REJECTED)
            fail("an already-decided approval must not be queued")
        } catch (_: IllegalStateException) {
            // Expected fail-closed behavior.
        }
    }

    private class RecordingScheduler : SyncScheduler {
        val enqueued = mutableListOf<AccountWorkspaceScope>()

        override fun enqueue(scope: AccountWorkspaceScope, cursor: String?, revision: Long?) {
            enqueued += scope
        }

        override fun cancel(scope: AccountWorkspaceScope) = Unit
    }
}
