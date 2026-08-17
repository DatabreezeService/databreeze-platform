package com.databreeze.android.operations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner

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
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = "Admin",
                title = stringResource(R.string.operations_tracking_title),
                description = stringResource(R.string.more_operations_description),
            )
        }
        error?.let { item { AppStatusBanner(it, error = true) } }
        items(events, key = { it.id }) { event ->
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(event.type, style = androidx.compose.material3.MaterialTheme.typography.titleSmall)
                    Text(event.at, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
