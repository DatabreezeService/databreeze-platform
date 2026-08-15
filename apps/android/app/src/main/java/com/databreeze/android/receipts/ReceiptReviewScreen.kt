package com.databreeze.android.receipts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("receipt-review-screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.receipt_review_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = stringResource(R.string.receipt_review_confidence_note),
            style = MaterialTheme.typography.bodyMedium,
        )
        if (state.extractionErrorCode == "server_ocr_unavailable") {
            Text(
                text = stringResource(R.string.receipt_review_ocr_unavailable),
                modifier = Modifier.testTag("receipt-review-ocr-unavailable"),
            )
        }
        state.extractionErrorCode?.takeIf { it != "server_ocr_unavailable" }?.let { code ->
            Text(
                text = code,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("receipt-review-error"),
            )
        }
        state.fields.forEach { field ->
            val low = field.field in state.lowConfidenceFields
            field.evidenceCropId?.takeIf { it.isNotBlank() }?.let { evidenceId ->
                Text(
                    stringResource(R.string.receipt_review_evidence_reference, evidenceId),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            OutlinedTextField(
                value = drafts[field.field] ?: field.value,
                onValueChange = { drafts[field.field] = it },
                label = {
                    Text(
                        if (low) {
                            stringResource(R.string.receipt_review_low_confidence, field.field)
                        } else {
                            field.field
                        },
                    )
                },
                modifier = Modifier.testTag("receipt-field-${field.field}"),
            )
        }
        Button(
            onClick = {
                viewModel.saveCorrections(drafts.toMap())
            },
            modifier = Modifier.testTag("receipt-review-save"),
            enabled = state.fields.isNotEmpty() && state.extractionErrorCode == null && !state.correctionPending,
        ) {
            Text(stringResource(R.string.receipt_review_save))
        }
        state.acceptanceStatus?.let { status ->
            Text(
                text = status,
                color = if (status.matches(Regex("^[0-9a-fA-F-]{36}$"))) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("receipt-review-acceptance-status"),
            )
        }
        Button(
            onClick = onAccept,
            enabled = state.fields.isNotEmpty() && state.extractionErrorCode == null && state.acceptanceStatus == null && !state.correctionPending,
            modifier = Modifier.testTag("receipt-review-accept"),
        ) {
            Text(stringResource(R.string.receipt_review_accept))
        }
        Button(onClick = onBack, modifier = Modifier.testTag("receipt-review-back")) {
            Text(stringResource(R.string.back_action))
        }
    }
}
