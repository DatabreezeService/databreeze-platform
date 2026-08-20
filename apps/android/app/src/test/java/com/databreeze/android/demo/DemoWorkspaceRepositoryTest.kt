package com.databreeze.android.demo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

/** AND-024: the submission APK can demonstrate the bounded mobile workflow without a server. */
class DemoWorkspaceRepositoryTest {
    @Test
    fun capture_review_dataset_acceptance_updates_dashboard_and_notification() {
        val repository = DemoWorkspaceRepository(now = { "2026-08-14T10:00:00Z" })

        val capture = repository.createCapture(DemoCaptureProfile.RECEIPT)
        assertEquals(DemoCaptureStatus.NEEDS_REVIEW, capture.status)
        assertTrue(capture.lowConfidenceFields.contains("merchant"))
        assertEquals(1, repository.state.value.dashboard.pendingReview)

        repository.correctCapture(capture.id, "merchant", "C\u1eeda h\u00e0ng Minh An")
        repository.selectDataset("expenses")
        assertTrue(repository.acceptCapture(capture.id))

        val state = repository.state.value
        assertEquals(DemoCaptureStatus.ACCEPTED, state.capture(capture.id)?.status)
        assertEquals(1, state.dashboard.acceptedThisWeek)
        assertEquals(0, state.dashboard.pendingReview)
        assertTrue(state.notifications.any { it.kind == DemoNotificationKind.CAPTURE_ACCEPTED })
    }

    @Test
    fun acceptance_is_blocked_until_a_logical_dataset_is_selected() {
        val repository = DemoWorkspaceRepository(now = { "2026-08-14T10:00:00Z" })
        val capture = repository.createCapture(DemoCaptureProfile.INVOICE)

        assertFalse(repository.acceptCapture(capture.id))
        assertEquals(DemoCaptureStatus.NEEDS_REVIEW, repository.state.value.capture(capture.id)?.status)
    }

    @Test
    fun acceptance_requires_low_confidence_corrections_and_persists_dataset_scope() {
        val repository = DemoWorkspaceRepository(now = { "2026-08-14T10:00:00Z" })
        val capture = repository.createCapture(DemoCaptureProfile.RECEIPT)

        repository.selectDataset("expenses")
        assertFalse(repository.acceptCapture(capture.id))
        assertFalse(repository.correctCapture(capture.id, "unknown", "value"))
        assertTrue(repository.correctCapture(capture.id, "merchant", "Cửa hàng Minh An"))
        assertTrue(repository.acceptCapture(capture.id))
        assertEquals("expenses", repository.state.value.capture(capture.id)?.datasetId)
        assertTrue(repository.state.value.auditEvents.any { it.action == "capture.accepted" })
    }

    @Test
    fun agent_reply_uses_current_workspace_state_and_keeps_conversation_history() {
        val repository = DemoWorkspaceRepository(now = { "2026-08-14T10:00:00Z" })
        repository.selectDataset("expenses")

        val reply = repository.askAgent("T\u00f3m t\u1eaft chi ph\u00ed")

        assertNotNull(reply)
        assertEquals(3, repository.state.value.conversation.messages.size)
        assertTrue(reply.text.isNotBlank())
    }

    @Test
    fun role_switch_enforces_billing_and_capture_permissions() {
        val repository = DemoWorkspaceRepository(now = { "2026-08-14T10:00:00Z" })

        repository.switchRole(DemoRole.VIEWER)
        assertFalse(repository.hasPermission(DemoPermission.BILLING_ACCOUNT_READ))
        assertFalse(repository.hasPermission(DemoPermission.ARTIFACT_DERIVED_CREATE))
        assertTrue(repository.createCheckout("professional-monthly") == null)

        repository.switchRole(DemoRole.OWNER)
        assertTrue(repository.hasPermission(DemoPermission.BILLING_ACCOUNT_MANAGE))
        assertEquals(399_000L, repository.createCheckout("professional-monthly")?.amountVnd)
        assertEquals(DemoCheckoutStatus.FAILED, repository.failCheckout("team-monthly")?.status)
        assertEquals("professional-monthly", repository.state.value.subscription.planId)
    }

    @Test
    fun owner_can_invite_member_and_audit_event_is_appended() {
        val repository = DemoWorkspaceRepository(now = { "2026-08-14T10:00:00Z" })

        assertTrue(repository.inviteMember("new@databreeze.local", DemoRole.OPERATOR))
        assertTrue(repository.state.value.members.any { it.email == "new@databreeze.local" })
        assertTrue(repository.state.value.auditEvents.any { it.action == "workspace.member.invited" })
    }

    @Test
    fun role_matrix_matches_server_permissions_for_mobile_actions() {
        val repository = DemoWorkspaceRepository()

        repository.switchRole(DemoRole.ADMIN)
        assertFalse(repository.hasPermission(DemoPermission.ARTIFACT_DERIVED_CREATE))
        assertFalse(repository.hasPermission(DemoPermission.BILLING_ACCOUNT_MANAGE))
        assertTrue(repository.hasPermission(DemoPermission.WORKSPACE_SETTINGS_MANAGE))

        repository.switchRole(DemoRole.ANALYST)
        assertTrue(repository.hasPermission(DemoPermission.ARTIFACT_DERIVED_CREATE))
        assertTrue(repository.hasPermission(DemoPermission.JOB_EXECUTION_RUN))
        assertFalse(repository.hasPermission(DemoPermission.PROJECT_RECORD_MANAGE))

        repository.switchRole(DemoRole.APPROVER)
        assertTrue(repository.hasPermission(DemoPermission.APPROVAL_DECISION_CREATE))
        assertFalse(repository.hasPermission(DemoPermission.ARTIFACT_DERIVED_CREATE))

        repository.switchRole(DemoRole.VIEWER)
        assertTrue(repository.hasPermission(DemoPermission.ARTIFACT_RECORD_READ))
        assertFalse(repository.hasPermission(DemoPermission.BILLING_ACCOUNT_READ))
        repository.selectDataset("expenses")
        assertThrows(IllegalStateException::class.java) { repository.askAgent("not allowed") }

        repository.switchRole(DemoRole.ADMIN)
        assertTrue(repository.hasPermission(DemoPermission.JOB_EXECUTION_READ))
        assertTrue(repository.inviteMember("approver@databreeze.local", DemoRole.APPROVER))
        assertFalse(repository.inviteMember("owner@databreeze.local", DemoRole.OWNER))
    }

    @Test
    fun demo_catalog_matches_server_owned_marketing_prices() {
        val prices = DemoWorkspaceRepository().state.value.plans.associate { it.id to it.amountVnd }

        assertEquals(
            mapOf(
                "personal-monthly" to 149_000L,
                "personal-annual" to 1_490_000L,
                "professional-monthly" to 399_000L,
                "professional-annual" to 3_990_000L,
                "team-monthly" to 999_000L,
                "team-annual" to 9_990_000L,
            ),
            prices,
        )
    }
}
