package com.databreeze.android.demo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
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
    fun agent_reply_uses_current_workspace_state_and_keeps_conversation_history() {
        val repository = DemoWorkspaceRepository(now = { "2026-08-14T10:00:00Z" })

        val reply = repository.askAgent("T\u00f3m t\u1eaft chi ph\u00ed")

        assertNotNull(reply)
        assertEquals(3, repository.state.value.conversation.messages.size)
        assertTrue(reply.text.isNotBlank())
    }
}
