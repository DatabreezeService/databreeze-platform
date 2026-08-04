package com.databreeze.android.folderautopilot

import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.LocalStorePort
import com.databreeze.android.storage.SyncQueueEntity
import com.databreeze.android.sync.SyncScheduler
import java.security.MessageDigest

/**
 * Stores only resumable Folder Autopilot intent locally. The queue never receives a path,
 * filename, source value, preview bytes, or an executable action.
 */
class FolderAutopilotOfflineActionQueue(
    private val store: LocalStorePort,
    private val scope: AccountWorkspaceScope,
    private val scheduler: SyncScheduler?,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    suspend fun enqueuePause(assignment: FolderAutopilotAssignmentSummary): String {
        check(assignment.state == FolderAutopilotAssignmentState.ACTIVE) { "assignment is not active" }
        val mutationId = mutationId("pause", assignment.assignmentId, assignment.revision.toString())
        return enqueue(
            mutationId = mutationId,
            operationType = "autopilot.pause",
            canonicalPayload = "$mutationId|${assignment.assignmentId}|${assignment.revision}",
        )
    }

    suspend fun enqueueApproval(
        approval: FolderAutopilotApprovalSummary,
        decision: FolderAutopilotApprovalDecision,
        expectedPlanHash: String = approval.planHash,
    ): String {
        val next = approval.decide(decision, expectedPlanHash)
        val mutationId = mutationId("approval", next.approvalId, next.decision.name.lowercase())
        return enqueue(
            mutationId = mutationId,
            operationType = "autopilot.approval",
            canonicalPayload = "$mutationId|${next.approvalId}|${next.planHash}|${next.decision}",
        )
    }

    suspend fun enqueueUndo(outcome: FolderAutopilotOutcomeSummary): String {
        check(outcome.undoState == FolderAutopilotUndoState.AVAILABLE) { "undo is not available" }
        val mutationId = mutationId("undo", outcome.executionId)
        return enqueue(
            mutationId = mutationId,
            operationType = "autopilot.undo",
            canonicalPayload = "$mutationId|${outcome.executionId}",
        )
    }

    private suspend fun enqueue(
        mutationId: String,
        operationType: String,
        canonicalPayload: String,
    ): String {
        store.enqueue(
            SyncQueueEntity(
                accountId = scope.accountId,
                workspaceId = scope.workspaceId,
                mutationId = mutationId,
                operationType = operationType,
                payloadHash = "sha256:${sha256(canonicalPayload)}",
                createdAtEpochMs = clock(),
            ),
        )
        scheduler?.enqueue(scope)
        return mutationId
    }

    private fun mutationId(action: String, vararg parts: String): String =
        "autopilot-$action-${sha256(parts.joinToString("\\u0000")).take(48)}"
}

private fun sha256(value: String): String = MessageDigest
    .getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString(separator = "") { byte -> "%02x".format(byte) }
