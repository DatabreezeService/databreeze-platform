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
                        state.assignment.state.name,
                        state.assignment.revision,
                    ),
                    modifier = Modifier.testTag("autopilot-assignment-state"),
                )
                Text(stringResource(R.string.autopilot_watcher_state, state.assignment.watcherState.name))
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
                    stringResource(R.string.autopilot_approval_state, state.approval.decision.name),
                    modifier = Modifier.testTag("autopilot-approval-state"),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = onApprove,
                        enabled = state.approval.decision == FolderAutopilotApprovalDecision.PENDING,
                        modifier = Modifier.testTag("autopilot-approve-button"),
                    ) {
                        Text(stringResource(R.string.autopilot_approve))
                    }
                    OutlinedButton(
                        onClick = onReject,
                        enabled = state.approval.decision == FolderAutopilotApprovalDecision.PENDING,
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
                Text(stringResource(R.string.autopilot_outcome_state, state.recentOutcome.outcome.name))
                Text(stringResource(R.string.autopilot_affected_count, state.recentOutcome.affectedCount))
                Text(
                    stringResource(R.string.autopilot_undo_state, state.recentOutcome.undoState.name),
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
                    stringResource(R.string.autopilot_exception, exception.severity, exception.reasonCode),
                    modifier = Modifier.testTag("autopilot-exception-${exception.exceptionId}"),
                )
            }
        }
    }
}
