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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
import com.databreeze.android.workbench.ModuleDetailScreen
import com.databreeze.android.workbench.ProductModuleWorkbench
import com.databreeze.android.workbench.WorkbenchScreen
import kotlinx.coroutines.launch

private object AppRoutes {
    const val HOME = "home"
    const val CAPTURE = "capture"
    const val WORKBENCH = "workbench"
    const val MODULE = "module/{moduleId}"

    fun moduleDetail(moduleId: String): String = "module/$moduleId"
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
                        onWorkbench = { navController.navigate(AppRoutes.WORKBENCH) },
                        onCapture = { navController.navigate(AppRoutes.CAPTURE) },
                    )
                }
                composable(AppRoutes.WORKBENCH) {
                    WorkbenchScreen(
                        onModule = { module ->
                            navController.navigate(AppRoutes.moduleDetail(module.id))
                        },
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(AppRoutes.MODULE) { entry ->
                    ModuleDetailScreen(
                        module = ProductModuleWorkbench.find(
                            entry.arguments?.getString("moduleId").orEmpty(),
                        ),
                        onBack = { navController.popBackStack() },
                        onCapture = { navController.navigate(AppRoutes.CAPTURE) },
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
            }
        }
    }
}

@Composable
private fun HomeScreen(
    onWorkbench: () -> Unit,
    onCapture: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("home-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.home_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.home_body), style = MaterialTheme.typography.bodyLarge)
        Button(onClick = onWorkbench, modifier = Modifier.testTag("workbench-button")) {
            Text(stringResource(R.string.workbench_action))
        }
        Button(onClick = onCapture, modifier = Modifier.testTag("capture-button")) {
            Text(stringResource(R.string.capture_action))
        }
    }
}

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
