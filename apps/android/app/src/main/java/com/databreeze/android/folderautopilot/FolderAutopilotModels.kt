package com.databreeze.android.folderautopilot

import java.time.Instant

private val OPAQUE_IDENTIFIER = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
private val SAFE_TEXT = Regex("^[^\\u0000-\\u001f\\u007f]{1,128}$")
private val PLAN_HASH = Regex("^[0-9a-f]{64}$")
private val REASON_CODE = Regex("^[A-Z][A-Z0-9_.-]{1,63}$")

enum class FolderAutopilotAssignmentState { ACTIVE, PAUSED, RETIRED, INVALID }

enum class FolderAutopilotWatcherState { HEALTHY, PAUSED, OVERFLOWED, OFFLINE }

enum class FolderAutopilotApprovalDecision { PENDING, APPROVED, REJECTED, EXPIRED }

enum class FolderAutopilotOutcome {
    QUEUED,
    WAITING_FOR_APPROVAL,
    RUNNING,
    HANDLED,
    EXCEPTION,
    UNDO_AVAILABLE,
    UNDO_EXPIRED,
}

enum class FolderAutopilotUndoState { AVAILABLE, REQUESTED, COMPLETED, CONFLICT, EXPIRED, NOT_ELIGIBLE }

data class FolderAutopilotAssignmentSummary(
    val assignmentId: String,
    val displayName: String,
    val state: FolderAutopilotAssignmentState,
    val revision: Long,
    val watcherState: FolderAutopilotWatcherState,
) {
    init {
        requireOpaqueIdentifier(assignmentId)
        requireSafeText(displayName)
        require(revision > 0) { "revision must be positive" }
    }

    fun pause(): FolderAutopilotAssignmentSummary {
        check(state == FolderAutopilotAssignmentState.ACTIVE) { "assignment is not active" }
        return copy(state = FolderAutopilotAssignmentState.PAUSED, revision = revision + 1)
    }
}

data class FolderAutopilotApprovalSummary(
    val approvalId: String,
    val previewId: String,
    val planHash: String,
    val affectedCount: Int,
    val blockedCount: Int,
    val decision: FolderAutopilotApprovalDecision,
    val expiresAt: String,
) {
    init {
        requireOpaqueIdentifier(approvalId)
        requireOpaqueIdentifier(previewId)
        requirePlanHash(planHash)
        require(affectedCount >= 0) { "affectedCount must not be negative" }
        require(blockedCount >= 0) { "blockedCount must not be negative" }
        require(expiresAt.isNotBlank()) { "expiresAt must be present" }
        requireNotNull(parseExpiryEpochMs(expiresAt)) { "expiresAt must be an ISO-8601 timestamp" }
    }

    fun isExpired(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        nowEpochMs >= requireNotNull(parseExpiryEpochMs(expiresAt))

    fun decide(
        next: FolderAutopilotApprovalDecision,
        expectedPlanHash: String,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): FolderAutopilotApprovalSummary {
        require(next == FolderAutopilotApprovalDecision.APPROVED || next == FolderAutopilotApprovalDecision.REJECTED) {
            "only an approval or rejection can be submitted"
        }
        requirePlanHash(expectedPlanHash)
        check(decision == FolderAutopilotApprovalDecision.PENDING) { "approval is no longer pending" }
        check(!isExpired(nowEpochMs)) { "approval has expired" }
        require(planHash == expectedPlanHash) { "approval plan hash changed" }
        return copy(decision = next)
    }
}

data class FolderAutopilotOutcomeSummary(
    val executionId: String,
    val outcome: FolderAutopilotOutcome,
    val affectedCount: Int,
    val undoState: FolderAutopilotUndoState,
) {
    init {
        requireOpaqueIdentifier(executionId)
        require(affectedCount >= 0) { "affectedCount must not be negative" }
    }

    fun requestUndo(): FolderAutopilotOutcomeSummary {
        check(undoState == FolderAutopilotUndoState.AVAILABLE) { "undo is not available" }
        return copy(undoState = FolderAutopilotUndoState.REQUESTED)
    }
}

data class FolderAutopilotExceptionSummary(
    val exceptionId: String,
    val severity: String,
    val reasonCode: String,
) {
    init {
        requireOpaqueIdentifier(exceptionId)
        require(severity in setOf("INFO", "WARNING", "ERROR")) { "unsupported severity" }
        requireReasonCode(reasonCode)
    }
}

data class FolderAutopilotMobileState(
    val assignment: FolderAutopilotAssignmentSummary,
    val approval: FolderAutopilotApprovalSummary,
    val recentOutcome: FolderAutopilotOutcomeSummary,
    val exceptions: List<FolderAutopilotExceptionSummary>,
) {
    init {
        require(exceptions.size <= 50) { "too many exception summaries" }
        require(exceptions.none { it.reasonCode.contains("PATH", ignoreCase = true) }) {
            "path-bearing exception details are not allowed"
        }
    }

    fun pauseAssignment(): FolderAutopilotMobileState = copy(assignment = assignment.pause())

    fun decideApproval(
        decision: FolderAutopilotApprovalDecision,
        expectedPlanHash: String,
        nowEpochMs: Long = System.currentTimeMillis(),
    ): FolderAutopilotMobileState = copy(
        approval = approval.decide(decision, expectedPlanHash, nowEpochMs),
    )

    fun requestUndo(): FolderAutopilotMobileState = copy(recentOutcome = recentOutcome.requestUndo())
}

private fun requireOpaqueIdentifier(value: String) {
    require(OPAQUE_IDENTIFIER.matches(value)) { "identifier must be opaque and path-free" }
}

private fun requireSafeText(value: String) {
    require(SAFE_TEXT.matches(value) && value.trim() == value) { "text is not safe" }
}

private fun requirePlanHash(value: String) {
    require(PLAN_HASH.matches(value)) { "plan hash must be a lowercase SHA-256 value" }
}

private fun requireReasonCode(value: String) {
    require(REASON_CODE.matches(value)) { "reason code is not safe" }
}

private fun parseExpiryEpochMs(value: String): Long? = runCatching {
    Instant.parse(value).toEpochMilli()
}.getOrNull()
