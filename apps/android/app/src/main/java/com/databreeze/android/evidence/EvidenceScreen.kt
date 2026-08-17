package com.databreeze.android.evidence

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
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
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner
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

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.evidence_action),
                title = stringResource(R.string.evidence_title),
                description = stringResource(R.string.evidence_body),
            )
        }
        item {
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
                }
            }
        }
        status?.let { item { AppStatusBanner(it, error = true) } }
        items(items, key = { it.id }) { item ->
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("${item.kind} · ${item.id}", style = androidx.compose.material3.MaterialTheme.typography.titleSmall)
                    Text(item.locator, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
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
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.evidence_verify_reference)) }
                }
            }
        }
        selectedEvidence?.let { id ->
            item { AppStatusBanner(stringResource(R.string.evidence_selected, id)) }
        }
    }
}
