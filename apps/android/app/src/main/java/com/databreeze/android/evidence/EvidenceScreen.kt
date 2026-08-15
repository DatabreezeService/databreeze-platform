package com.databreeze.android.evidence

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.R
import com.databreeze.android.network.ArtifactApiResult
import com.databreeze.android.network.ArtifactEvidenceSummary
import com.databreeze.android.network.AuthenticatedArtifactApiClient
import kotlinx.coroutines.launch

/** Exact-version evidence drill-down. It intentionally renders only server-approved references. */
@Composable
fun EvidenceScreen(
    client: AuthenticatedArtifactApiClient,
    initialVersionId: String = "",
    onBack: () -> Unit,
) {
    var versionId by remember { mutableStateOf(initialVersionId) }
    var items by remember { mutableStateOf<List<ArtifactEvidenceSummary>>(emptyList()) }
    var status by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var selectedEvidence by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        loading = true
        status = null
        selectedEvidence = null
    }
    LaunchedEffect(loading) {
        if (!loading) return@LaunchedEffect
        when (val result = client.evidence(versionId.trim())) {
            is ArtifactApiResult.Ready -> items = result.value
            is ArtifactApiResult.Rejected -> {
                items = emptyList()
                status = result.code
            }
            ArtifactApiResult.Retryable -> status = "evidence_retryable"
        }
        loading = false
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.evidence_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.evidence_body), style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(
            value = versionId,
            onValueChange = { versionId = it },
            label = { Text(stringResource(R.string.evidence_version_id)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Button(
            onClick = ::load,
            enabled = versionId.isNotBlank() && !loading,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (loading) stringResource(R.string.evidence_loading) else stringResource(R.string.evidence_load)) }
        status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
            items(items, key = { it.id }) { item ->
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text("${item.kind} · ${item.id}", style = MaterialTheme.typography.titleSmall)
                    Text(item.locator, style = MaterialTheme.typography.bodySmall)
                    Button(
                        onClick = {
                            scope.launch {
                                when (val result = client.resolveEvidence(versionId.trim(), item.id)) {
                                    is ArtifactApiResult.Ready -> {
                                        selectedEvidence = result.value
                                        status = null
                                    }
                                    is ArtifactApiResult.Rejected -> status = result.code
                                    ArtifactApiResult.Retryable -> status = "evidence_retryable"
                                }
                            }
                        },
                    ) { Text(stringResource(R.string.evidence_verify_reference)) }
                }
            }
        }
        selectedEvidence?.let { id ->
            Text(stringResource(R.string.evidence_selected, id), style = MaterialTheme.typography.bodySmall)
        }
        Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back_action)) }
    }
}
