package com.databreeze.android.notifications

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
import com.databreeze.android.network.AuthenticatedNotificationsApiClient
import com.databreeze.android.network.NotificationSummary
import com.databreeze.android.network.NotificationsApiResult

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
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.notifications_title, unread))
        error?.let { Text(it) }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { item ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(item.title)
                        Text(item.state)
                        Text(item.createdAt)
                    }
                }
            }
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back_action)) }
    }
}
