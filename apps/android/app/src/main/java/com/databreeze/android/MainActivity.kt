package com.databreeze.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.storage.InMemoryLocalStore
import com.databreeze.android.storage.LocalStorePort
import com.databreeze.android.storage.SyncQueueEntity
import com.databreeze.android.sync.SyncScheduler
import com.databreeze.android.folderautopilot.FolderAutopilotApprovalDecision
import com.databreeze.android.folderautopilot.FolderAutopilotAssignmentState
import com.databreeze.android.folderautopilot.FolderAutopilotAssignmentSummary
import com.databreeze.android.folderautopilot.FolderAutopilotExceptionSummary
import com.databreeze.android.folderautopilot.FolderAutopilotMobileState
import com.databreeze.android.folderautopilot.FolderAutopilotOfflineActionQueue
import com.databreeze.android.folderautopilot.FolderAutopilotOutcome
import com.databreeze.android.folderautopilot.FolderAutopilotOutcomeSummary
import com.databreeze.android.folderautopilot.FolderAutopilotApprovalSummary
import com.databreeze.android.folderautopilot.FolderAutopilotUndoState
import com.databreeze.android.folderautopilot.FolderAutopilotWatcherState
import com.databreeze.android.folderautopilot.FolderAutopilotScreen
import kotlinx.coroutines.launch

private object AppRoutes {
    const val HOME = "home"
    const val CAPTURE = "capture"
    const val AUTOPILOT = "autopilot"
}

private val localScope = AccountWorkspaceScope("local-account", "local-workspace")
private const val DRAFT_MUTATION_ID = "capture-draft"
private const val DRAFT_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val application = application as DataBreezeApplication
        setContent {
            DataBreezeApp(
                localStore = application.runtime.localStore,
                scope = localScope,
                syncScheduler = application.runtime.syncScheduler,
            )
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun DataBreezeApp(
    localStore: LocalStorePort = remember { InMemoryLocalStore() },
    scope: AccountWorkspaceScope = localScope,
    syncScheduler: SyncScheduler? = null,
) {
    val navController = rememberNavController()
    var autopilotState by remember { mutableStateOf(sampleFolderAutopilotState()) }
    val autopilotActions = remember(localStore, scope, syncScheduler) {
        FolderAutopilotOfflineActionQueue(localStore, scope, syncScheduler)
    }
    val autopilotActionScope = rememberCoroutineScope()
    DataBreezeTheme {
        Scaffold(
            topBar = { TopAppBar(title = { Text(stringResource(R.string.app_name)) }) },
        ) { padding ->
            NavHost(
                navController = navController,
                startDestination = AppRoutes.HOME,
                modifier = Modifier.padding(padding),
            ) {
                composable(AppRoutes.HOME) {
                    HomeScreen(
                        onCapture = { navController.navigate(AppRoutes.CAPTURE) },
                        onAutopilot = { navController.navigate(AppRoutes.AUTOPILOT) },
                    )
                }
                composable(AppRoutes.CAPTURE) {
                    CaptureScreen(
                        localStore = localStore,
                        scope = scope,
                        syncScheduler = syncScheduler,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(AppRoutes.AUTOPILOT) {
                    FolderAutopilotScreen(
                        state = autopilotState,
                        onPause = {
                            autopilotActionScope.launch {
                                val current = autopilotState
                                autopilotActions.enqueuePause(current.assignment)
                                autopilotState = current.pauseAssignment()
                            }
                        },
                        onApprove = {
                            autopilotActionScope.launch {
                                val current = autopilotState
                                val nowEpochMs = System.currentTimeMillis()
                                autopilotActions.enqueueApproval(
                                    current.approval,
                                    FolderAutopilotApprovalDecision.APPROVED,
                                    current.approval.planHash,
                                    nowEpochMs,
                                )
                                autopilotState = current.decideApproval(
                                    FolderAutopilotApprovalDecision.APPROVED,
                                    current.approval.planHash,
                                    nowEpochMs,
                                )
                            }
                        },
                        onReject = {
                            autopilotActionScope.launch {
                                val current = autopilotState
                                val nowEpochMs = System.currentTimeMillis()
                                autopilotActions.enqueueApproval(
                                    current.approval,
                                    FolderAutopilotApprovalDecision.REJECTED,
                                    current.approval.planHash,
                                    nowEpochMs,
                                )
                                autopilotState = current.decideApproval(
                                    FolderAutopilotApprovalDecision.REJECTED,
                                    current.approval.planHash,
                                    nowEpochMs,
                                )
                            }
                        },
                        onUndo = {
                            autopilotActionScope.launch {
                                val current = autopilotState
                                autopilotActions.enqueueUndo(current.recentOutcome)
                                autopilotState = current.requestUndo()
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(onCapture: () -> Unit, onAutopilot: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("home-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.home_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.home_body), style = MaterialTheme.typography.bodyLarge)
        Button(onClick = onCapture, modifier = Modifier.testTag("capture-button")) {
            Text(stringResource(R.string.capture_action))
        }
        Button(onClick = onAutopilot, modifier = Modifier.testTag("autopilot-button")) {
            Text(stringResource(R.string.autopilot_title))
        }
    }
}

private fun sampleFolderAutopilotState() = FolderAutopilotMobileState(
    assignment = FolderAutopilotAssignmentSummary(
        assignmentId = "assignment-1",
        displayName = "Invoice intake",
        state = FolderAutopilotAssignmentState.ACTIVE,
        revision = 3,
        watcherState = FolderAutopilotWatcherState.HEALTHY,
    ),
    approval = FolderAutopilotApprovalSummary(
        approvalId = "approval-1",
        previewId = "preview-1",
        planHash = "a".repeat(64),
        affectedCount = 2,
        blockedCount = 1,
        decision = FolderAutopilotApprovalDecision.PENDING,
        expiresAt = "2026-08-05T00:00:00Z",
    ),
    recentOutcome = FolderAutopilotOutcomeSummary(
        executionId = "execution-1",
        outcome = FolderAutopilotOutcome.UNDO_AVAILABLE,
        affectedCount = 2,
        undoState = FolderAutopilotUndoState.AVAILABLE,
    ),
    exceptions = listOf(
        FolderAutopilotExceptionSummary(
            exceptionId = "exception-1",
            severity = "WARNING",
            reasonCode = "DESTINATION_COLLISION",
        ),
    ),
)

@Composable
private fun CaptureScreen(
    localStore: LocalStorePort,
    scope: AccountWorkspaceScope,
    syncScheduler: SyncScheduler?,
    onBack: () -> Unit,
) {
    val queue by localStore.observeQueue(scope).collectAsState(initial = emptyList())
    val coroutineScope = rememberCoroutineScope()
    val submitted = queue.any { it.mutationId == DRAFT_MUTATION_ID }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("capture-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.capture_title), style = MaterialTheme.typography.headlineSmall)
        Text(
            stringResource(if (submitted) R.string.capture_saved else R.string.capture_body),
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.testTag("draft-status"),
        )
        Button(
            onClick = {
                coroutineScope.launch {
                    localStore.enqueue(
                        SyncQueueEntity(
                            accountId = scope.accountId,
                            workspaceId = scope.workspaceId,
                            mutationId = DRAFT_MUTATION_ID,
                            operationType = "capture.submit",
                            payloadHash = DRAFT_DIGEST,
                            createdAtEpochMs = System.currentTimeMillis(),
                        ),
                    )
                    syncScheduler?.enqueue(scope)
                }
            },
            modifier = Modifier.testTag("save-button"),
        ) {
            Text(stringResource(R.string.capture_save))
        }
        Button(onClick = onBack, modifier = Modifier.testTag("back-button")) {
            Text(stringResource(R.string.back_action))
        }
    }
}
