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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import com.databreeze.android.network.DeviceEnrollmentApiClient
import com.databreeze.android.security.AndroidDeviceSigningKeyStore
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
                                onDeviceEnrolled = { application.persistDeviceEnrollment(it) },
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
    onDeviceEnrolled: ((String) -> Boolean)? = null,
) {
    val navController = rememberNavController()
    var selectedDatasetId by remember { mutableStateOf("") }
    var selectedDatasetVersionId by remember { mutableStateOf("") }
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
                        session = session,
                        iamApiClient = iamApiClient,
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
                    } else if (authenticated.receiptWorkspaceGrantId.isBlank()) {
                        DeviceEnrollmentRequiredScreen(
                            api = authenticated.api,
                            onEnrolled = { deviceId ->
                                val saved = onDeviceEnrolled?.invoke(deviceId) == true
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
                        Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = snapshotId,
                                onValueChange = { snapshotId = it },
                                label = { Text(stringResource(R.string.dashboard_snapshot_id)) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Button(
                                onClick = { dashboardModel.loadFromServer(dashboardClient, snapshotId.trim()) },
                                enabled = snapshotId.isNotBlank(),
                            ) { Text(stringResource(R.string.dashboard_load)) }
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
                            status?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp)) }
                            DatasetPickerScreen(
                                viewModel = model,
                                onSelected = { id ->
                                    selectedDatasetId = id
                                    selectedDatasetVersionId = model.state.options
                                        .firstOrNull { it.datasetId == id }
                                        ?.versionId.orEmpty()
                                },
                            )
                            Button(onClick = { navController.popBackStack() }, modifier = Modifier.padding(16.dp)) { Text(stringResource(R.string.back_action)) }
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
                        onCleanup = { authenticatedApiRuntime?.let { runtime.receiptStagingStore.clearScope(it.scope) } },
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
                    else ApprovalScreen(client = client, onBack = { navController.popBackStack() })
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
    onWorkbench: () -> Unit,
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
    session: ProtectedAuthenticatedApiSession? = null,
    iamApiClient: AuthenticatedIamApiClient? = null,
    onSignOut: (() -> Unit)? = null,
) {
    var bootstrap by remember(session?.sessionId) { mutableStateOf<LiveBootstrapSnapshot?>(null) }
    var bootstrapError by remember(session?.sessionId) { mutableStateOf<String?>(null) }
    var role by remember(session?.sessionId) { mutableStateOf<String?>(null) }
    LaunchedEffect(iamApiClient, session?.sessionId) {
        if (iamApiClient != null && session != null) {
            when (val result = iamApiClient.bootstrap(session)) {
                is IamApiResult.Success -> bootstrap = result.value
                is IamApiResult.Rejected -> bootstrapError = result.code
                IamApiResult.Retryable -> bootstrapError = "network_unavailable"
            }
            when (val result = iamApiClient.currentRole(session)) {
                is IamApiResult.Success -> role = result.value
                is IamApiResult.Rejected -> if (role == null) role = "unknown"
                IamApiResult.Retryable -> if (role == null) role = "pending"
            }
        }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("home-screen"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.home_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.home_body), style = MaterialTheme.typography.bodyLarge)
        bootstrap?.let {
            Text(
                stringResource(R.string.auth_workspace_context, it.organizationName, it.workspaceName),
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                stringResource(R.string.auth_project_context, it.projectName),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        bootstrapError?.let {
            Text(
                stringResource(R.string.auth_bootstrap_error, it),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        role?.let { Text(stringResource(R.string.auth_role_context, it), style = MaterialTheme.typography.bodyMedium) }
        Button(onClick = onWorkbench, modifier = Modifier.testTag("workbench-button")) {
            Text(stringResource(R.string.workbench_action))
        }
        // Navigation hints are role-aware, while every server request remains authoritative and
        // tenant-scoped. A missing role never grants an administrative surface.
        if (role == null || role?.allowsOperatorSurface() == true) {
            Button(onClick = onCapture, modifier = Modifier.testTag("capture-button")) {
                Text(stringResource(R.string.receipt_capture_action))
            }
            Button(onClick = onProfileCapture, modifier = Modifier.testTag("profile-capture-button")) {
                Text(stringResource(R.string.profile_capture_action))
            }
            Button(onClick = onVoiceCapture, modifier = Modifier.testTag("voice-capture-button")) {
                Text(stringResource(R.string.voice_capture_action))
            }
        }
        Button(onClick = onDashboard, modifier = Modifier.testTag("dashboard-button")) {
            Text(stringResource(R.string.dashboard_action))
        }
        Button(onClick = onBilling, modifier = Modifier.testTag("billing-button")) {
            Text(stringResource(R.string.demo_nav_billing))
        }
        Button(onClick = onDatasets, modifier = Modifier.testTag("datasets-button")) {
            Text(stringResource(R.string.datasets_action))
        }
        Button(onClick = onAnalysis, modifier = Modifier.testTag("analysis-button")) {
            Text(stringResource(R.string.analysis_action))
        }
        Button(onClick = onEvidence, modifier = Modifier.testTag("evidence-button")) {
            Text(stringResource(R.string.evidence_action))
        }
        Button(onClick = onDiagnostics, modifier = Modifier.testTag("diagnostics-button")) {
            Text(stringResource(R.string.diagnostics_action))
        }
        if (role.isAdministrative()) {
            Button(onClick = onOperations, modifier = Modifier.testTag("operations-button")) {
                Text(stringResource(R.string.operations_tracking_action))
            }
        }
        Button(onClick = onNotifications, modifier = Modifier.testTag("notifications-button")) {
            Text(stringResource(R.string.notifications_action))
        }
        if (role == null || role?.allowsReviewSurface() == true) {
            Button(onClick = onTasks, modifier = Modifier.testTag("tasks-button")) {
                Text(stringResource(R.string.mobile_tasks_action))
            }
        }
        if (role == null || role?.contains("APPROV") == true || role.isAdministrative()) {
            Button(onClick = onApprovals, modifier = Modifier.testTag("approvals-button")) {
                Text("Approvals")
            }
        }
        onSignOut?.let { signOut ->
            Button(onClick = signOut, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.auth_sign_out))
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
    onEnrolled: (String) -> Boolean,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
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
                    when (val result = client.enroll()) {
                        is DeviceEnrollmentApiClient.Result.Enrolled -> {
                            if (!onEnrolled(result.deviceId)) message = context.getString(R.string.device_session_persist_failed)
                        }
                        is DeviceEnrollmentApiClient.Result.Rejected -> message = result.code
                        DeviceEnrollmentApiClient.Result.Retryable -> message = context.getString(R.string.auth_network_error)
                    }
                    busy = false
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (busy) stringResource(R.string.device_enrollment_busy) else stringResource(R.string.device_enrollment_start)) }
        Button(onClick = onBack) { Text(stringResource(R.string.back_action)) }
    }
}
