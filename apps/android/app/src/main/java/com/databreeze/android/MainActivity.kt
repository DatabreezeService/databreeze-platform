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
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.databreeze.android.receipts.ReceiptCaptureScreen
import com.databreeze.android.receipts.ReceiptCaptureViewModel
import com.databreeze.android.receipts.ReceiptDestination
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.workbench.ModuleDetailScreen
import com.databreeze.android.workbench.ProductModuleWorkbench
import com.databreeze.android.workbench.WorkbenchScreen

private object AppRoutes {
    const val HOME = "home"
    const val CAPTURE = "capture"
    const val WORKBENCH = "workbench"
    const val MODULE = "module/{moduleId}"
    const val REVIEW = "receipt-review/{sessionId}"

    fun moduleDetail(moduleId: String): String = "module/$moduleId"
    fun review(sessionId: String): String = "receipt-review/$sessionId"
}

private val localScope = AccountWorkspaceScope("local-account", "local-workspace")

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val application = application as DataBreezeApplication
        setContent {
            DataBreezeApp(runtime = application.runtime, scope = localScope)
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun DataBreezeApp(
    runtime: AndroidRuntime,
    scope: AccountWorkspaceScope = localScope,
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
                    val viewModel = remember(runtime, scope) {
                        ReceiptCaptureViewModel(
                            scope = scope,
                            stagingStore = runtime.receiptStagingStore,
                            uploadScheduler = runtime.receiptUploadScheduler,
                            keyHandle = runtime.receiptKeyHandle,
                        ).also {
                            it.setDestination(ReceiptDestination.Hybrid(workspaceGrantId = "grant-local"))
                            it.setScopeAuthorized(true)
                        }
                    }
                    ReceiptCaptureScreen(
                        viewModel = viewModel,
                        onBack = { navController.popBackStack() },
                        onOpenReview = { sessionId ->
                            navController.navigate(AppRoutes.review(sessionId))
                        },
                    )
                }
                composable(AppRoutes.REVIEW) { entry ->
                    val sessionId = entry.arguments?.getString("sessionId").orEmpty()
                    ReceiptReviewPlaceholder(
                        sessionId = sessionId,
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
            Text(stringResource(R.string.receipt_capture_action))
        }
    }
}

@Composable
private fun ReceiptReviewPlaceholder(
    sessionId: String,
    onBack: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("receipt-review-placeholder"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.receipt_review_title), style = MaterialTheme.typography.headlineSmall)
        Text(sessionId, modifier = Modifier.testTag("receipt-review-session"))
        Button(onClick = onBack, modifier = Modifier.testTag("back-button")) {
            Text(stringResource(R.string.back_action))
        }
    }
}
