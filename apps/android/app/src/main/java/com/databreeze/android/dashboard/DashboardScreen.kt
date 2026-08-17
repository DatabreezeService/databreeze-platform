package com.databreeze.android.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.databreeze.android.ui.AppCard
import com.databreeze.android.ui.AppSectionHeader
import com.databreeze.android.ui.AppStatusBanner

@Composable
fun DashboardScreen(
    localeTag: String = "vi-VN",
    viewModel: DashboardViewModel,
) {
    val state by viewModel.stateFlow.collectAsState()
    val vietnamese = localeTag.startsWith("vi")
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("dashboard-screen"),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = "Dashboard",
                title = state.title.ifBlank { if (vietnamese) "Chưa tải snapshot" else "No snapshot loaded" },
                description = if (vietnamese) "Giá trị đến từ snapshot được server cấp quyền." else "Values come from a server-authorized snapshot.",
            )
        }
        if (state.usingLastGood) {
            item {
                AppStatusBanner(if (vietnamese) "Đang dùng bản tốt gần nhất" else "Using last-good snapshot")
            }
        }
        items(state.widgets, key = { it.id }) { widget ->
            AppCard(modifier = Modifier.fillMaxWidth().testTag("dashboard-widget-${widget.id}")) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(widget.label, style = MaterialTheme.typography.labelLarge)
                    Text(widget.value, style = MaterialTheme.typography.headlineSmall)
                    Text(widget.kind, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
