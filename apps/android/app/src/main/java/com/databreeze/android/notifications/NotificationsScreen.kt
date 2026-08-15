package com.databreeze.android.notifications

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
import com.databreeze.android.network.AuthenticatedNotificationsApiClient
import com.databreeze.android.network.NotificationSummary
import com.databreeze.android.network.NotificationsApiResult
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner

@Composable
fun NotificationsScreen(client: AuthenticatedNotificationsApiClient, onBack: () -> Unit) {
    var items by remember { mutableStateOf<List<NotificationSummary>>(emptyList()) }
    var unread by remember { mutableStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(client) {
        when (val result = client.list()) {
            is NotificationsApiResult.Ready -> { items = result.items; unread = result.unreadCount }
            is NotificationsApiResult.Rejected -> error = result.code
            NotificationsApiResult.Retryable -> error = "network_unavailable"
        }
    }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.notifications_action),
                title = stringResource(R.string.notifications_title, unread),
                description = stringResource(R.string.more_notifications_description),
            )
        }
        error?.let { item { AppStatusBanner(it, error = true) } }
        items(items, key = { it.id }) { item ->
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(item.title, style = androidx.compose.material3.MaterialTheme.typography.titleSmall)
                    Text(item.state, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                    Text(item.createdAt, style = androidx.compose.material3.MaterialTheme.typography.labelSmall, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
