package com.databreeze.android.diagnostics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.AndroidRuntime
import com.databreeze.android.R
import com.databreeze.android.network.AuthenticatedApiRuntime
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner

/** Redacted device recovery surface: no tokens, paths, source bytes or provider secrets. */
@Composable
fun DiagnosticsScreen(
    runtime: AndroidRuntime,
    authenticated: AuthenticatedApiRuntime?,
    onSync: () -> Unit,
    onCleanup: () -> Unit = {},
    onBack: () -> Unit,
) {
    var confirmCleanup by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppSectionHeader(
            eyebrow = stringResource(R.string.diagnostics_action),
            title = stringResource(R.string.diagnostics_title),
            description = stringResource(R.string.more_diagnostics_description),
        )
        AppCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.diagnostics_scope, authenticated?.scope?.stableKey ?: "signed-out"), style = MaterialTheme.typography.bodySmall)
                Text(stringResource(R.string.diagnostics_staging, authenticated?.scope?.let { runtime.receiptStagingStore.usageBytes(it) } ?: 0L), style = MaterialTheme.typography.bodySmall)
                Text(stringResource(R.string.diagnostics_sync_transport, runtime.syncTransport::class.simpleName ?: "unknown"), style = MaterialTheme.typography.bodySmall)
                Text(stringResource(R.string.diagnostics_enrollment, if (authenticated?.deviceId?.isNotBlank() == true) "ready" else "required"), style = MaterialTheme.typography.bodySmall)
            }
        }
        AppStatusBanner(stringResource(R.string.diagnostics_redaction_note))
        Button(onClick = onSync, enabled = authenticated != null, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.diagnostics_sync_now))
        }
        Button(onClick = { confirmCleanup = true }, enabled = authenticated != null, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.diagnostics_cleanup))
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back_action)) }
    }
    if (confirmCleanup) AlertDialog(
        onDismissRequest = { confirmCleanup = false },
        title = { Text(stringResource(R.string.diagnostics_cleanup_title)) },
        text = { Text(stringResource(R.string.diagnostics_cleanup_body)) },
        confirmButton = { Button(onClick = { onCleanup(); confirmCleanup = false }) { Text(stringResource(R.string.confirm_action)) } },
        dismissButton = { Button(onClick = { confirmCleanup = false }) { Text(stringResource(R.string.cancel_action)) } },
    )
}
