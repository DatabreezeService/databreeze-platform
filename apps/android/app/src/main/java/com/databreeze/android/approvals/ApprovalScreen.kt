package com.databreeze.android.approvals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import com.databreeze.android.network.ApprovalApiResult
import com.databreeze.android.network.ApprovalCard
import com.databreeze.android.network.AuthenticatedApprovalApiClient
import com.databreeze.android.network.AndroidErrorMapper
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Approval is intentionally online and server-authoritative. The card hash is echoed to the
 * decision endpoint; no cached card is treated as proof of the current subject or policy.
 */
@Composable
fun ApprovalScreen(
    client: AuthenticatedApprovalApiClient,
    actorRole: String?,
    onBack: () -> Unit,
) {
    var cards by remember { mutableStateOf<List<ApprovalCard>>(emptyList()) }
    var status by remember { mutableStateOf<String?>(null) }
    var mfaAssertionId by remember { mutableStateOf("") }
    var busyRequestId by remember { mutableStateOf<String?>(null) }
    var reloadTick by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(client, reloadTick) {
        status = null
        when (val result = client.list()) {
            is ApprovalApiResult.Ready -> cards = result.value
            is ApprovalApiResult.Rejected -> status = result.code
            ApprovalApiResult.Retryable -> status = "network_unavailable"
        }
    }

    fun decide(card: ApprovalCard, decision: String) {
        if (actorRole.isNullOrBlank() || mfaAssertionId.isBlank()) {
            status = "approval_input_invalid"
            return
        }
        busyRequestId = card.requestId
        scope.launch {
            val result = client.decide(
                requestId = card.requestId,
                decisionId = UUID.randomUUID().toString(),
                decision = decision,
                subjectHash = card.subjectHash,
                mfaAssertionId = mfaAssertionId.trim(),
                actorRole = actorRole,
            )
            busyRequestId = null
            when (result) {
                is ApprovalApiResult.Ready -> {
                    status = "approval_decision_submitted"
                    reloadTick++
                }
                is ApprovalApiResult.Rejected -> status = result.code
                ApprovalApiResult.Retryable -> status = "network_unavailable"
            }
        }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = stringResource(R.string.approvals_eyebrow),
                title = stringResource(R.string.approvals_action),
                description = stringResource(R.string.more_approvals_description),
            )
        }
        item {
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.approval_online_only), style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(
                        value = mfaAssertionId,
                        onValueChange = { mfaAssertionId = it.take(128) },
                        label = { Text(stringResource(R.string.approval_mfa_assertion)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
            }
        }
        status?.let { item { AppStatusBanner(approvalStatusText(it), error = it != "approval_decision_submitted") } }
        if (cards.isEmpty() && status == null) item {
            AppStatusBanner(stringResource(R.string.approval_empty))
        }
        items(cards, key = { it.requestId }) { card ->
            AppCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(card.requestedAction, style = MaterialTheme.typography.titleSmall)
                    Text(stringResource(R.string.approval_subject, card.subjectType, card.status), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.approval_subject_hash, card.subjectHash), style = MaterialTheme.typography.labelSmall)
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Button(
                            onClick = { decide(card, "APPROVE") },
                            enabled = busyRequestId == null && card.status.equals("OPEN", ignoreCase = true),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(stringResource(R.string.approval_approve)) }
                        Button(
                            onClick = { decide(card, "REJECT") },
                            enabled = busyRequestId == null && card.status.equals("OPEN", ignoreCase = true),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(stringResource(R.string.approval_reject)) }
                    }
                }
            }
        }
        item { AppStatusBanner(stringResource(R.string.approval_mfa_note)) }
        item { Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back_action)) } }
    }
}

@Composable
private fun approvalStatusText(code: String): String = when (code) {
    "approval_decision_submitted" -> stringResource(R.string.approval_decision_submitted)
    "approval_input_invalid" -> stringResource(R.string.approval_input_invalid)
    "network_unavailable" -> stringResource(R.string.network_unavailable)
    "approval_auth_denied" -> stringResource(R.string.approval_auth_denied)
    "MFA_REQUIRED", "approval_mfa_required" -> stringResource(R.string.approval_mfa_required)
    "SUBJECT_CHANGED", "approval_subject_changed" -> stringResource(R.string.approval_subject_changed)
    else -> stringResource(AndroidErrorMapper.messageResource(code))
}
