package com.databreeze.android.demo

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.databreeze.android.DataBreezeTheme
import com.databreeze.android.R
import java.util.Locale

private object DemoRoutes {
    const val HOME = "home"
    const val CAPTURE = "capture"
    const val DATASETS = "datasets"
    const val DASHBOARD = "dashboard"
    const val TRACKING = "tracking"
    const val ANALYSIS = "analysis"
    const val NOTIFICATIONS = "notifications"
    const val BILLING = "billing"
    const val MEMBERS = "members"
    const val AUDIT = "audit"
    const val REVIEW = "review/{captureId}"
    fun review(captureId: String) = "review/$captureId"
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun DemoWorkspaceApp(repository: MockDataBreezeApi) {
    val state by repository.state.collectAsState()
    val navigation = rememberNavController()
    val unreadNotifications = state.notifications.count { !it.read }
    val notificationsDescription = stringResource(
        R.string.demo_notifications_content_description,
        unreadNotifications,
    )
    var rolePickerOpen by remember { mutableStateOf(false) }
    DataBreezeTheme {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                        Text(stringResource(R.string.demo_workspace_title), style = MaterialTheme.typography.titleLarge)
                            Text(
                                stringResource(R.string.demo_role_workspace, state.session.role.label, state.workspaceName),
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    },
                    actions = {
                        OutlinedButton(
                            onClick = { rolePickerOpen = true },
                            modifier = Modifier.padding(end = 4.dp),
                        ) {
                            Text(state.session.role.label, style = MaterialTheme.typography.labelSmall)
                        }
                        OutlinedButton(
                            onClick = { navigation.navigate(DemoRoutes.NOTIFICATIONS) },
                            modifier = Modifier
                                .padding(end = 8.dp)
                                .semantics { contentDescription = notificationsDescription },
                        ) {
                            Text(stringResource(R.string.demo_notifications_short, unreadNotifications))
                        }
                    },
                )
            },
            bottomBar = {
                DemoBottomNavigation(
                    onHome = { navigation.navigate(DemoRoutes.HOME) },
                    onCapture = { navigation.navigate(DemoRoutes.CAPTURE) },
                    onData = { navigation.navigate(DemoRoutes.DATASETS) },
                    onDashboard = { navigation.navigate(DemoRoutes.DASHBOARD) },
                    onTracking = { navigation.navigate(DemoRoutes.TRACKING) },
                    onAnalysis = { navigation.navigate(DemoRoutes.ANALYSIS) },
                    onBilling = { navigation.navigate(DemoRoutes.BILLING) },
                )
            },
        ) { padding ->
            NavHost(
                navController = navigation,
                startDestination = DemoRoutes.HOME,
                modifier = Modifier.padding(padding),
            ) {
                composable(DemoRoutes.HOME) {
                    DemoHomeScreen(
                        state = state,
                        onCapture = { navigation.navigate(DemoRoutes.CAPTURE) },
                        onDashboard = { navigation.navigate(DemoRoutes.DASHBOARD) },
                        onTracking = { navigation.navigate(DemoRoutes.TRACKING) },
                        onReview = { navigation.navigate(DemoRoutes.review(it)) },
                        onBilling = { navigation.navigate(DemoRoutes.BILLING) },
                        onMembers = { navigation.navigate(DemoRoutes.MEMBERS) },
                        onAudit = { navigation.navigate(DemoRoutes.AUDIT) },
                    )
                }
                composable(DemoRoutes.CAPTURE) {
                    DemoCaptureScreen(
                        canCapture = repository.hasPermission(DemoPermission.ARTIFACT_DERIVED_CREATE),
                        onCapture = { profile ->
                            val capture = repository.createCapture(profile)
                            navigation.navigate(DemoRoutes.review(capture.id))
                        },
                    )
                }
                composable(DemoRoutes.DATASETS) {
                    DemoDatasetScreen(state = state, onSelect = repository::selectDataset)
                }
                composable(DemoRoutes.DASHBOARD) {
                    DemoDashboardScreen(state = state, onReview = { navigation.navigate(DemoRoutes.review(it)) })
                }
                composable(DemoRoutes.TRACKING) {
                    DemoTrackingScreen(
                        state = state,
                        canRead = repository.hasPermission(DemoPermission.JOB_EXECUTION_READ),
                    )
                }
                composable(DemoRoutes.ANALYSIS) {
                    DemoAnalysisScreen(
                        state = state,
                        canRead = repository.hasPermission(DemoPermission.JOB_EXECUTION_READ),
                        canAsk = (
                            state.session.role == DemoRole.OWNER ||
                                repository.hasPermission(DemoPermission.JOB_EXECUTION_CREATE)
                            ) && state.selectedDatasetId != null,
                        onAsk = repository::askAgent,
                    )
                }
                composable(DemoRoutes.BILLING) {
                    DemoBillingScreen(
                        state = state,
                        canRead = repository.hasPermission(DemoPermission.BILLING_ACCOUNT_READ),
                        canManage = repository.hasPermission(DemoPermission.BILLING_ACCOUNT_MANAGE),
                        onCheckout = { planId ->
                            val checkout = repository.createCheckout(planId)
                            if (checkout != null) navigation.navigate(DemoRoutes.DASHBOARD)
                            checkout
                        },
                        onCheckoutFailed = repository::failCheckout,
                    )
                }
                composable(DemoRoutes.MEMBERS) {
                    DemoMembersScreen(
                        state = state,
                        actorRole = state.session.role,
                        canRead = repository.hasPermission(DemoPermission.WORKSPACE_SETTINGS_READ),
                        canManage = repository.hasPermission(DemoPermission.WORKSPACE_SETTINGS_MANAGE),
                        onInvite = { email, role -> repository.inviteMember(email, role) },
                    )
                }
                composable(DemoRoutes.AUDIT) {
                    DemoAuditScreen(
                        state = state,
                        canRead = state.session.role == DemoRole.OWNER || state.session.role == DemoRole.ADMIN,
                    )
                }
                composable(DemoRoutes.NOTIFICATIONS) {
                    DemoNotificationsScreen(state = state, onRead = repository::markNotificationRead)
                }
                composable(DemoRoutes.REVIEW) { entry ->
                    val captureId = entry.arguments?.getString("captureId")
                    val capture = captureId?.let(state::capture)
                    if (capture == null) {
                        DemoEmptyScreen(message = stringResource(R.string.demo_capture_not_found))
                    } else {
                        DemoReviewScreen(
                            state = state,
                            capture = capture,
                            canEdit = repository.hasPermission(DemoPermission.ARTIFACT_DERIVED_CREATE),
                            canAccept = repository.hasPermission(DemoPermission.PROJECT_RECORD_MANAGE) ||
                                repository.hasPermission(DemoPermission.APPROVAL_DECISION_CREATE),
                            onDataset = repository::selectDataset,
                            onCorrect = repository::correctCapture,
                            onAccept = { id ->
                                if (repository.acceptCapture(id)) navigation.navigate(DemoRoutes.DASHBOARD)
                            },
                        )
                    }
                }
            }
        }
        if (rolePickerOpen) {
            DemoRolePicker(
                role = state.session.role,
                onDismiss = { rolePickerOpen = false },
                onSelect = { role ->
                    repository.switchRole(role)
                    rolePickerOpen = false
                },
            )
        }
    }
}

@Composable
private fun DemoBottomNavigation(
    onHome: () -> Unit,
    onCapture: () -> Unit,
    onData: () -> Unit,
    onDashboard: () -> Unit,
    onTracking: () -> Unit,
    onAnalysis: () -> Unit,
    onBilling: () -> Unit,
) {
    Surface(shadowElevation = 3.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 4.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            DemoNavButton(R.string.demo_nav_home, onHome)
            DemoNavButton(R.string.demo_nav_capture, onCapture)
            DemoNavButton(R.string.demo_nav_data, onData)
            DemoNavButton(R.string.demo_nav_dashboard, onDashboard)
            DemoNavButton(R.string.demo_nav_tracking, onTracking)
            DemoNavButton(R.string.demo_nav_analysis, onAnalysis)
            DemoNavButton(R.string.demo_nav_billing, onBilling)
        }
    }
}

@Composable
private fun DemoNavButton(label: Int, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.height(44.dp)) {
        Text(stringResource(label), style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun DemoHomeScreen(
    state: DemoWorkspaceState,
    onCapture: () -> Unit,
    onDashboard: () -> Unit,
    onTracking: () -> Unit,
    onReview: (String) -> Unit,
    onBilling: () -> Unit,
    onMembers: () -> Unit,
    onAudit: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_home_greeting, state.session.memberName), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_home_body), style = MaterialTheme.typography.bodyMedium)
            Text(
                stringResource(R.string.demo_role_access, state.session.role.label, state.session.role.accessPreset),
                style = MaterialTheme.typography.labelMedium,
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                DemoMetricCard(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.demo_metric_review),
                    value = state.captures.count { it.status == DemoCaptureStatus.NEEDS_REVIEW }.toString(),
                )
                DemoMetricCard(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.demo_metric_accepted),
                    value = state.dashboard.acceptedThisWeek.toString(),
                )
            }
        }
        item {
            Button(onClick = onCapture, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(stringResource(R.string.demo_capture_start))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onBilling, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.demo_nav_billing))
                }
                OutlinedButton(onClick = onTracking, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.demo_nav_tracking))
                }
                OutlinedButton(onClick = onMembers, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.demo_nav_members))
                }
            }
        }
        item {
            OutlinedButton(onClick = onAudit, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.demo_nav_audit))
            }
        }
        item {
            Text(stringResource(R.string.demo_recent_captures), style = MaterialTheme.typography.titleMedium)
        }
        items(state.captures, key = { it.id }) { capture ->
            CaptureCard(capture = capture, onOpen = { onReview(capture.id) })
        }
        if (state.captures.isEmpty()) {
            item { DemoEmptyScreen(stringResource(R.string.demo_no_captures)) }
        }
        item {
            OutlinedButton(onClick = onDashboard, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.demo_open_dashboard))
            }
        }
    }
}

@Composable
private fun DemoMetricCard(modifier: Modifier, label: String, value: String) {
    Card(modifier = modifier) {
        Column(Modifier.padding(16.dp)) {
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun DemoCaptureScreen(
    canCapture: Boolean,
    onCapture: (DemoCaptureProfile) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_capture_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_capture_body), style = MaterialTheme.typography.bodyMedium)
            if (!canCapture) {
                Text(
                    stringResource(R.string.demo_permission_capture_denied),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        items(DemoCaptureProfile.entries.toList()) { profile ->
            Card(onClick = { if (canCapture) onCapture(profile) }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(profile.title(), style = MaterialTheme.typography.titleMedium)
                    Text(profile.description(), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun DemoDatasetScreen(state: DemoWorkspaceState, onSelect: (String) -> Boolean) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_dataset_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_dataset_body), style = MaterialTheme.typography.bodyMedium)
        }
        items(state.datasets, key = { it.id }) { dataset ->
            Card(
                onClick = { onSelect(dataset.id) },
                colors = CardDefaults.cardColors(
                    containerColor = if (dataset.id == state.selectedDatasetId) {
                        colorResource(R.color.db_color_status_info_surface)
                    } else MaterialTheme.colorScheme.surface,
                ),
            ) {
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(dataset.name, style = MaterialTheme.typography.titleMedium)
                        Text(dataset.health.label(), style = MaterialTheme.typography.bodySmall)
                    }
                    if (dataset.id == state.selectedDatasetId) {
                        AssistChip(onClick = { onSelect(dataset.id) }, label = { Text(stringResource(R.string.demo_selected)) })
                    }
                }
            }
        }
    }
}

@Composable
private fun DemoReviewScreen(
    state: DemoWorkspaceState,
    capture: DemoCapture,
    canEdit: Boolean,
    canAccept: Boolean,
    onDataset: (String) -> Boolean,
    onCorrect: (String, String, String) -> Boolean,
    onAccept: (String) -> Unit,
) {
    val drafts = remember(capture.id, capture.version) {
        mutableStateMapOf<String, String>().apply { capture.fields.forEach { put(it.key, it.value) } }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_review_title, capture.profile.title()), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_review_version, capture.version), style = MaterialTheme.typography.bodySmall)
            if (capture.lowConfidenceFields.isNotEmpty()) {
                Text(
                    stringResource(R.string.demo_review_low_confidence_blocked),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        items(capture.fields, key = { it.key }) { field ->
            val low = field.key in capture.lowConfidenceFields
            OutlinedTextField(
                value = drafts[field.key].orEmpty(),
                onValueChange = { drafts[field.key] = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(if (low) stringResource(R.string.demo_review_low_confidence, field.key) else field.key) },
                supportingText = { Text(stringResource(R.string.demo_review_confidence, field.confidence)) },
                enabled = canEdit && capture.status != DemoCaptureStatus.ACCEPTED,
            )
        }
        item {
            Button(
                onClick = {
                    drafts.forEach { (field, value) ->
                        if (capture.fields.firstOrNull { it.key == field }?.value != value) onCorrect(capture.id, field, value)
                    }
                },
                enabled = canEdit && capture.status != DemoCaptureStatus.ACCEPTED,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.demo_review_save)) }
        }
        item { Text(stringResource(R.string.demo_review_dataset), style = MaterialTheme.typography.titleMedium) }
        items(state.datasets, key = { it.id }) { dataset ->
            AssistChip(
                onClick = { onDataset(dataset.id) },
                label = { Text(dataset.name) },
                modifier = Modifier.padding(end = 8.dp),
            )
        }
        item {
            val accepted = capture.status == DemoCaptureStatus.ACCEPTED
            Button(
                onClick = { onAccept(capture.id) },
                enabled = canAccept && !accepted && state.selectedDatasetId != null && capture.lowConfidenceFields.isEmpty(),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Text(if (accepted) stringResource(R.string.demo_review_accepted) else stringResource(R.string.demo_review_accept))
            }
        }
    }
}

@Composable
private fun DemoDashboardScreen(state: DemoWorkspaceState, onReview: (String) -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_dashboard_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_dashboard_body), style = MaterialTheme.typography.bodyMedium)
        }
        item {
            DemoMetricCard(
                modifier = Modifier.fillMaxWidth(),
                label = stringResource(R.string.demo_dashboard_expenses),
                value = stringResource(R.string.demo_currency_vnd, state.dashboard.totalExpenses),
            )
        }
        item {
            DemoMetricCard(
                modifier = Modifier.fillMaxWidth(),
                label = stringResource(R.string.demo_metric_accepted),
                value = state.dashboard.acceptedThisWeek.toString(),
            )
        }
        item { Text(stringResource(R.string.demo_dashboard_evidence), style = MaterialTheme.typography.titleMedium) }
        items(state.captures.filter { it.status == DemoCaptureStatus.ACCEPTED }, key = { it.id }) { capture ->
            CaptureCard(capture = capture, onOpen = { onReview(capture.id) })
        }
        if (state.captures.none { it.status == DemoCaptureStatus.ACCEPTED }) {
            item { DemoEmptyScreen(stringResource(R.string.demo_dashboard_empty)) }
        }
    }
}

@Composable
private fun DemoTrackingScreen(state: DemoWorkspaceState, canRead: Boolean) {
    if (!canRead) {
        DemoPermissionDeniedScreen(R.string.demo_permission_tracking_denied)
        return
    }
    val noDataset = stringResource(R.string.demo_tracking_no_dataset)
    val datasetName: (String?) -> String = { id ->
        id?.let { selected -> state.datasets.firstOrNull { it.id == selected }?.name }
            ?: noDataset
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_tracking_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_tracking_body), style = MaterialTheme.typography.bodyMedium)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DemoMetricCard(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.demo_tracking_pending),
                    value = state.dashboard.pendingReview.toString(),
                )
                DemoMetricCard(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.demo_tracking_accepted),
                    value = state.dashboard.acceptedThisWeek.toString(),
                )
                DemoMetricCard(
                    modifier = Modifier.weight(1f),
                    label = stringResource(R.string.demo_tracking_unread),
                    value = state.notifications.count { !it.read }.toString(),
                )
            }
        }
        item { Text(stringResource(R.string.demo_tracking_pipeline), style = MaterialTheme.typography.titleMedium) }
        items(state.captures, key = { it.id }) { capture ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(capture.profile.title(), style = MaterialTheme.typography.titleMedium)
                    Text(capture.status.label(), style = MaterialTheme.typography.bodyMedium)
                    Text(stringResource(R.string.demo_tracking_dataset, datasetName(capture.datasetId)), style = MaterialTheme.typography.bodySmall)
                    Text(capture.createdAt, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item { Text(stringResource(R.string.demo_tracking_latest_audit), style = MaterialTheme.typography.titleMedium) }
        items(state.auditEvents.take(10), key = { it.id }) { event ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(event.action, style = MaterialTheme.typography.labelLarge)
                    Text(event.detail, style = MaterialTheme.typography.bodySmall)
                    Text("${event.actor} · ${event.createdAt}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (state.auditEvents.isEmpty()) item { Text(stringResource(R.string.demo_tracking_no_events)) }
    }
}

@Composable
private fun DemoAnalysisScreen(
    state: DemoWorkspaceState,
    canRead: Boolean,
    canAsk: Boolean,
    onAsk: (String) -> DemoMessage,
) {
    var question by remember { mutableStateOf("") }
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.demo_analysis_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.demo_analysis_context, state.datasets.firstOrNull { it.id == state.selectedDatasetId }?.name ?: stringResource(R.string.demo_dataset_none)), style = MaterialTheme.typography.bodyMedium)
        if (!canRead || (!canAsk && state.selectedDatasetId != null)) {
            Text(stringResource(R.string.demo_permission_analysis_denied), color = MaterialTheme.colorScheme.error)
        } else if (state.selectedDatasetId == null) {
            Text(stringResource(R.string.demo_analysis_dataset_required), color = MaterialTheme.colorScheme.error)
        }
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.conversation.messages, key = { it.id }) { message ->
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (message.role == DemoMessageRole.USER) colorResource(R.color.db_color_status_info_surface) else MaterialTheme.colorScheme.surface,
                    ),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(message.role.label(), style = MaterialTheme.typography.labelMedium)
                        Text(message.text, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
        OutlinedTextField(
            value = question,
            onValueChange = { question = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.demo_analysis_placeholder)) },
            enabled = canAsk,
        )
        Button(
            onClick = { onAsk(question); question = "" },
            enabled = canAsk && question.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.demo_analysis_send)) }
    }
}

@Composable
private fun DemoNotificationsScreen(state: DemoWorkspaceState, onRead: (String) -> Boolean) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Text(stringResource(R.string.demo_notifications_title), style = MaterialTheme.typography.headlineSmall) }
        items(state.notifications, key = { it.id }) { notification ->
            Card(onClick = { onRead(notification.id) }) {
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(notification.kind.label(), style = MaterialTheme.typography.titleSmall)
                        Text(notification.createdAt, style = MaterialTheme.typography.bodySmall)
                    }
                    Text(if (notification.read) stringResource(R.string.demo_read) else stringResource(R.string.demo_unread))
                }
            }
        }
        if (state.notifications.isEmpty()) item { DemoEmptyScreen(stringResource(R.string.demo_notifications_empty)) }
    }
}

@Composable
private fun DemoBillingScreen(
    state: DemoWorkspaceState,
    canRead: Boolean,
    canManage: Boolean,
    onCheckout: (String) -> DemoCheckout?,
    onCheckoutFailed: (String) -> DemoCheckout?,
) {
    if (!canRead) {
        DemoPermissionDeniedScreen(R.string.demo_permission_billing_denied)
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_billing_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_billing_body), style = MaterialTheme.typography.bodyMedium)
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = colorResource(R.color.db_color_status_info_surface))) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(stringResource(R.string.demo_billing_current), style = MaterialTheme.typography.labelMedium)
                    Text(state.subscription.planName, style = MaterialTheme.typography.titleLarge)
                    Text(
                        stringResource(
                            R.string.demo_billing_usage,
                            state.subscription.usedUnits,
                            state.subscription.limitUnits,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (state.checkout != null && state.checkout.status == DemoCheckoutStatus.SUCCESS) {
                        Text(
                            stringResource(
                                R.string.demo_billing_checkout_success,
                                formatVnd(state.checkout.amountVnd),
                            ),
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    if (state.checkout != null && state.checkout.status == DemoCheckoutStatus.FAILED) {
                        Text(
                            stringResource(R.string.demo_billing_checkout_failed),
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
        item { Text(stringResource(R.string.demo_billing_plans), style = MaterialTheme.typography.titleMedium) }
        items(state.plans, key = { it.id }) { plan ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text(plan.name, style = MaterialTheme.typography.titleMedium)
                            Text(plan.cadence, style = MaterialTheme.typography.bodySmall)
                        }
                        Text(formatVnd(plan.amountVnd), style = MaterialTheme.typography.titleMedium)
                    }
                    plan.highlights.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    Button(
                        onClick = { onCheckout(plan.id) },
                        enabled = canManage,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (canManage) stringResource(R.string.demo_billing_checkout)
                            else stringResource(R.string.demo_billing_owner_only),
                        )
                    }
                    if (canManage) {
                        OutlinedButton(
                            onClick = { onCheckoutFailed(plan.id) },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(stringResource(R.string.demo_billing_simulate_failure)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun DemoMembersScreen(
    state: DemoWorkspaceState,
    actorRole: DemoRole,
    canRead: Boolean,
    canManage: Boolean,
    onInvite: (String, DemoRole) -> Boolean,
) {
    if (!canRead) {
        DemoPermissionDeniedScreen(R.string.demo_permission_members_denied)
        return
    }
    var email by remember { mutableStateOf("") }
    val inviteRoles = actorRole.invitableRoles()
    var inviteRole by remember(actorRole) { mutableStateOf(inviteRoles.firstOrNull() ?: DemoRole.ANALYST) }
    var inviteResult by remember { mutableStateOf<Boolean?>(null) }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_members_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_members_body), style = MaterialTheme.typography.bodyMedium)
        }
        if (canManage) {
            item {
                Card {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.demo_members_invite), style = MaterialTheme.typography.titleMedium)
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.demo_members_email)) },
                            singleLine = true,
                        )
                        Text(stringResource(R.string.demo_members_role), style = MaterialTheme.typography.labelMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            inviteRoles.forEach { role ->
                                AssistChip(
                                    onClick = { inviteRole = role },
                                    label = { Text(role.label) },
                                    leadingIcon = if (role == inviteRole) ({ Text("✓") }) else null,
                                )
                            }
                        }
                        Button(
                            onClick = {
                                inviteResult = onInvite(email, inviteRole)
                                if (inviteResult == true) email = ""
                            },
                            enabled = email.contains("@"),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(stringResource(R.string.demo_members_send_invite)) }
                        inviteResult?.let { success ->
                            Text(
                                stringResource(if (success) R.string.demo_members_invite_success else R.string.demo_members_invite_failed),
                                color = if (success) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }
        }
        item { Text(stringResource(R.string.demo_members_list), style = MaterialTheme.typography.titleMedium) }
        items(state.members, key = { it.id }) { member ->
            Card {
                Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(member.name, style = MaterialTheme.typography.titleMedium)
                        Text(member.email, style = MaterialTheme.typography.bodySmall)
                    }
                    Column(horizontalAlignment = androidx.compose.ui.Alignment.End) {
                        Text(member.role.label, style = MaterialTheme.typography.labelLarge)
                        Text(member.status.label(), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun DemoAuditScreen(state: DemoWorkspaceState, canRead: Boolean) {
    if (!canRead) {
        DemoPermissionDeniedScreen(R.string.demo_permission_audit_denied)
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(stringResource(R.string.demo_audit_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.demo_audit_body), style = MaterialTheme.typography.bodyMedium)
        }
        items(state.auditEvents, key = { it.id }) { event ->
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(event.action, style = MaterialTheme.typography.titleSmall)
                    Text(event.detail, style = MaterialTheme.typography.bodyMedium)
                    Text("${event.actor} · ${event.createdAt}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun DemoRolePicker(
    role: DemoRole,
    onDismiss: () -> Unit,
    onSelect: (DemoRole) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.demo_role_picker_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(stringResource(R.string.demo_role_picker_body))
                DemoRole.entries.forEach { candidate ->
                    OutlinedButton(
                        onClick = { onSelect(candidate) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (candidate == role) "✓ ${candidate.label}" else candidate.label)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.back_action)) } },
    )
}

@Composable
private fun DemoPermissionDeniedScreen(message: Int) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.demo_permission_denied_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(message), color = MaterialTheme.colorScheme.error)
        Text(stringResource(R.string.demo_permission_denied_body), style = MaterialTheme.typography.bodyMedium)
    }
}

private fun DemoRole.invitableRoles(): List<DemoRole> = when (this) {
    DemoRole.OWNER -> listOf(DemoRole.ADMIN, DemoRole.ANALYST, DemoRole.OPERATOR, DemoRole.APPROVER, DemoRole.VIEWER)
    DemoRole.ADMIN -> listOf(DemoRole.ADMIN, DemoRole.ANALYST, DemoRole.OPERATOR, DemoRole.APPROVER, DemoRole.VIEWER)
    else -> emptyList()
}

private fun formatVnd(value: Long): String = String.format(Locale.US, "%,d đ", value)

@Composable
private fun CaptureCard(capture: DemoCapture, onOpen: () -> Unit) {
    Card(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text(capture.profile.title(), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.demo_review_version, capture.version), style = MaterialTheme.typography.bodySmall)
            }
            Text(capture.status.label(), style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun DemoEmptyScreen(message: String) {
    Text(message, modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp), style = MaterialTheme.typography.bodyMedium)
}

@Composable
private fun DemoCaptureProfile.title(): String = stringResource(when (this) {
    DemoCaptureProfile.RECEIPT -> R.string.demo_profile_receipt_title
    DemoCaptureProfile.INVOICE -> R.string.demo_profile_invoice_title
    DemoCaptureProfile.TABLE -> R.string.demo_profile_table_title
})

@Composable
private fun DemoCaptureProfile.description(): String = stringResource(when (this) {
    DemoCaptureProfile.RECEIPT -> R.string.demo_profile_receipt_body
    DemoCaptureProfile.INVOICE -> R.string.demo_profile_invoice_body
    DemoCaptureProfile.TABLE -> R.string.demo_profile_table_body
})

@Composable
private fun DemoCaptureStatus.label(): String = stringResource(when (this) {
    DemoCaptureStatus.NEEDS_REVIEW -> R.string.demo_status_review
    DemoCaptureStatus.ACCEPTED -> R.string.demo_status_accepted
})

@Composable
private fun DemoHealth.label(): String = stringResource(when (this) {
    DemoHealth.READY -> R.string.demo_health_ready
    DemoHealth.ATTENTION -> R.string.demo_health_attention
})

@Composable
private fun DemoMessageRole.label(): String = stringResource(when (this) {
    DemoMessageRole.USER -> R.string.demo_message_you
    DemoMessageRole.ASSISTANT -> R.string.demo_message_assistant
})

@Composable
private fun DemoNotificationKind.label(): String = stringResource(when (this) {
    DemoNotificationKind.REVIEW_REQUIRED -> R.string.demo_notification_review
    DemoNotificationKind.CAPTURE_ACCEPTED -> R.string.demo_notification_accepted
})

@Composable
private fun DemoMemberStatus.label(): String = stringResource(when (this) {
    DemoMemberStatus.ACTIVE -> R.string.demo_member_active
    DemoMemberStatus.INVITED -> R.string.demo_member_invited
    DemoMemberStatus.SUSPENDED -> R.string.demo_member_suspended
})
