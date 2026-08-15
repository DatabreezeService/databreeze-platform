package com.databreeze.android

import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.databreeze.android.capture.CaptureProfile
import com.databreeze.android.capture.CaptureScreen
import com.databreeze.android.capture.VoiceCaptureScreen
import com.databreeze.android.dashboard.DashboardScreen
import com.databreeze.android.dashboard.DashboardViewModel
import com.databreeze.android.network.AuthenticatedApiRuntime
import com.databreeze.android.network.AuthenticatedIamApiClient
import com.databreeze.android.network.AndroidSessionState
import com.databreeze.android.network.IamApiResult
import com.databreeze.android.network.LiveBootstrapSnapshot
import com.databreeze.android.network.ProtectedAuthenticatedApiSession
import com.databreeze.android.auth.MfaRequiredScreen
import com.databreeze.android.auth.ProductionSignInScreen
import com.databreeze.android.receipts.ReceiptCaptureScreen
import com.databreeze.android.receipts.ReceiptCaptureViewModel
import com.databreeze.android.receipts.ReceiptDestination
import com.databreeze.android.receipts.ReceiptReviewScreen
import com.databreeze.android.receipts.ReceiptReviewViewModel
import com.databreeze.android.workbench.ModuleDetailScreen
import com.databreeze.android.workbench.ProductModuleWorkbench
import com.databreeze.android.workbench.WorkbenchScreen
import com.databreeze.android.datasets.DatasetPickerScreen
import com.databreeze.android.datasets.DatasetPickerViewModel
import com.databreeze.android.network.DatasetApiResult
import com.databreeze.android.demo.DemoWorkspaceApp
import com.databreeze.android.analysis.LiveAnalysisScreen
import com.databreeze.android.billing.AuthenticatedBillingScreen
import com.databreeze.android.diagnostics.DiagnosticsScreen
import com.databreeze.android.operations.AdminTrackingScreen
import com.databreeze.android.notifications.NotificationsScreen
import com.databreeze.android.tasks.MobileTasksScreen
import com.databreeze.android.evidence.EvidenceScreen
import com.databreeze.android.approvals.ApprovalScreen
import com.databreeze.android.sync.StrictLocalScreen
import com.databreeze.android.network.DeviceEnrollmentApiClient
import com.databreeze.android.security.AndroidDeviceSigningKeyStore
import com.databreeze.android.ui.AppActionRow
import com.databreeze.android.ui.AppBottomNavigation
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppMetricCard
import com.databreeze.android.ui.AppMoreListItem
import com.databreeze.android.ui.AppNavItem
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner
import com.databreeze.android.ui.AppTopBar
import com.databreeze.android.storage.AccountWorkspaceScope
import java.security.MessageDigest
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

private object AppRoutes {
    const val HOME = "home"
    const val CAPTURE = "capture"
    const val PROFILE_CAPTURE = "profile-capture"
    const val VOICE_CAPTURE = "voice-capture"
    const val DASHBOARD = "dashboard"
    const val BILLING = "billing"
    const val DATASETS = "datasets"
    const val ANALYSIS = "analysis"
    const val WORKBENCH = "workbench"
    const val MODULE = "module/{moduleId}"
    const val REVIEW = "receipt-review/{sessionId}"
    const val DIAGNOSTICS = "diagnostics"
    const val OPERATIONS = "operations"
    const val NOTIFICATIONS = "notifications"
    const val TASKS = "tasks"
    const val EVIDENCE = "evidence"
    const val APPROVALS = "approvals"
    const val STRICT_LOCAL = "strict-local"
    const val MORE = "more"

    fun moduleDetail(moduleId: String): String = "module/$moduleId"
    fun review(sessionId: String): String = "receipt-review/$sessionId"
}

class MainActivity : ComponentActivity() {
    private val paymentReturnState = MutableStateFlow<Long?>(null)
    private val routeTokenState = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        paymentReturnState.value = parsePaymentReturn(intent)
        routeTokenState.value = parseRouteToken(intent)
        val application = application as DataBreezeApplication
        setContent {
            val demoRepository = application.demoWorkspaceRepository
            if (demoRepository != null) {
                DemoWorkspaceApp(repository = demoRepository)
            } else {
                val sessionState by application.sessionManager.state.collectAsState()
                val runtime by application.runtimeState.collectAsState()
                val paymentOrderCode by paymentReturnState.asStateFlow().collectAsState()
                val routeToken by routeTokenState.asStateFlow().collectAsState()
                when (val current = sessionState) {
                    AndroidSessionState.SignedOut -> ProductionSignInScreen(
                        sessionManager = application.sessionManager,
                        onAuthenticated = application::refreshRuntime,
                    )
                    is AndroidSessionState.SignedIn -> {
                        if (current.session.mfaRequired || current.session.mfaReenrollmentRequired) {
                            MfaRequiredScreen(onSignOut = {
                                lifecycleScope.launch { application.signOut() }
                            })
                        } else {
                            DataBreezeApp(
                                runtime = runtime,
                                authenticatedApiRuntime = application.authenticatedApiRuntime,
                                iamApiClient = application.iamApiClient,
                                session = current.session,
                                onSignOut = {
                                    lifecycleScope.launch { application.signOut() }
                                },
                                paymentOrderCode = paymentOrderCode,
                                routeToken = routeToken,
                                onDeviceEnrolled = { deviceId, grantId ->
                                    val saved = application.persistDeviceEnrollment(deviceId, grantId)
                                    saved && !grantId.isNullOrBlank()
                                },
                                onCleanupVerified = {
                                    lifecycleScope.launch {
                                        val scope = current.session.let { AccountWorkspaceScope(it.accountId, it.workspaceId) }
                                        runtime.receiptStagingStore.list(scope)
                                            .filter { runtime.receiptArtifactReferenceStore.find(it.artifactSessionId) != null }
                                            .forEach { runtime.receiptStagingStore.delete(scope, it.artifactSessionId) }
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        paymentReturnState.value = parsePaymentReturn(intent)
        routeTokenState.value = parseRouteToken(intent)
    }

    private fun parsePaymentReturn(value: Intent?): Long? {
        val data: Uri = value?.data ?: return null
        if (data.scheme != "https" || data.host != BuildConfig.DATABREEZE_WEB_HOST) return null
        if (!data.path.orEmpty().startsWith("/vi-VN/billing")) return null
        return data.getQueryParameter("orderCode")?.toLongOrNull()?.takeIf { it > 0L }
    }

    private fun parseRouteToken(value: Intent?): String? {
        val data = value?.data ?: return null
        if (data.scheme != "https" || data.host != BuildConfig.DATABREEZE_WEB_HOST) return null
        val segments = data.pathSegments
        val routeIndex = segments.indexOf("route")
        val token = data.getQueryParameter("routeToken")
            ?: segments.takeIf { routeIndex > 0 && segments.getOrNull(routeIndex - 1) == "mobile" && segments.size > routeIndex + 1 }
                ?.get(routeIndex + 1)
        return token?.takeIf { it.length in 16..512 && it.matches(Regex("^[A-Za-z0-9._~-]+$")) }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun DataBreezeApp(
    runtime: AndroidRuntime,
    authenticatedApiRuntime: AuthenticatedApiRuntime? = null,
    iamApiClient: AuthenticatedIamApiClient? = null,
    session: ProtectedAuthenticatedApiSession? = null,
    onSignOut: (() -> Unit)? = null,
    paymentOrderCode: Long? = null,
    routeToken: String? = null,
    onDeviceEnrolled: ((String, String?) -> Boolean)? = null,
    onCleanupVerified: () -> Unit = {},
) {
    val navController = rememberNavController()
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStackEntry?.destination?.route ?: AppRoutes.HOME
    var selectedDatasetId by remember { mutableStateOf("") }
    var selectedDatasetVersionId by remember { mutableStateOf("") }
    var bootstrap by remember(session?.sessionId) { mutableStateOf<LiveBootstrapSnapshot?>(null) }
    var bootstrapError by remember(session?.sessionId) { mutableStateOf<String?>(null) }
    var role by remember(session?.sessionId) { mutableStateOf<String?>(null) }
    val navigateTo: (String) -> Unit = { route ->
        navController.navigate(route) {
            launchSingleTop = true
            restoreState = true
        }
    }
    LaunchedEffect(iamApiClient, session?.sessionId) {
        bootstrap = null
        bootstrapError = null
        role = null
        if (iamApiClient != null && session != null) {
            when (val result = iamApiClient.bootstrap(session)) {
                is IamApiResult.Success -> bootstrap = result.value
                is IamApiResult.Rejected -> bootstrapError = result.code
                IamApiResult.Retryable -> bootstrapError = "network_unavailable"
            }
            when (val result = iamApiClient.currentRole(session)) {
                is IamApiResult.Success -> role = result.value
                is IamApiResult.Rejected -> role = "unknown"
                IamApiResult.Retryable -> role = "pending"
            }
        }
    }
    LaunchedEffect(routeToken, runtime.mobileApiClient) {
        val token = routeToken ?: return@LaunchedEffect
        val client = runtime.mobileApiClient ?: return@LaunchedEffect
        when (val result = client.resolveRouteToken(token)) {
            is com.databreeze.android.network.MobileApiResult.Ready -> when (result.value) {
                "tasks" -> navController.navigate(AppRoutes.TASKS)
                "evidence" -> navController.navigate(AppRoutes.EVIDENCE)
                "billing" -> navController.navigate(AppRoutes.BILLING)
            }
            else -> Unit
        }
    }
    DataBreezeTheme {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = {
                AppTopBar(
                    title = when {
                        currentRoute == AppRoutes.HOME -> stringResource(R.string.home_title)
                        currentRoute == AppRoutes.CAPTURE -> stringResource(R.string.receipt_capture_title)
                        currentRoute == AppRoutes.DASHBOARD -> stringResource(R.string.dashboard_action)
                        currentRoute == AppRoutes.DATASETS -> stringResource(R.string.datasets_action)
                        currentRoute == AppRoutes.ANALYSIS -> stringResource(R.string.analysis_action)
                        currentRoute == AppRoutes.BILLING -> stringResource(R.string.android_billing_title)
                        currentRoute == AppRoutes.MORE -> stringResource(R.string.app_more_title)
                        currentRoute == AppRoutes.TASKS -> stringResource(R.string.mobile_tasks_action)
                        currentRoute == AppRoutes.NOTIFICATIONS -> stringResource(R.string.notifications_action)
                        currentRoute == AppRoutes.OPERATIONS -> stringResource(R.string.operations_tracking_action)
                        currentRoute == AppRoutes.EVIDENCE -> stringResource(R.string.evidence_action)
                        currentRoute == AppRoutes.APPROVALS -> stringResource(R.string.approvals_action)
                        currentRoute == AppRoutes.DIAGNOSTICS -> stringResource(R.string.diagnostics_action)
                        currentRoute == AppRoutes.STRICT_LOCAL -> stringResource(R.string.strict_local_title)
                        currentRoute == AppRoutes.WORKBENCH -> stringResource(R.string.workbench_title)
                        else -> stringResource(R.string.app_name)
                    },
                    scopeLabel = bootstrap?.let { "${it.organizationName} · ${it.workspaceName}" },
                    showBack = currentRoute != AppRoutes.HOME && currentRoute != AppRoutes.MORE,
                    onBack = { navController.popBackStack() },
                    onNotifications = { navigateTo(AppRoutes.NOTIFICATIONS) },
                )
            },
            bottomBar = {
                val compactRoutes = setOf(AppRoutes.PROFILE_CAPTURE, AppRoutes.VOICE_CAPTURE, AppRoutes.REVIEW, AppRoutes.MODULE, AppRoutes.STRICT_LOCAL)
                if (currentRoute !in compactRoutes) {
                    AppBottomNavigation(
                        items = listOf(
                            AppNavItem(AppRoutes.HOME, stringResource(R.string.demo_nav_home), "⌂"),
                            AppNavItem(AppRoutes.CAPTURE, stringResource(R.string.demo_nav_capture), "＋"),
                            AppNavItem(AppRoutes.DASHBOARD, stringResource(R.string.demo_nav_dashboard), "▦"),
                            AppNavItem(AppRoutes.DATASETS, stringResource(R.string.demo_nav_data), "◫"),
                            AppNavItem(AppRoutes.MORE, stringResource(R.string.app_more_title), "⋯"),
                        ),
                        selectedRoute = when {
                            currentRoute == AppRoutes.HOME -> AppRoutes.HOME
                            currentRoute == AppRoutes.CAPTURE -> AppRoutes.CAPTURE
                            currentRoute == AppRoutes.DASHBOARD -> AppRoutes.DASHBOARD
                            currentRoute == AppRoutes.DATASETS -> AppRoutes.DATASETS
                            else -> AppRoutes.MORE
                        },
                        onNavigate = navigateTo,
                    )
                }
            },
        ) { padding ->
            NavHost(
                navController = navController,
                startDestination = AppRoutes.HOME,
                modifier = Modifier.padding(padding),
            ) {
                composable(AppRoutes.HOME) {
                    HomeScreen(
                        onMore = { navigateTo(AppRoutes.MORE) },
                        onCapture = { navController.navigate(AppRoutes.CAPTURE) },
                        onProfileCapture = { navController.navigate(AppRoutes.PROFILE_CAPTURE) },
                        onVoiceCapture = { navController.navigate(AppRoutes.VOICE_CAPTURE) },
                        onDashboard = { navController.navigate(AppRoutes.DASHBOARD) },
                        onBilling = { navController.navigate(AppRoutes.BILLING) },
                        onDatasets = { navController.navigate(AppRoutes.DATASETS) },
                        onAnalysis = { navController.navigate(AppRoutes.ANALYSIS) },
                        onDiagnostics = { navController.navigate(AppRoutes.DIAGNOSTICS) },
                        onOperations = { navController.navigate(AppRoutes.OPERATIONS) },
                        onNotifications = { navController.navigate(AppRoutes.NOTIFICATIONS) },
                        onTasks = { navController.navigate(AppRoutes.TASKS) },
                        onEvidence = { navController.navigate(AppRoutes.EVIDENCE) },
                        onApprovals = { navController.navigate(AppRoutes.APPROVALS) },
                        bootstrap = bootstrap,
                        bootstrapError = bootstrapError,
                        role = role,
                        onSignOut = onSignOut,
                    )
                }
                composable(AppRoutes.MORE) {
                    MoreScreen(
                        role = role,
                        onWorkbench = { navigateTo(AppRoutes.WORKBENCH) },
                        onBilling = { navigateTo(AppRoutes.BILLING) },
                        onDiagnostics = { navigateTo(AppRoutes.DIAGNOSTICS) },
                        onOperations = { navigateTo(AppRoutes.OPERATIONS) },
                        onNotifications = { navigateTo(AppRoutes.NOTIFICATIONS) },
                        onTasks = { navigateTo(AppRoutes.TASKS) },
                        onEvidence = { navigateTo(AppRoutes.EVIDENCE) },
                        onApprovals = { navigateTo(AppRoutes.APPROVALS) },
                        onStrictLocal = { navigateTo(AppRoutes.STRICT_LOCAL) },
                        onSignOut = onSignOut,
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
                    val authenticated = authenticatedApiRuntime
                    if (authenticated == null) {
                        RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    } else if (authenticated.deviceId.isBlank() || authenticated.receiptWorkspaceGrantId.isBlank()) {
                        DeviceEnrollmentRequiredScreen(
                            api = authenticated.api,
                            onEnrolled = { deviceId, grantId ->
                                val saved = onDeviceEnrolled?.invoke(deviceId, grantId) == true
                                if (saved) navController.popBackStack()
                                saved
                            },
                            onBack = { navController.popBackStack() },
                        )
                    } else {
                        val viewModel = remember(runtime, authenticated) {
                            ReceiptCaptureViewModel(
                                scope = authenticated.scope,
                                stagingStore = runtime.receiptStagingStore,
                                uploadScheduler = runtime.receiptUploadScheduler,
                                keyHandle = runtime.receiptKeyHandle,
                                localStore = runtime.localStore,
                                deviceId = authenticated.deviceId,
                            ).also {
                                it.setDestination(
                                    ReceiptDestination.Hybrid(
                                        workspaceGrantId = authenticated.receiptWorkspaceGrantId,
                                    ),
                                )
                                it.setScopeAuthorized(true)
                            }
                        }
                        ReceiptCaptureScreen(
                            viewModel = viewModel,
                            workspaceGrantId = authenticated.receiptWorkspaceGrantId,
                            onBack = { navController.popBackStack() },
                            onOpenReview = { sessionId ->
                                navController.navigate(AppRoutes.review(sessionId))
                            },
                        )
                    }
                }
                composable(AppRoutes.PROFILE_CAPTURE) {
                    if (authenticatedApiRuntime == null) {
                        RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    } else {
                        CaptureScreen(
                            onConfirmed = { _: CaptureProfile -> navController.popBackStack() },
                        )
                    }
                }
                composable(AppRoutes.VOICE_CAPTURE) {
                    VoiceCaptureScreen(
                        runtime = runtime,
                        scope = authenticatedApiRuntime?.scope,
                        onSave = { navController.popBackStack() },
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(AppRoutes.DASHBOARD) {
                    val dashboardClient = runtime.dashboardApiClient
                    if (authenticatedApiRuntime == null || dashboardClient == null) {
                        RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    } else {
                        val dashboardModel = remember { DashboardViewModel() }
                        var snapshotId by remember { mutableStateOf("") }
                        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            AppCard(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(stringResource(R.string.dashboard_snapshot_id), style = MaterialTheme.typography.labelLarge)
                                    OutlinedTextField(
                                        value = snapshotId,
                                        onValueChange = { snapshotId = it },
                                        label = { Text(stringResource(R.string.dashboard_snapshot_id)) },
                                        modifier = Modifier.fillMaxWidth(),
                                        singleLine = true,
                                    )
                                    Button(
                                        onClick = { dashboardModel.loadFromServer(dashboardClient, snapshotId.trim()) },
                                        enabled = snapshotId.isNotBlank(),
                                        modifier = Modifier.fillMaxWidth(),
                                    ) { Text(stringResource(R.string.dashboard_load)) }
                                }
                            }
                            DashboardScreen(viewModel = dashboardModel)
                        }
                    }
                }
                composable(AppRoutes.DATASETS) {
                    val client = runtime.datasetApiClient
                    if (authenticatedApiRuntime == null || client == null) {
                        RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    } else {
                        val model = remember { DatasetPickerViewModel() }
                        var status by remember { mutableStateOf<String?>(null) }
                        LaunchedEffect(client) {
                            when (val result = client.list()) {
                                is DatasetApiResult.Ready -> model.load(result.options)
                                is DatasetApiResult.Rejected -> status = result.code
                                DatasetApiResult.Retryable -> status = "dataset_retryable"
                            }
                        }
                        Column(Modifier.fillMaxSize()) {
                            status?.let { AppStatusBanner(it, error = true, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) }
                            androidx.compose.foundation.layout.Box(Modifier.weight(1f)) {
                                DatasetPickerScreen(
                                    viewModel = model,
                                    onSelected = { id ->
                                        selectedDatasetId = id
                                        selectedDatasetVersionId = model.state.options
                                            .firstOrNull { it.datasetId == id }
                                            ?.versionId.orEmpty()
                                    },
                                )
                            }
                        }
                    }
                }
                composable(AppRoutes.ANALYSIS) {
                    val client = runtime.conversationApiClient
                    if (authenticatedApiRuntime == null || client == null) {
                        RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    } else {
                        LiveAnalysisScreen(
                            client = client,
                            onBack = { navController.popBackStack() },
                            initialDatasetId = selectedDatasetId,
                            initialVersionId = selectedDatasetVersionId,
                        )
                    }
                }
                composable(AppRoutes.BILLING) {
                    val billingClient = runtime.billingApiClient
                    if (authenticatedApiRuntime == null || billingClient == null) {
                        RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    } else {
                        AuthenticatedBillingScreen(
                            client = billingClient,
                            onBack = { navController.popBackStack() },
                            initialOrderCode = paymentOrderCode,
                        )
                    }
                }
                composable(AppRoutes.DIAGNOSTICS) {
                    DiagnosticsScreen(
                        runtime = runtime,
                        authenticated = authenticatedApiRuntime,
                        onSync = {
                            authenticatedApiRuntime?.let { runtime.syncScheduler.enqueue(it.scope) }
                        },
                        onCleanup = onCleanupVerified,
                        onBack = { navController.popBackStack() },
                    )
                }
                composable(AppRoutes.OPERATIONS) {
                    val client = runtime.operationsApiClient
                    if (client == null) RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    else AdminTrackingScreen(client = client, onBack = { navController.popBackStack() })
                }
                composable(AppRoutes.NOTIFICATIONS) {
                    val client = runtime.notificationsApiClient
                    if (client == null) RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    else NotificationsScreen(client = client, onBack = { navController.popBackStack() })
                }
                composable(AppRoutes.TASKS) {
                    val client = runtime.mobileApiClient
                    if (client == null) RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    else MobileTasksScreen(client = client, onBack = { navController.popBackStack() })
                }
                composable(AppRoutes.EVIDENCE) {
                    val client = runtime.artifactApiClient
                    if (client == null) RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    else EvidenceScreen(client = client, onBack = { navController.popBackStack() })
                }
                composable(AppRoutes.APPROVALS) {
                    val client = runtime.approvalApiClient
                    if (client == null) RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    else ApprovalScreen(client = client, actorRole = role, onBack = { navController.popBackStack() })
                }
                composable(AppRoutes.STRICT_LOCAL) {
                    val authenticated = authenticatedApiRuntime
                    if (authenticated == null || runtime.strictLocalPackageExporter == null) {
                        RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    } else {
                        StrictLocalScreen(
                            runtime = runtime,
                            scope = authenticated.scope,
                            onBack = { navController.popBackStack() },
                        )
                    }
                }
                composable(AppRoutes.REVIEW) { entry ->
                    val sessionId = entry.arguments?.getString("sessionId").orEmpty()
                    if (authenticatedApiRuntime == null) {
                        RuntimeConfigurationRequiredScreen(onBack = { navController.popBackStack() })
                    } else {
                        val reviewModel = remember(sessionId, runtime.receiptExtractionApiClient) {
                            ReceiptReviewViewModel(runtime.receiptExtractionApiClient).also {
                                it.loadReceiptFromUpload(
                                    sessionId = sessionId,
                                    references = runtime.receiptArtifactReferenceStore,
                                )
                            }
                        }
                        ReceiptReviewScreen(
                            viewModel = reviewModel,
                            onBack = { navController.popBackStack() },
                            onAccept = { reviewModel.acceptCurrent() },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(
    onMore: () -> Unit,
    onCapture: () -> Unit,
    onProfileCapture: () -> Unit,
    onVoiceCapture: () -> Unit,
    onDashboard: () -> Unit,
    onBilling: () -> Unit,
    onDatasets: () -> Unit,
    onAnalysis: () -> Unit,
    onDiagnostics: () -> Unit,
    onOperations: () -> Unit,
    onNotifications: () -> Unit,
    onTasks: () -> Unit,
    onEvidence: () -> Unit,
    onApprovals: () -> Unit,
    bootstrap: LiveBootstrapSnapshot? = null,
    bootstrapError: String? = null,
    role: String? = null,
    onSignOut: (() -> Unit)? = null,
) {
    val canOperate = role?.allowsOperatorSurface() == true
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("home-screen"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.app_name),
                title = stringResource(R.string.home_title),
                description = stringResource(R.string.home_body),
            )
        }
        item {
            AppCard(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(stringResource(R.string.home_current_space), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    bootstrap?.let {
                        Text(stringResource(R.string.auth_workspace_context, it.organizationName, it.workspaceName), style = MaterialTheme.typography.titleMedium)
                        Text(stringResource(R.string.auth_project_context, it.projectName), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } ?: Text(stringResource(R.string.home_loading_workspace), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    role?.let { Text(stringResource(R.string.auth_role_context, it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
        bootstrapError?.let { error ->
            item { AppStatusBanner(stringResource(R.string.auth_bootstrap_error, error), error = true) }
        }
        item {
            AppActionRow(
                glyph = "＋",
                title = stringResource(R.string.receipt_capture_action),
                description = stringResource(R.string.receipt_capture_body),
                onClick = onCapture,
                enabled = canOperate,
                modifier = Modifier.testTag("capture-button"),
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                AppMetricCard(
                    label = stringResource(R.string.home_access_label),
                    value = role ?: "—",
                    supporting = stringResource(R.string.home_server_authority),
                    modifier = Modifier.weight(1f),
                )
                AppMetricCard(
                    label = stringResource(R.string.home_data_mode_label),
                    value = bootstrap?.workspaceName ?: "—",
                    supporting = stringResource(R.string.home_server_authority),
                    modifier = Modifier.weight(1f),
                    accent = MaterialTheme.colorScheme.tertiary,
                )
            }
        }
        item { Text(stringResource(R.string.home_quick_actions), style = MaterialTheme.typography.titleMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold) }
        item {
            AppActionRow(
                glyph = "▦",
                title = stringResource(R.string.dashboard_action),
                description = stringResource(R.string.home_dashboard_description),
                onClick = onDashboard,
                modifier = Modifier.testTag("dashboard-button"),
            )
        }
        item {
            AppActionRow(
                glyph = "◫",
                title = stringResource(R.string.datasets_action),
                description = stringResource(R.string.home_datasets_description),
                onClick = onDatasets,
                modifier = Modifier.testTag("datasets-button"),
            )
        }
        item {
            AppActionRow(
                glyph = "◒",
                title = stringResource(R.string.analysis_action),
                description = stringResource(R.string.home_analysis_description),
                onClick = onAnalysis,
                modifier = Modifier.testTag("analysis-button"),
            )
        }
        item {
            AppActionRow(
                glyph = "⋯",
                title = stringResource(R.string.app_more_title),
                description = stringResource(R.string.app_more_body),
                onClick = onMore,
                modifier = Modifier.testTag("workbench-button"),
            )
        }
        onSignOut?.let { signOut ->
            item {
                androidx.compose.material3.OutlinedButton(onClick = signOut, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.auth_sign_out))
                }
            }
        }
    }
}

@Composable
private fun MoreScreen(
    role: String?,
    onWorkbench: () -> Unit,
    onBilling: () -> Unit,
    onDiagnostics: () -> Unit,
    onOperations: () -> Unit,
    onNotifications: () -> Unit,
    onTasks: () -> Unit,
    onEvidence: () -> Unit,
    onApprovals: () -> Unit,
    onStrictLocal: () -> Unit,
    onSignOut: (() -> Unit)?,
) {
    val canReview = role?.allowsReviewSurface() == true
    val isAdmin = role.isAdministrative()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.app_more_eyebrow),
                title = stringResource(R.string.app_more_title),
                description = stringResource(R.string.app_more_body),
            )
        }
        if (canReview) {
            item {
                AppMoreListItem(stringResource(R.string.mobile_tasks_action), stringResource(R.string.more_tasks_description), "✓", onTasks, Modifier.testTag("tasks-button"))
            }
            item {
                AppMoreListItem(stringResource(R.string.evidence_action), stringResource(R.string.more_evidence_description), "⌕", onEvidence, Modifier.testTag("evidence-button"))
            }
            item {
                AppMoreListItem(stringResource(R.string.approvals_action), stringResource(R.string.more_approvals_description), "↗", onApprovals, Modifier.testTag("approvals-button"))
            }
        }
        item {
            AppMoreListItem(stringResource(R.string.notifications_action), stringResource(R.string.more_notifications_description), "◌", onNotifications, Modifier.testTag("notifications-button"))
        }
        item {
            AppMoreListItem(stringResource(R.string.diagnostics_action), stringResource(R.string.more_diagnostics_description), "⚙", onDiagnostics, Modifier.testTag("diagnostics-button"))
        }
        item {
            AppMoreListItem(stringResource(R.string.strict_local_title), stringResource(R.string.strict_local_body), "⇩", onStrictLocal, Modifier.testTag("strict-local-button"))
        }
        item {
            AppMoreListItem(stringResource(R.string.workbench_action), stringResource(R.string.more_workbench_description), "▤", onWorkbench, Modifier.testTag("workbench-button"))
        }
        if (isAdmin) {
            item {
                AppMoreListItem(stringResource(R.string.operations_tracking_action), stringResource(R.string.more_operations_description), "◈", onOperations, Modifier.testTag("operations-button"))
            }
            item {
                AppMoreListItem(stringResource(R.string.demo_nav_billing), stringResource(R.string.more_billing_description), "₫", onBilling, Modifier.testTag("billing-button"))
            }
        }
        onSignOut?.let { signOut ->
            item {
                androidx.compose.material3.OutlinedButton(onClick = signOut, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    Text(stringResource(R.string.auth_sign_out))
                }
            }
        }
    }
}

private fun String?.isAdministrative(): Boolean {
    val normalized = this?.uppercase() ?: return false
    return normalized.contains("OWNER") || normalized.contains("ADMIN")
}

private fun String.allowsOperatorSurface(): Boolean {
    val normalized = uppercase()
    return normalized.contains("OWNER") || normalized.contains("ADMIN") ||
        normalized.contains("OPERATOR") || normalized.contains("ANALYST") ||
        normalized.contains("REVIEW") || normalized.contains("APPROV") || normalized.contains("MEMBER")
}

private fun String.allowsReviewSurface(): Boolean {
    val normalized = uppercase()
    return normalized.contains("OWNER") || normalized.contains("ADMIN") ||
        normalized.contains("OPERATOR") || normalized.contains("ANALYST") ||
        normalized.contains("REVIEW") || normalized.contains("APPROV")
}

@Composable
private fun RuntimeConfigurationRequiredScreen(onBack: () -> Unit) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(24.dp)
                .testTag("authenticated-runtime-required"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            stringResource(R.string.authenticated_runtime_required_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            stringResource(R.string.authenticated_runtime_required_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        Button(onClick = onBack) { Text(stringResource(R.string.back_action)) }
    }
}

@Composable
private fun DeviceEnrollmentRequiredScreen(
    api: com.databreeze.android.network.AuthenticatedApiConfig,
    onEnrolled: (String, String?) -> Boolean,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val existingDeviceId = api.deviceId
    val client = remember(api) {
        val installation = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID).orEmpty()
        DeviceEnrollmentApiClient(
            transport = com.databreeze.android.network.HttpUrlConnectionAuthenticatedApiTransport(api.baseUrl, api.tokenProvider),
            signingKeys = AndroidDeviceSigningKeyStore(),
            installationIdHash = MessageDigest.getInstance("SHA-256")
                .digest(installation.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) },
        )
    }
    val grants = remember(api) {
        com.databreeze.android.network.DeviceGrantApiClient(
            transport = com.databreeze.android.network.HttpUrlConnectionAuthenticatedApiTransport(api.baseUrl, api.tokenProvider),
            workspaceId = api.workspaceId,
        )
    }
    fun resolveGrant(deviceId: String, onResult: (String?) -> Unit) {
        scope.launch {
            when (val result = grants.list(deviceId)) {
                is com.databreeze.android.network.DeviceGrantApiClient.Result.Ready -> {
                    val active = result.grants.firstOrNull { it.status == "ACTIVE" }
                    onResult(active?.id)
                }
                is com.databreeze.android.network.DeviceGrantApiClient.Result.Rejected -> {
                    message = result.code
                    onResult(null)
                }
                com.databreeze.android.network.DeviceGrantApiClient.Result.Retryable -> {
                    message = context.getString(R.string.auth_network_error)
                    onResult(null)
                }
            }
        }
    }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp).testTag("device-enrollment-required"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            stringResource(R.string.device_enrollment_required_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            stringResource(R.string.device_enrollment_required_body),
            style = MaterialTheme.typography.bodyLarge,
        )
        message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = {
                busy = true
                message = null
                scope.launch {
                    if (existingDeviceId.isNotBlank()) {
                        resolveGrant(existingDeviceId) { grantId ->
                            if (!onEnrolled(existingDeviceId, grantId)) {
                                message = context.getString(R.string.device_grant_required)
                            }
                            busy = false
                        }
                    } else {
                        when (val result = client.enroll()) {
                            is DeviceEnrollmentApiClient.Result.Enrolled -> {
                                resolveGrant(result.deviceId) { grantId ->
                                    if (!onEnrolled(result.deviceId, grantId)) {
                                        message = context.getString(R.string.device_grant_required)
                                    }
                                    busy = false
                                }
                            }
                            is DeviceEnrollmentApiClient.Result.Rejected -> {
                                message = result.code
                                busy = false
                            }
                            DeviceEnrollmentApiClient.Result.Retryable -> {
                                message = context.getString(R.string.auth_network_error)
                                busy = false
                            }
                        }
                    }
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (busy) stringResource(R.string.device_enrollment_busy) else if (existingDeviceId.isBlank()) stringResource(R.string.device_enrollment_start) else stringResource(R.string.device_grant_refresh)) }
        Button(onClick = onBack) { Text(stringResource(R.string.back_action)) }
    }
}
