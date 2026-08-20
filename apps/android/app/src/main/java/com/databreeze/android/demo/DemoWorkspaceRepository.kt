package com.databreeze.android.demo

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Deterministic local implementation of the bounded Android product workflow.
 *
 * It is intentionally a repository, not screen data: Compose renders the state it exposes and
 * a future authenticated adapter can implement the same operations without changing navigation.
 * The demo has no network credentials, tenant secrets, provider keys, or production authority.
 */
class DemoWorkspaceRepository(
    private val now: () -> String = { "2026-08-14T10:00:00Z" },
) : MockDataBreezeApi {
    private var nextId = 3
    private val mutableState = MutableStateFlow(DemoWorkspaceState.seeded(now()))
    override val state: StateFlow<DemoWorkspaceState> = mutableState.asStateFlow()

    override fun selectDataset(datasetId: String): Boolean {
        if (mutableState.value.datasets.none { it.id == datasetId }) return false
        mutate { it.copy(selectedDatasetId = datasetId) }
        return true
    }

    override fun switchRole(role: DemoRole): Boolean {
        mutate { it.copy(session = it.session.copy(role = role)) }
        return true
    }

    override fun hasPermission(permission: DemoPermission): Boolean =
        mutableState.value.session.role.permissions.contains(permission)

    override fun createCheckout(planId: String): DemoCheckout? {
        if (!hasPermission(DemoPermission.BILLING_ACCOUNT_MANAGE)) return null
        val plan = mutableState.value.plans.firstOrNull { it.id == planId } ?: return null
        val checkout = DemoCheckout(
            id = "checkout-${nextId++}",
            planId = plan.id,
            amountVnd = plan.amountVnd,
            status = DemoCheckoutStatus.SUCCESS,
            createdAt = now(),
        )
        mutate { state ->
            state.copy(
                checkout = checkout,
                subscription = state.subscription.copy(
                    planId = plan.id,
                    planName = plan.name,
                    amountVnd = plan.amountVnd,
                    status = DemoSubscriptionStatus.ACTIVE,
                ),
                auditEvents = listOf(
                    DemoAuditEvent(
                        id = "audit-${nextId++}",
                        action = "billing.checkout.completed",
                        actor = state.session.memberName,
                        createdAt = now(),
                        detail = "PayOS demo · ${plan.name}",
                    ),
                ) + state.auditEvents,
            )
        }
        return checkout
    }

    override fun failCheckout(planId: String): DemoCheckout? {
        if (!hasPermission(DemoPermission.BILLING_ACCOUNT_MANAGE)) return null
        val plan = mutableState.value.plans.firstOrNull { it.id == planId } ?: return null
        val checkout = DemoCheckout(
            id = "checkout-${nextId++}",
            planId = plan.id,
            amountVnd = plan.amountVnd,
            status = DemoCheckoutStatus.FAILED,
            createdAt = now(),
        )
        mutate { state ->
            state.copy(
                checkout = checkout,
                auditEvents = listOf(
                    DemoAuditEvent(
                        id = "audit-${nextId++}",
                        action = "billing.checkout.failed",
                        actor = state.session.memberName,
                        createdAt = now(),
                        detail = "PayOS demo · ${plan.name}",
                    ),
                ) + state.auditEvents,
            )
        }
        return checkout
    }

    override fun inviteMember(email: String, role: DemoRole): Boolean {
        if (!hasPermission(DemoPermission.WORKSPACE_SETTINGS_MANAGE)) return false
        if (role == DemoRole.OWNER) return false
        val normalized = email.trim().lowercase()
        if (!normalized.contains("@") || mutableState.value.members.any { it.email == normalized }) return false
        mutate { state ->
            state.copy(
                members = state.members + DemoMember(
                    id = "member-${nextId++}",
                    name = normalized.substringBefore('@'),
                    email = normalized,
                    role = role,
                    status = DemoMemberStatus.INVITED,
                ),
                auditEvents = listOf(
                    DemoAuditEvent(
                        id = "audit-${nextId++}",
                        action = "workspace.member.invited",
                        actor = state.session.memberName,
                        createdAt = now(),
                        detail = "$normalized · ${role.label}",
                    ),
                ) + state.auditEvents,
            )
        }
        return true
    }

    override fun createCapture(profile: DemoCaptureProfile): DemoCapture {
        check(hasPermission(DemoPermission.ARTIFACT_DERIVED_CREATE)) { "permission denied: artifact.derived.create" }
        val id = "capture-${nextId++}"
        val capture = DemoCapture(
            id = id,
            profile = profile,
            createdAt = now(),
            status = DemoCaptureStatus.NEEDS_REVIEW,
            version = 1,
            fields = profile.initialFields(),
            lowConfidenceFields = profile.initialLowConfidenceFields(),
        )
        mutate { state ->
            state.copy(
                captures = listOf(capture) + state.captures,
                selectedCaptureId = capture.id,
                dashboard = state.dashboard.copy(pendingReview = state.dashboard.pendingReview + 1),
                notifications = listOf(
                    DemoNotification(
                        id = "notification-${nextId++}",
                        kind = DemoNotificationKind.REVIEW_REQUIRED,
                        captureId = capture.id,
                        createdAt = now(),
                        read = false,
                    ),
                ) + state.notifications,
                auditEvents = listOf(
                    DemoAuditEvent(
                        id = "audit-${nextId++}",
                        action = "capture.created",
                        actor = state.session.memberName,
                        createdAt = now(),
                        detail = profile.name,
                    ),
                ) + state.auditEvents,
            )
        }
        return capture
    }

    override fun selectCapture(captureId: String): Boolean {
        if (mutableState.value.capture(captureId) == null) return false
        mutate { it.copy(selectedCaptureId = captureId) }
        return true
    }

    override fun correctCapture(captureId: String, field: String, value: String): Boolean {
        if (!hasPermission(DemoPermission.ARTIFACT_DERIVED_CREATE)) return false
        if (value.isBlank() || value.length > 200) return false
        val current = mutableState.value.capture(captureId) ?: return false
        if (current.status == DemoCaptureStatus.ACCEPTED) return false
        if (current.fields.none { it.key == field }) return false
        val updated = current.copy(
            version = current.version + 1,
            fields = current.fields.map { candidate ->
                if (candidate.key == field) candidate.copy(value = value.trim(), confidence = 100) else candidate
            },
            lowConfidenceFields = current.lowConfidenceFields - field,
        )
        mutate { state ->
            state.copy(
                captures = state.captures.map { if (it.id == updated.id) updated else it },
                auditEvents = listOf(
                    DemoAuditEvent(
                        id = "audit-${nextId++}",
                        action = "capture.corrected",
                        actor = state.session.memberName,
                        createdAt = now(),
                        detail = "$captureId.$field",
                    ),
                ) + state.auditEvents,
            )
        }
        return true
    }

    override fun acceptCapture(captureId: String): Boolean {
        if (!hasPermission(DemoPermission.PROJECT_RECORD_MANAGE) &&
            !hasPermission(DemoPermission.APPROVAL_DECISION_CREATE)
        ) return false
        val datasetId = mutableState.value.selectedDatasetId ?: return false
        val current = mutableState.value.capture(captureId) ?: return false
        if (current.status == DemoCaptureStatus.ACCEPTED) return true
        if (current.lowConfidenceFields.isNotEmpty()) return false
        val accepted = current.copy(status = DemoCaptureStatus.ACCEPTED, datasetId = datasetId)
        mutate { state ->
            state.copy(
                captures = state.captures.map { if (it.id == accepted.id) accepted else it },
                dashboard = state.dashboard.copy(
                    acceptedThisWeek = state.dashboard.acceptedThisWeek + 1,
                    pendingReview = (state.dashboard.pendingReview - 1).coerceAtLeast(0),
                ),
                notifications = listOf(
                    DemoNotification(
                        id = "notification-${nextId++}",
                        kind = DemoNotificationKind.CAPTURE_ACCEPTED,
                        captureId = captureId,
                        createdAt = now(),
                        read = false,
                    ),
                ) + state.notifications,
                conversation = state.conversation.withContext(datasetId),
                auditEvents = listOf(
                    DemoAuditEvent(
                        id = "audit-${nextId++}",
                        action = "capture.accepted",
                        actor = state.session.memberName,
                        createdAt = now(),
                        detail = "$captureId@$datasetId",
                    ),
                ) + state.auditEvents,
            )
        }
        return true
    }

    override fun markNotificationRead(notificationId: String): Boolean {
        val notification = mutableState.value.notifications.firstOrNull { it.id == notificationId } ?: return false
        if (!notification.read) {
            mutate { state ->
                state.copy(notifications = state.notifications.map {
                    if (it.id == notificationId) it.copy(read = true) else it
                })
            }
        }
        return true
    }

    override fun askAgent(question: String): DemoMessage {
        check(hasPermission(DemoPermission.JOB_EXECUTION_READ)) { "permission denied: job.execution.read" }
        check(
            mutableState.value.session.role == DemoRole.OWNER ||
                hasPermission(DemoPermission.JOB_EXECUTION_CREATE),
        ) { "permission denied: job.execution.create" }
        val trimmed = question.trim().take(500)
        require(trimmed.isNotBlank()) { "question required" }
        val current = mutableState.value
        check(current.selectedDatasetId != null) { "dataset required" }
        val userMessage = DemoMessage("message-${nextId++}", DemoMessageRole.USER, trimmed, now())
        val answer = DemoMessage(
            id = "message-${nextId++}",
            role = DemoMessageRole.ASSISTANT,
            text = agentReply(current),
            createdAt = now(),
        )
        mutate { state ->
            state.copy(
                conversation = state.conversation.copy(messages = state.conversation.messages + userMessage + answer),
                auditEvents = listOf(
                    DemoAuditEvent(
                        id = "audit-${nextId++}",
                        action = "analysis.question.asked",
                        actor = state.session.memberName,
                        createdAt = now(),
                        detail = state.conversation.contextDatasetId ?: "workspace",
                    ),
                ) + state.auditEvents,
            )
        }
        return answer
    }

    private fun agentReply(state: DemoWorkspaceState): String {
        val selectedName = state.datasets.firstOrNull { it.id == state.selectedDatasetId }?.name
            ?: "dữ liệu hiện tại"
        return "$selectedName có ${state.dashboard.acceptedThisWeek} mục đã duyệt trong tuần. " +
            "Hãy kiểm tra các trường được đánh dấu trước khi xác nhận."
    }

    private fun mutate(transform: (DemoWorkspaceState) -> DemoWorkspaceState) {
        mutableState.value = transform(mutableState.value)
    }
}

interface WorkspaceRepository {
    val state: StateFlow<DemoWorkspaceState>
    fun selectDataset(datasetId: String): Boolean
    fun createCapture(profile: DemoCaptureProfile): DemoCapture
    fun selectCapture(captureId: String): Boolean
    fun correctCapture(captureId: String, field: String, value: String): Boolean
    fun acceptCapture(captureId: String): Boolean
    fun markNotificationRead(notificationId: String): Boolean
    fun askAgent(question: String): DemoMessage
}

/**
 * Android's replaceable API boundary. The demo implementation below is deterministic and
 * network-free, but the method names mirror the authenticated API slices consumed by the app.
 * No screen owns fixture data or provider credentials.
 */
interface MockDataBreezeApi : WorkspaceRepository {
    /** Read operations mirror the authenticated API query slices used by the Web client. */
    fun getSession(): DemoSession = state.value.session
    fun getWorkspaceName(): String = state.value.workspaceName
    fun getDashboard(): DemoDashboard = state.value.dashboard
    fun listDatasets(): List<DemoDataset> = state.value.datasets
    fun listNotifications(): List<DemoNotification> = state.value.notifications
    fun listPlans(): List<DemoPlan> = state.value.plans
    fun getSubscription(): DemoSubscription = state.value.subscription
    fun listMembers(): List<DemoMember> = state.value.members
    fun listAuditEvents(): List<DemoAuditEvent> = state.value.auditEvents

    fun switchRole(role: DemoRole): Boolean
    fun hasPermission(permission: DemoPermission): Boolean
    fun createCheckout(planId: String): DemoCheckout?
    fun failCheckout(planId: String): DemoCheckout?
    fun inviteMember(email: String, role: DemoRole): Boolean
}

enum class DemoRole(val label: String, val accessPreset: String, val permissions: Set<DemoPermission>) {
    OWNER(
        "Owner",
        "OWNER",
        setOf(
            DemoPermission.ORGANIZATION_PROFILE_READ,
            DemoPermission.ORGANIZATION_SETTINGS_MANAGE,
            DemoPermission.ORGANIZATION_OWNERSHIP_TRANSFER,
            DemoPermission.WORKSPACE_SETTINGS_READ,
            DemoPermission.WORKSPACE_SETTINGS_MANAGE,
            DemoPermission.PROJECT_RECORD_READ,
            DemoPermission.PROJECT_RECORD_MANAGE,
            DemoPermission.ARTIFACT_DERIVED_CREATE,
            DemoPermission.JOB_EXECUTION_READ,
            DemoPermission.BILLING_ACCOUNT_READ,
            DemoPermission.BILLING_ACCOUNT_MANAGE,
            DemoPermission.DEVICE_IDENTITY_READ,
            DemoPermission.DEVICE_IDENTITY_REVOKE,
            DemoPermission.SERVICE_ACCOUNT_READ,
            DemoPermission.SERVICE_ACCOUNT_MANAGE,
            DemoPermission.SERVICE_ACCOUNT_REVOKE,
        ),
    ),
    ADMIN(
        "Admin",
        "CANONICAL",
        setOf(
            DemoPermission.ORGANIZATION_PROFILE_READ,
            DemoPermission.WORKSPACE_SETTINGS_READ,
            DemoPermission.WORKSPACE_SETTINGS_MANAGE,
            DemoPermission.PROJECT_RECORD_READ,
            DemoPermission.PROJECT_RECORD_MANAGE,
            DemoPermission.JOB_EXECUTION_READ,
            DemoPermission.DEVICE_IDENTITY_READ,
            DemoPermission.DEVICE_IDENTITY_REVOKE,
            DemoPermission.SERVICE_ACCOUNT_READ,
            DemoPermission.SERVICE_ACCOUNT_MANAGE,
            DemoPermission.SERVICE_ACCOUNT_REVOKE,
        ),
    ),
    ANALYST(
        "Analyst",
        "EDITOR",
        setOf(
            DemoPermission.ORGANIZATION_PROFILE_READ,
            DemoPermission.WORKSPACE_SETTINGS_READ,
            DemoPermission.PROJECT_RECORD_READ,
            DemoPermission.ARTIFACT_RECORD_READ,
            DemoPermission.ARTIFACT_ORIGINAL_DOWNLOAD,
            DemoPermission.ARTIFACT_DERIVED_CREATE,
            DemoPermission.JOB_EXECUTION_READ,
            DemoPermission.JOB_EXECUTION_CREATE,
            DemoPermission.JOB_EXECUTION_RUN,
            DemoPermission.JOB_EXECUTION_CANCEL,
        ),
    ),
    OPERATOR(
        "Operator",
        "CANONICAL",
        setOf(
            DemoPermission.ORGANIZATION_PROFILE_READ,
            DemoPermission.WORKSPACE_SETTINGS_READ,
            DemoPermission.PROJECT_RECORD_READ,
            DemoPermission.ARTIFACT_RECORD_READ,
            DemoPermission.ARTIFACT_DERIVED_CREATE,
            DemoPermission.JOB_EXECUTION_READ,
            DemoPermission.JOB_EXECUTION_RUN,
        ),
    ),
    APPROVER(
        "Approver",
        "CANONICAL",
        setOf(
            DemoPermission.ORGANIZATION_PROFILE_READ,
            DemoPermission.WORKSPACE_SETTINGS_READ,
            DemoPermission.PROJECT_RECORD_READ,
            DemoPermission.ARTIFACT_RECORD_READ,
            DemoPermission.JOB_EXECUTION_READ,
            DemoPermission.APPROVAL_REQUEST_READ,
            DemoPermission.APPROVAL_DECISION_CREATE,
        ),
    ),
    VIEWER(
        "Viewer",
        "VIEWER",
        setOf(
            DemoPermission.ORGANIZATION_PROFILE_READ,
            DemoPermission.WORKSPACE_SETTINGS_READ,
            DemoPermission.PROJECT_RECORD_READ,
            DemoPermission.ARTIFACT_RECORD_READ,
            DemoPermission.JOB_EXECUTION_READ,
        ),
    ),
}

enum class DemoPermission {
    ORGANIZATION_PROFILE_READ,
    ORGANIZATION_SETTINGS_MANAGE,
    ORGANIZATION_OWNERSHIP_TRANSFER,
    WORKSPACE_SETTINGS_READ,
    WORKSPACE_SETTINGS_MANAGE,
    PROJECT_RECORD_READ,
    PROJECT_RECORD_MANAGE,
    ARTIFACT_RECORD_READ,
    ARTIFACT_ORIGINAL_DOWNLOAD,
    ARTIFACT_DERIVED_CREATE,
    JOB_EXECUTION_READ,
    JOB_EXECUTION_CREATE,
    JOB_EXECUTION_RUN,
    JOB_EXECUTION_CANCEL,
    APPROVAL_REQUEST_READ,
    APPROVAL_DECISION_CREATE,
    BILLING_ACCOUNT_READ,
    BILLING_ACCOUNT_MANAGE,
    DEVICE_IDENTITY_READ,
    DEVICE_IDENTITY_REVOKE,
    SERVICE_ACCOUNT_READ,
    SERVICE_ACCOUNT_MANAGE,
    SERVICE_ACCOUNT_REVOKE,
}

enum class DemoCaptureProfile { RECEIPT, INVOICE, TABLE }

enum class DemoCaptureStatus { NEEDS_REVIEW, ACCEPTED }

enum class DemoNotificationKind { REVIEW_REQUIRED, CAPTURE_ACCEPTED }

enum class DemoMessageRole { USER, ASSISTANT }

data class DemoField(val key: String, val value: String, val confidence: Int)

data class DemoCapture(
    val id: String,
    val profile: DemoCaptureProfile,
    val createdAt: String,
    val status: DemoCaptureStatus,
    val version: Int,
    val fields: List<DemoField>,
    val lowConfidenceFields: Set<String>,
    val datasetId: String? = null,
)

data class DemoDataset(val id: String, val name: String, val health: DemoHealth)

enum class DemoHealth { READY, ATTENTION }

data class DemoDashboard(val totalExpenses: Long, val acceptedThisWeek: Int, val pendingReview: Int)

data class DemoNotification(
    val id: String,
    val kind: DemoNotificationKind,
    val captureId: String,
    val createdAt: String,
    val read: Boolean,
)

data class DemoMessage(val id: String, val role: DemoMessageRole, val text: String, val createdAt: String)

data class DemoConversation(val contextDatasetId: String?, val messages: List<DemoMessage>) {
    fun withContext(datasetId: String) = copy(contextDatasetId = datasetId)
}

data class DemoWorkspaceState(
    val workspaceName: String,
    val memberName: String,
    val datasets: List<DemoDataset>,
    val selectedDatasetId: String?,
    val captures: List<DemoCapture>,
    val selectedCaptureId: String?,
    val dashboard: DemoDashboard,
    val notifications: List<DemoNotification>,
    val conversation: DemoConversation,
    val session: DemoSession = DemoSession("demo-user", "Sinh viên", "student@databreeze.local", "workspace-demo", DemoRole.OWNER),
    val plans: List<DemoPlan> = DemoPlan.catalog,
    val subscription: DemoSubscription = DemoSubscription.free(),
    val members: List<DemoMember> = emptyList(),
    val auditEvents: List<DemoAuditEvent> = emptyList(),
    val checkout: DemoCheckout? = null,
) {
    fun capture(id: String): DemoCapture? = captures.firstOrNull { it.id == id }

    companion object {
        fun seeded(timestamp: String) = DemoWorkspaceState(
            workspaceName = "Không gian minh họa",
            memberName = "Sinh viên",
            datasets = listOf(
                DemoDataset("expenses", "Chi phí vận hành", DemoHealth.READY),
                DemoDataset("sales", "Doanh thu bán hàng", DemoHealth.ATTENTION),
            ),
            selectedDatasetId = null,
            captures = emptyList(),
            selectedCaptureId = null,
            dashboard = DemoDashboard(totalExpenses = 12_450_000, acceptedThisWeek = 0, pendingReview = 0),
            notifications = emptyList(),
            session = DemoSession("demo-user", "Sinh viên", "student@databreeze.local", "workspace-demo", DemoRole.OWNER),
            members = listOf(
                DemoMember("member-owner", "Sinh viên", "student@databreeze.local", DemoRole.OWNER, DemoMemberStatus.ACTIVE),
                DemoMember("member-analyst", "Nguyễn An", "an@databreeze.local", DemoRole.ANALYST, DemoMemberStatus.ACTIVE),
                DemoMember("member-viewer", "Trần Bình", "binh@databreeze.local", DemoRole.VIEWER, DemoMemberStatus.ACTIVE),
            ),
            auditEvents = listOf(DemoAuditEvent("audit-seed", "workspace.opened", "Sinh viên", timestamp, "Demo workspace")),
            conversation = DemoConversation(
                contextDatasetId = null,
                messages = listOf(DemoMessage("message-1", DemoMessageRole.ASSISTANT, "Tôi sẵn sàng hỗ trợ xem dữ liệu.", timestamp)),
            ),
        )
    }
}

data class DemoSession(
    val userId: String,
    val memberName: String,
    val email: String,
    val workspaceId: String,
    val role: DemoRole,
)

data class DemoPlan(
    val id: String,
    val name: String,
    val cadence: String,
    val amountVnd: Long,
    val highlights: List<String>,
) {
    companion object {
        val catalog = listOf(
            DemoPlan("personal-monthly", "Cá nhân", "Hàng tháng", 149_000, listOf("1 workspace", "5.000 bản ghi/tháng")),
            DemoPlan("personal-annual", "Cá nhân", "Hàng năm", 1_490_000, listOf("1 workspace", "5.000 bản ghi/tháng")),
            DemoPlan("professional-monthly", "Chuyên nghiệp", "Hàng tháng", 399_000, listOf("5 thành viên", "50.000 bản ghi/tháng")),
            DemoPlan("professional-annual", "Chuyên nghiệp", "Hàng năm", 3_990_000, listOf("5 thành viên", "50.000 bản ghi/tháng")),
            DemoPlan("team-monthly", "Nhóm", "Hàng tháng", 999_000, listOf("Không giới hạn thành viên", "200.000 bản ghi/tháng")),
            DemoPlan("team-annual", "Nhóm", "Hàng năm", 9_990_000, listOf("Không giới hạn thành viên", "200.000 bản ghi/tháng")),
        )
    }
}

enum class DemoSubscriptionStatus { FREE, ACTIVE, PAST_DUE }

data class DemoSubscription(
    val planId: String,
    val planName: String,
    val amountVnd: Long,
    val status: DemoSubscriptionStatus,
    val usedUnits: Int,
    val limitUnits: Int,
) {
    companion object {
        fun free() = DemoSubscription("free", "Miễn phí", 0, DemoSubscriptionStatus.FREE, 1240, 5000)
    }
}

enum class DemoCheckoutStatus { SUCCESS, FAILED }

data class DemoCheckout(
    val id: String,
    val planId: String,
    val amountVnd: Long,
    val status: DemoCheckoutStatus,
    val createdAt: String,
)

enum class DemoMemberStatus { ACTIVE, INVITED, SUSPENDED }

data class DemoMember(
    val id: String,
    val name: String,
    val email: String,
    val role: DemoRole,
    val status: DemoMemberStatus,
)

data class DemoAuditEvent(
    val id: String,
    val action: String,
    val actor: String,
    val createdAt: String,
    val detail: String,
)

private fun DemoCaptureProfile.initialFields(): List<DemoField> = when (this) {
    DemoCaptureProfile.RECEIPT -> listOf(
        DemoField("merchant", "Cửa hàng mẫu", 72),
        DemoField("date", "14/08/2026", 98),
        DemoField("total", "125.000 ₫", 96),
    )
    DemoCaptureProfile.INVOICE -> listOf(
        DemoField("supplier", "Nhà cung cấp mẫu", 90),
        DemoField("invoiceNumber", "INV-2026-014", 94),
        DemoField("total", "2.450.000 ₫", 98),
    )
    DemoCaptureProfile.TABLE -> listOf(
        DemoField("rows", "48", 98),
        DemoField("columns", "6", 97),
        DemoField("period", "Tháng 08/2026", 84),
    )
}

private fun DemoCaptureProfile.initialLowConfidenceFields(): Set<String> = when (this) {
    DemoCaptureProfile.RECEIPT -> setOf("merchant")
    DemoCaptureProfile.INVOICE -> emptySet()
    DemoCaptureProfile.TABLE -> setOf("period")
}
