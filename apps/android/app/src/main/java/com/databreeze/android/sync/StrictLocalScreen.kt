package com.databreeze.android.sync

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.AndroidRuntime
import com.databreeze.android.R
import com.databreeze.android.receipts.ReceiptStagingMetadata
import com.databreeze.android.storage.AccountWorkspaceScope
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** User-mediated Strict-Local export. The OS document picker is the only transfer destination. */
@Composable
fun StrictLocalScreen(
    runtime: AndroidRuntime,
    scope: AccountWorkspaceScope,
    onBack: () -> Unit,
) {
    var staged by remember { mutableStateOf<List<ReceiptStagingMetadata>>(emptyList()) }
    var purpose by remember { mutableStateOf("") }
    var destination by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var pendingPackage by remember { mutableStateOf<ByteArray?>(null) }
    var pendingManifest by remember { mutableStateOf<StrictLocalPackageExporter.Manifest?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current
    val createDocument = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val bytes = pendingPackage
        val manifest = pendingManifest
        pendingPackage = null
        pendingManifest = null
        if (uri == null || bytes == null) return@rememberLauncherForActivityResult
        coroutineScope.launch(Dispatchers.IO) {
            val result = runCatching {
                require(bytes.size in 1..64 * 1024 * 1024)
                context.contentResolver.openOutputStream(uri, "w")?.use { output ->
                    output.write(bytes)
                    output.flush()
                } ?: error("strict_local_output_unavailable")
                if (manifest == null) return@runCatching "strict_local_export_failed"
                when (exporterReceipt(runtime, manifest)) {
                    StrictLocalPackageExporter.ReceiptResult.Accepted -> "strict_local_export_ready"
                    StrictLocalPackageExporter.ReceiptResult.Retryable -> "strict_local_receipt_pending"
                    is StrictLocalPackageExporter.ReceiptResult.Rejected -> "strict_local_receipt_failed"
                }
            }.getOrElse { "strict_local_export_failed" }
            withContext(kotlinx.coroutines.Dispatchers.Main) { status = result }
        }
    }

    LaunchedEffect(runtime, scope) {
        staged = withContext(Dispatchers.IO) { runtime.receiptStagingStore.list(scope) }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.strict_local_eyebrow),
                title = stringResource(R.string.strict_local_title),
                description = stringResource(R.string.strict_local_body),
            )
        }
        item {
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.strict_local_item_count, staged.size))
                    OutlinedTextField(
                        value = purpose,
                        onValueChange = { purpose = it.take(200) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.strict_local_purpose)) },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = destination,
                        onValueChange = { destination = it.take(64) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.strict_local_destination)) },
                        singleLine = true,
                    )
                    Button(
                        onClick = {
                            val exporter = runtime.strictLocalPackageExporter
                            if (exporter == null || staged.isEmpty() || purpose.isBlank() || destination.isBlank()) {
                                status = "strict_local_input_invalid"
                                return@Button
                            }
                            coroutineScope.launch {
                                status = "strict_local_preparing"
                                val records = withContext(Dispatchers.IO) {
                                    staged.take(64).mapNotNull { metadata ->
                                        runtime.receiptStagingStore.loadOriginal(scope, runtime.receiptKeyHandle, metadata.artifactSessionId)
                                    }
                                }
                                if (records.size != staged.take(64).size) {
                                    status = "strict_local_source_missing"
                                    return@launch
                                }
                                when (val issued = exporter.issue(purpose, destination, records.map { digest(it) })) {
                                    is StrictLocalPackageExporter.Result.Issued -> {
                                        val encrypted = withContext(Dispatchers.IO) {
                                            exporter.exportEncryptedPackage(
                                                runtime.deviceKeyStore,
                                                runtime.receiptKeyHandle,
                                                records,
                                                manifest = issued.manifest,
                                                serverValue = issued.serverValue,
                                            )
                                        }
                                        pendingPackage = encrypted.bytes
                                        pendingManifest = issued.manifest
                                        createDocument.launch("databreeze-${issued.manifest.packageId}.dbz")
                                        status = "strict_local_transfer_required"
                                    }
                                    is StrictLocalPackageExporter.Result.Rejected -> status = issued.code
                                    StrictLocalPackageExporter.Result.Retryable -> status = "network_unavailable"
                                }
                            }
                        },
                        enabled = staged.isNotEmpty() && purpose.isNotBlank() && destination.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.strict_local_export)) }
                }
            }
        }
        status?.let { value ->
            item {
                AppStatusBanner(
                    stringResource(strictLocalStatusResource(value)),
                    error = value.contains("invalid") || value.contains("failed") || value.contains("missing") || value.contains("denied"),
                )
            }
        }
        item {
            Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.back_action))
            }
        }
    }
}

private fun digest(bytes: ByteArray): String =
    java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

private fun strictLocalStatusResource(code: String): Int = when (code) {
    "strict_local_preparing" -> R.string.strict_local_preparing
    "strict_local_transfer_required" -> R.string.strict_local_transfer_required
    "strict_local_export_ready" -> R.string.strict_local_export_ready
    "strict_local_input_invalid" -> R.string.strict_local_input_invalid
    "strict_local_source_missing" -> R.string.strict_local_source_missing
    "strict_local_export_failed" -> R.string.strict_local_export_failed
    "strict_local_receipt_pending" -> R.string.strict_local_receipt_pending
    "strict_local_receipt_failed" -> R.string.strict_local_receipt_failed
    "strict_local_output_unavailable" -> R.string.strict_local_export_failed
    "strict_local_digest_invalid" -> R.string.strict_local_digest_invalid
    "strict_local_response_invalid" -> R.string.strict_local_response_invalid
    "strict_local_auth_denied" -> R.string.strict_local_auth_denied
    "network_unavailable" -> R.string.network_unavailable
    else -> R.string.strict_local_export_failed
}

private suspend fun exporterReceipt(
    runtime: AndroidRuntime,
    manifest: StrictLocalPackageExporter.Manifest,
): StrictLocalPackageExporter.ReceiptResult =
    runtime.strictLocalPackageExporter?.recordTransferReceipt(manifest)
        ?: StrictLocalPackageExporter.ReceiptResult.Rejected("strict_local_export_failed")
