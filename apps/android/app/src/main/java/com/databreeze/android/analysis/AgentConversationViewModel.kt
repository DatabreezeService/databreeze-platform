package com.databreeze.android.analysis

enum class AgentGrant {
    VIEWER,
    EDITOR,
    OWNER,
}

data class AgentContextEvent(
    val kind: String,
    val datasetId: String,
    val version: Int,
)

data class AgentConversationUiState(
    val canSend: Boolean,
    val messages: List<String> = emptyList(),
    val contextEvents: List<AgentContextEvent> = emptyList(),
    val datasetId: String? = null,
    val datasetVersion: Int? = null,
    val statusMessageKey: String = "agent_idle",
)

class AgentConversationViewModel(
    grant: AgentGrant,
) {
    var state: AgentConversationUiState =
        AgentConversationUiState(
            canSend = grant != AgentGrant.VIEWER,
            statusMessageKey = if (grant == AgentGrant.VIEWER) "agent_viewer_denied" else "agent_idle",
        )
        private set

    fun setContext(
        datasetId: String,
        version: Int,
    ) {
        val events = state.contextEvents.toMutableList()
        if (state.datasetId == datasetId && state.datasetVersion != null && state.datasetVersion != version) {
            events += AgentContextEvent(kind = "LATEST_VERSION", datasetId = datasetId, version = version)
        }
        state =
            state.copy(
                datasetId = datasetId,
                datasetVersion = version,
                contextEvents = events,
            )
    }

    fun trySend(message: String): Boolean {
        if (!state.canSend) {
            state = state.copy(statusMessageKey = "agent_viewer_denied")
            return false
        }
        state =
            state.copy(
                messages = state.messages + message,
                statusMessageKey = "agent_sent",
            )
        return true
    }
}

data class ConversationSummary(
    val conversationId: String,
    val title: String,
    val version: Int,
)

data class ConversationHistoryPage(
    val items: List<ConversationSummary>,
    val nextCursor: String?,
)

data class ConversationHistoryUiState(
    val items: List<ConversationSummary> = emptyList(),
    val nextCursor: String? = null,
)

class ConversationHistoryViewModel {
    var state: ConversationHistoryUiState = ConversationHistoryUiState()
        private set

    fun loadPage(page: ConversationHistoryPage) {
        state = ConversationHistoryUiState(items = page.items, nextCursor = page.nextCursor)
    }

    fun title(localeTag: String): String =
        if (localeTag.startsWith("vi")) "Lịch sử hội thoại" else "Conversation history"
}
