package com.databreeze.android.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import com.databreeze.android.network.AuthenticatedMobileApiClient
import com.databreeze.android.network.MobileApiResult
import com.databreeze.android.network.MobileTaskCard
import com.databreeze.android.network.MobileConflictCard
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner

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
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.mobile_tasks_action),
                title = stringResource(R.string.mobile_tasks_title),
                description = stringResource(R.string.more_tasks_description),
            )
        }
        if (conflicts.isNotEmpty()) {
            item { AppStatusBanner("Conflicts requiring review", error = true) }
            items(conflicts, key = { it.conflictId }) { conflict ->
                AppCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) { Text(conflict.reason); Text(conflict.status) } }
            }
        }
        error?.let { item { AppStatusBanner(it, error = true) } }
        items(tasks, key = { "${it.resourceType}:${it.resourceId}" }) { task ->
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(task.safeTitleKey, style = androidx.compose.material3.MaterialTheme.typography.titleSmall)
                    Text("${task.taskType} · ${task.evidenceAvailability}", style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                    Text(task.permittedActions.joinToString(", "), style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}
