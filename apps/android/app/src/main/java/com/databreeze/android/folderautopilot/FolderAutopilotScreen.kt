package com.databreeze.android.folderautopilot

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.R

@Composable
private fun assignmentStateLabel(state: FolderAutopilotAssignmentState): String = when (state) {
    FolderAutopilotAssignmentState.ACTIVE -> stringResource(R.string.autopilot_state_active)
    FolderAutopilotAssignmentState.PAUSED -> stringResource(R.string.autopilot_state_paused)
    FolderAutopilotAssignmentState.RETIRED -> stringResource(R.string.autopilot_state_retired)
    FolderAutopilotAssignmentState.INVALID -> stringResource(R.string.autopilot_state_invalid)
}

@Composable
private fun watcherStateLabel(state: FolderAutopilotWatcherState): String = when (state) {
    FolderAutopilotWatcherState.HEALTHY -> stringResource(R.string.autopilot_watcher_healthy)
    FolderAutopilotWatcherState.PAUSED -> stringResource(R.string.autopilot_watcher_paused)
    FolderAutopilotWatcherState.OVERFLOWED -> stringResource(R.string.autopilot_watcher_overflowed)
    FolderAutopilotWatcherState.OFFLINE -> stringResource(R.string.autopilot_watcher_offline)
}

@Composable
private fun approvalDecisionLabel(decision: FolderAutopilotApprovalDecision): String = when (decision) {
    FolderAutopilotApprovalDecision.PENDING -> stringResource(R.string.autopilot_decision_pending)
    FolderAutopilotApprovalDecision.APPROVED -> stringResource(R.string.autopilot_decision_approved)
    FolderAutopilotApprovalDecision.REJECTED -> stringResource(R.string.autopilot_decision_rejected)
    FolderAutopilotApprovalDecision.EXPIRED -> stringResource(R.string.autopilot_decision_expired)
}

@Composable
private fun outcomeLabel(outcome: FolderAutopilotOutcome): String = when (outcome) {
    FolderAutopilotOutcome.QUEUED -> stringResource(R.string.autopilot_outcome_queued)
    FolderAutopilotOutcome.WAITING_FOR_APPROVAL -> stringResource(R.string.autopilot_outcome_waiting)
    FolderAutopilotOutcome.RUNNING -> stringResource(R.string.autopilot_outcome_running)
    FolderAutopilotOutcome.HANDLED -> stringResource(R.string.autopilot_outcome_handled)
    FolderAutopilotOutcome.EXCEPTION -> stringResource(R.string.autopilot_outcome_exception)
    FolderAutopilotOutcome.UNDO_AVAILABLE -> stringResource(R.string.autopilot_outcome_undo_available)
    FolderAutopilotOutcome.UNDO_EXPIRED -> stringResource(R.string.autopilot_outcome_undo_expired)
}

@Composable
private fun undoStateLabel(state: FolderAutopilotUndoState): String = when (state) {
    FolderAutopilotUndoState.AVAILABLE -> stringResource(R.string.autopilot_undo_available)
    FolderAutopilotUndoState.REQUESTED -> stringResource(R.string.autopilot_undo_requested)
    FolderAutopilotUndoState.COMPLETED -> stringResource(R.string.autopilot_undo_completed)
    FolderAutopilotUndoState.CONFLICT -> stringResource(R.string.autopilot_undo_conflict)
    FolderAutopilotUndoState.EXPIRED -> stringResource(R.string.autopilot_undo_expired)
    FolderAutopilotUndoState.NOT_ELIGIBLE -> stringResource(R.string.autopilot_undo_not_eligible)
}

@Composable
private fun severityLabel(value: String): String = when (value) {
    "INFO" -> stringResource(R.string.autopilot_severity_info)
    "WARNING" -> stringResource(R.string.autopilot_severity_warning)
    "ERROR" -> stringResource(R.string.autopilot_severity_error)
    else -> value
}

@Composable
fun FolderAutopilotScreen(
    state: FolderAutopilotMobileState,
    onPause: () -> Unit,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onUndo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .testTag("autopilot-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.autopilot_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.autopilot_body), style = MaterialTheme.typography.bodyLarge)

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(stringResource(R.string.autopilot_assignment_heading), style = MaterialTheme.typography.titleMedium)
                Text(state.assignment.displayName, style = MaterialTheme.typography.bodyLarge)
                Text(
                    stringResource(
                        R.string.autopilot_assignment_state,
                        assignmentStateLabel(state.assignment.state),
                        state.assignment.revision,
                    ),
                    modifier = Modifier.testTag("autopilot-assignment-state"),
                )
                Text(stringResource(R.string.autopilot_watcher_state, watcherStateLabel(state.assignment.watcherState)))
                Button(
                    onClick = onPause,
                    enabled = state.assignment.state == FolderAutopilotAssignmentState.ACTIVE,
                    modifier = Modifier.testTag("autopilot-pause-button"),
                ) {
                    Text(
                        if (state.assignment.state == FolderAutopilotAssignmentState.PAUSED) {
                            stringResource(R.string.autopilot_paused)
                        } else {
                            stringResource(R.string.autopilot_pause)
                        },
                    )
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(stringResource(R.string.autopilot_approval_heading), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.autopilot_preview_id, state.approval.previewId))
                Text(stringResource(R.string.autopilot_plan_hash, state.approval.planHash.take(12)))
                Text(
                    stringResource(
                        R.string.autopilot_approval_counts,
                        state.approval.affectedCount,
                        state.approval.blockedCount,
                    ),
                )
                Text(
                    stringResource(R.string.autopilot_approval_state, approvalDecisionLabel(state.approval.decision)),
                    modifier = Modifier.testTag("autopilot-approval-state"),
                )
                val approvalExpired = state.approval.isExpired()
                if (approvalExpired && state.approval.decision == FolderAutopilotApprovalDecision.PENDING) {
                    Text(
                        stringResource(R.string.autopilot_approval_expired),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.testTag("autopilot-approval-expired"),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = onApprove,
                        enabled = state.approval.decision == FolderAutopilotApprovalDecision.PENDING && !approvalExpired,
                        modifier = Modifier.testTag("autopilot-approve-button"),
                    ) {
                        Text(stringResource(R.string.autopilot_approve))
                    }
                    OutlinedButton(
                        onClick = onReject,
                        enabled = state.approval.decision == FolderAutopilotApprovalDecision.PENDING && !approvalExpired,
                        modifier = Modifier.testTag("autopilot-reject-button"),
                    ) {
                        Text(stringResource(R.string.autopilot_reject))
                    }
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(stringResource(R.string.autopilot_outcomes_heading), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.autopilot_outcome_state, outcomeLabel(state.recentOutcome.outcome)))
                Text(stringResource(R.string.autopilot_affected_count, state.recentOutcome.affectedCount))
                Text(
                    stringResource(R.string.autopilot_undo_state, undoStateLabel(state.recentOutcome.undoState)),
                    modifier = Modifier.testTag("autopilot-undo-state"),
                )
                Button(
                    onClick = onUndo,
                    enabled = state.recentOutcome.undoState == FolderAutopilotUndoState.AVAILABLE,
                    modifier = Modifier.testTag("autopilot-undo-button"),
                ) {
                    Text(stringResource(R.string.autopilot_undo))
                }
            }
        }

        if (state.exceptions.isNotEmpty()) {
            HorizontalDivider()
            Text(stringResource(R.string.autopilot_exceptions_heading), style = MaterialTheme.typography.titleMedium)
            state.exceptions.forEach { exception ->
                Text(
                    stringResource(R.string.autopilot_exception, severityLabel(exception.severity), exception.reasonCode),
                    modifier = Modifier.testTag("autopilot-exception-${exception.exceptionId}"),
                )
            }
        }
    }
}
