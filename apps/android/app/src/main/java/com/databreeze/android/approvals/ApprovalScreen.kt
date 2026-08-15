package com.databreeze.android.approvals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.databreeze.android.network.ApprovalApiResult
import com.databreeze.android.network.ApprovalCard
import com.databreeze.android.network.AuthenticatedApprovalApiClient

@Composable
fun ApprovalScreen(client: AuthenticatedApprovalApiClient, onBack: () -> Unit) {
    var cards by remember { mutableStateOf<List<ApprovalCard>>(emptyList()) }
    var status by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(client) { when (val result = client.list()) {
        is ApprovalApiResult.Ready -> cards = result.value
        is ApprovalApiResult.Rejected -> status = result.code
        ApprovalApiResult.Retryable -> status = "network_unavailable"
    } }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Approvals")
        status?.let { Text(it) }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(cards, key = { it.requestId }) { card ->
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(card.requestedAction); Text("${card.subjectType} · ${card.status}"); Text(card.subjectHash)
                } }
            }
        }
        Text("MFA step-up is required by the server before an approval decision.")
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") }
    }
}
