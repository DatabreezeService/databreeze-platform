package com.databreeze.android.receipts

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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.databreeze.android.R
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner

@Composable
fun ReceiptReviewScreen(
    viewModel: ReceiptReviewViewModel,
    onBack: () -> Unit,
    onAccept: () -> Unit = {},
) {
    val state by viewModel.state.collectAsState()
    val drafts = remember(state.candidateId) {
        mutableStateMapOf<String, String>().apply {
            state.fields.forEach { put(it.field, it.value) }
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("receipt-review-screen"),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.receipt_review_title),
                title = stringResource(R.string.receipt_review_title),
                description = stringResource(R.string.receipt_review_confidence_note),
            )
        }
        if (state.extractionErrorCode == "server_ocr_unavailable") {
            item { AppStatusBanner(stringResource(R.string.receipt_review_ocr_unavailable), error = true, modifier = Modifier.testTag("receipt-review-ocr-unavailable")) }
        }
        state.extractionErrorCode?.takeIf { it != "server_ocr_unavailable" }?.let { code ->
            item { AppStatusBanner(code, error = true, modifier = Modifier.testTag("receipt-review-error")) }
        }
        items(state.fields, key = { it.field }) { field ->
            val low = field.field in state.lowConfidenceFields
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    field.evidenceCropId?.takeIf { it.isNotBlank() }?.let { evidenceId ->
                        Text(stringResource(R.string.receipt_review_evidence_reference, evidenceId), style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                    }
                    OutlinedTextField(
                        value = drafts[field.field] ?: field.value,
                        onValueChange = { drafts[field.field] = it },
                        label = {
                            Text(if (low) stringResource(R.string.receipt_review_low_confidence, field.field) else field.field)
                        },
                        modifier = Modifier.fillMaxWidth().testTag("receipt-field-${field.field}"),
                    )
                }
            }
        }
        item {
            Button(
                onClick = { viewModel.saveCorrections(drafts.toMap()) },
                modifier = Modifier.fillMaxWidth().testTag("receipt-review-save"),
                enabled = state.fields.isNotEmpty() && state.extractionErrorCode == null && !state.correctionPending,
            ) { Text(stringResource(R.string.receipt_review_save)) }
        }
        state.acceptanceStatus?.let { status ->
            item { AppStatusBanner(status, error = !status.matches(Regex("^[0-9a-fA-F-]{36}$")), modifier = Modifier.testTag("receipt-review-acceptance-status")) }
        }
        item {
            Button(
                onClick = onAccept,
                enabled = state.fields.isNotEmpty() && state.extractionErrorCode == null && state.acceptanceStatus == null && !state.correctionPending,
                modifier = Modifier.fillMaxWidth().testTag("receipt-review-accept"),
            ) { Text(stringResource(R.string.receipt_review_accept)) }
        }
        item { androidx.compose.material3.OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth().testTag("receipt-review-back")) { Text(stringResource(R.string.back_action)) } }
    }
}
