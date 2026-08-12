package com.databreeze.android.analysis

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun AgentConversationScreen(
    localeTag: String = "vi-VN",
    viewModel: AgentConversationViewModel,
) {
    var state by remember { mutableStateOf(viewModel.state) }
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(16.dp)
                .testTag("agent-conversation"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(if (localeTag.startsWith("vi")) "Tác nhân không gian làm việc" else "Workspace agent")
        state.messages.forEach { message -> Text(message) }
        state.contextEvents.forEach { event ->
            Text("${event.kind} v${event.version}", modifier = Modifier.testTag("agent-context-${event.kind}"))
        }
        Button(
            enabled = state.canSend,
            onClick = {
                viewModel.trySend("ping")
                state = viewModel.state
            },
            modifier = Modifier.testTag("agent-send"),
        ) {
            Text(if (localeTag.startsWith("vi")) "Gửi" else "Send")
        }
    }
}

@Composable
fun ConversationHistoryScreen(
    localeTag: String = "vi-VN",
    viewModel: ConversationHistoryViewModel,
) {
    val state = viewModel.state
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(16.dp)
                .testTag("conversation-history"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(viewModel.title(localeTag))
        state.items.forEach { item ->
            Text("${item.title} (v${item.version})", modifier = Modifier.testTag("conversation-${item.conversationId}"))
        }
    }
}
