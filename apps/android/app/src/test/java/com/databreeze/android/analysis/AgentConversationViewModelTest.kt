package com.databreeze.android.analysis

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** AND-016 / DDA-055: agent conversation uses grants and typed context events. */
class AgentConversationViewModelTest {
    @Test
    fun viewer_grant_denies_mutation_controls_client_side() {
        val viewModel =
            AgentConversationViewModel(
                grant = AgentGrant.VIEWER,
            )
        assertFalse(viewModel.state.canSend)
        assertFalse(viewModel.trySend("hello"))
        assertEquals("agent_viewer_denied", viewModel.state.statusMessageKey)
    }

    @Test
    fun editor_grant_records_context_event_when_dataset_version_changes() {
        val viewModel = AgentConversationViewModel(grant = AgentGrant.EDITOR)
        viewModel.setContext(datasetId = "01DATASET00000000000000001", version = 1)
        assertTrue(viewModel.trySend("Tong chi phi?"))
        viewModel.setContext(datasetId = "01DATASET00000000000000001", version = 2)
        assertTrue(viewModel.state.contextEvents.any { it.kind == "LATEST_VERSION" })
        assertEquals(2, viewModel.state.datasetVersion)
    }
}

class ConversationHistoryViewModelTest {
    @Test
    fun pages_history_with_cursor_and_locale_labels() {
        val viewModel = ConversationHistoryViewModel()
        viewModel.loadPage(
            ConversationHistoryPage(
                items =
                    listOf(
                        ConversationSummary("01CONV00000000000000000001", "Chi phi Q1", 1),
                    ),
                nextCursor = "cursor-2",
            ),
        )
        assertEquals(1, viewModel.state.items.size)
        assertEquals("cursor-2", viewModel.state.nextCursor)
        assertEquals("Lịch sử hội thoại", viewModel.title("vi-VN"))
        assertEquals("Conversation history", viewModel.title("en"))
    }
}
