package com.databreeze.android.analysis

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.R
import com.databreeze.android.network.AuthenticatedConversationApiClient
import com.databreeze.android.network.ConversationApiResult
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner
import kotlinx.coroutines.launch

@Composable
fun LiveAnalysisScreen(
    client: AuthenticatedConversationApiClient,
    onBack: () -> Unit,
    initialDatasetId: String = "",
    initialVersionId: String = "",
) {
    var datasetId by remember(initialDatasetId) { mutableStateOf(initialDatasetId) }
    var versionId by remember(initialVersionId) { mutableStateOf(initialVersionId) }
    var question by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<String?>(null) }
    var conversationId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LazyColumn(
        Modifier.fillMaxSize().testTag("live-analysis-screen"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.analysis_action),
                title = stringResource(R.string.analysis_title),
                description = stringResource(R.string.home_analysis_description),
            )
        }
        item {
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(datasetId, { datasetId = it }, label = { Text(stringResource(R.string.analysis_dataset_id)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(versionId, { versionId = it }, label = { Text(stringResource(R.string.analysis_dataset_version_id)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(question, { question = it }, label = { Text(stringResource(R.string.analysis_question)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                    Button(
                        onClick = {
                            scope.launch {
                                val id = conversationId ?: when (val created = client.create("Android analysis", datasetId.trim(), versionId.trim())) {
                                    is ConversationApiResult.Created -> created.conversationId.also { conversationId = it }
                                    is ConversationApiResult.Rejected -> { result = created.code; return@launch }
                                    ConversationApiResult.Retryable -> { result = "analysis_retryable"; return@launch }
                                    is ConversationApiResult.Answer -> created.conversationId
                                }
                                when (val answer = client.turn(id, question.trim())) {
                                    is ConversationApiResult.Answer -> result = answer.narrative
                                    is ConversationApiResult.Rejected -> result = answer.code
                                    ConversationApiResult.Retryable -> result = "analysis_retryable"
                                    is ConversationApiResult.Created -> result = "conversation_created"
                                }
                            }
                        },
                        enabled = datasetId.isNotBlank() && versionId.isNotBlank() && question.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.analysis_send)) }
                }
            }
        }
        result?.let { answer ->
            item {
                AppStatusBanner(answer, modifier = Modifier.testTag("analysis-result"))
            }
        }
    }
}
