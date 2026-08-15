package com.databreeze.android.billing

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import com.databreeze.android.R
import com.databreeze.android.network.AuthenticatedBillingApiClient
import com.databreeze.android.network.BillingApiResult
import com.databreeze.android.network.BillingPlan
import com.databreeze.android.network.BillingSession
import java.text.NumberFormat
import java.util.Locale
import kotlinx.coroutines.launch

/**
 * Authenticated billing surface for the non-demo build.
 * The server owns the catalog and amount; this screen only submits an immutable plan id.
 */
@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun AuthenticatedBillingScreen(
    client: AuthenticatedBillingApiClient,
    onBack: () -> Unit,
    initialOrderCode: Long? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var plans by remember { mutableStateOf<List<BillingPlan>>(emptyList()) }
    var currentSession by remember { mutableStateOf<BillingSession?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }

    suspend fun loadPlans() {
        loading = true
        message = null
        when (val result = client.listPlans()) {
            is BillingApiResult.Success -> plans = result.value
            is BillingApiResult.Rejected -> message = result.code
            BillingApiResult.Retryable -> message = "network_unavailable"
        }
        loading = false
    }

    LaunchedEffect(client) { loadPlans() }

    // PayOS returns to the verified web origin. The redirect is only a hint: status is polled
    // from the authenticated API and the server remains authoritative (no URL status trust).
    LaunchedEffect(client, initialOrderCode) {
        val orderCode = initialOrderCode ?: return@LaunchedEffect
        var attempts = 0
        while (attempts < 40) {
            when (val result = client.status(orderCode)) {
                is BillingApiResult.Success -> {
                    currentSession = result.value
                    if (result.value.status != "PENDING") break
                }
                is BillingApiResult.Rejected -> {
                    message = result.code
                    break
                }
                BillingApiResult.Retryable -> message = "network_unavailable"
            }
            attempts++
            if (attempts < 40) kotlinx.coroutines.delay(3_000L)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.android_billing_title)) },
                navigationIcon = {
                    OutlinedButton(onClick = onBack, modifier = Modifier.padding(start = 8.dp)) {
                        Text(stringResource(R.string.back_action))
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(stringResource(R.string.android_billing_server_owned), style = MaterialTheme.typography.bodyMedium)
                if (loading) Text(stringResource(R.string.android_billing_loading))
                message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
            currentSession?.let { session ->
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(stringResource(R.string.android_billing_order, session.orderCode), style = MaterialTheme.typography.titleMedium)
                            Text(stringResource(R.string.android_billing_amount, formatVnd(session.amountVnd)))
                            Text(stringResource(R.string.android_billing_status, session.status))
                            OutlinedButton(
                                onClick = {
                                    // Status remains server-authoritative after returning from PayOS.
                                    // The demo and production adapters use the same status endpoint.
                                    scope.launch {
                                        when (val result = client.status(session.orderCode)) {
                                            is BillingApiResult.Success -> currentSession = result.value
                                            is BillingApiResult.Rejected -> message = result.code
                                            BillingApiResult.Retryable -> message = "network_unavailable"
                                        }
                                    }
                                },
                            ) { Text(stringResource(R.string.android_billing_refresh)) }
                        }
                    }
                }
            }
            items(plans, key = { it.id }) { plan ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(plan.displayNameVi, style = MaterialTheme.typography.titleMedium)
                        Text(plan.taglineVi, style = MaterialTheme.typography.bodyMedium)
                        Text(formatVnd(plan.amountVnd), style = MaterialTheme.typography.headlineSmall)
                        plan.benefitsVi.forEach { benefit -> Text("• $benefit") }
                        Button(
                            onClick = {
                                scope.launch {
                                    when (val result = client.createCheckout(plan.id)) {
                                        is BillingApiResult.Success -> {
                                            currentSession = result.value
                                            val checkoutUrl = result.value.checkoutUrl
                                            if (checkoutUrl?.startsWith("https://") == true) {
                                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(checkoutUrl)))
                                            } else {
                                                message = "checkout_url_invalid"
                                            }
                                        }
                                        is BillingApiResult.Rejected -> message = result.code
                                        BillingApiResult.Retryable -> message = "network_unavailable"
                                    }
                                }
                            },
                            enabled = !loading,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(stringResource(R.string.android_billing_choose)) }
                    }
                }
            }
        }
    }
}

private fun formatVnd(value: Long): String =
    "${NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN")).format(value)} ₫"
