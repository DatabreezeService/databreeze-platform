package com.databreeze.android.tasks

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
import com.databreeze.android.network.AuthenticatedMobileApiClient
import com.databreeze.android.network.MobileApiResult
import com.databreeze.android.network.MobileTaskCard
import com.databreeze.android.network.MobileConflictCard

@Composable
fun MobileTasksScreen(client: AuthenticatedMobileApiClient, onBack: () -> Unit) {
    var tasks by remember { mutableStateOf<List<MobileTaskCard>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var conflicts by remember { mutableStateOf<List<MobileConflictCard>>(emptyList()) }
    LaunchedEffect(client) {
        when (val result = client.tasks()) {
            is MobileApiResult.Ready -> tasks = result.value
            is MobileApiResult.Rejected -> error = result.code
            MobileApiResult.Retryable -> error = "network_unavailable"
        }
        when (val result = client.conflicts()) { is MobileApiResult.Ready -> conflicts = result.value; else -> Unit }
    }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.mobile_tasks_title))
        if (conflicts.isNotEmpty()) {
            Text("Conflicts requiring review")
            conflicts.forEach { conflict -> Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) { Text(conflict.reason); Text(conflict.status) } } }
        }
        error?.let { Text(it) }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(tasks, key = { "${it.resourceType}:${it.resourceId}" }) { task ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(task.safeTitleKey)
                        Text("${task.taskType} - ${task.evidenceAvailability}")
                        Text(task.permittedActions.joinToString(", "))
                    }
                }
            }
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back_action)) }
    }
}
