package com.databreeze.android.operations

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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.R
import com.databreeze.android.network.AuthenticatedOperationsApiClient
import com.databreeze.android.network.OperationsApiResult

/** Server-authorized admin/operator activity view; the app never infers authority locally. */
@Composable
fun AdminTrackingScreen(client: AuthenticatedOperationsApiClient, onBack: () -> Unit) {
    var events by remember { mutableStateOf<List<com.databreeze.android.network.AuditEventSummary>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(client) {
        when (val result = client.auditEvents()) {
            is OperationsApiResult.Ready -> events = result.events
            is OperationsApiResult.Rejected -> error = result.code
            OperationsApiResult.Retryable -> error = "network_unavailable"
        }
    }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.operations_tracking_title))
        error?.let { Text(it) }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(events, key = { it.id }) { event ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(event.type)
                        Text(event.at)
                    }
                }
            }
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back_action)) }
    }
}
