package com.databreeze.android.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun DashboardScreen(
    localeTag: String = "vi-VN",
    viewModel: DashboardViewModel,
) {
    val state = viewModel.state
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(16.dp)
                .testTag("dashboard-screen"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(state.title)
        if (state.usingLastGood) {
            Text(if (localeTag.startsWith("vi")) "Đang dùng bản tốt gần nhất" else "Using last-good snapshot")
        }
        state.widgets.forEach { widget ->
            Text("${widget.label}: ${widget.value}", modifier = Modifier.testTag("dashboard-widget-${widget.id}"))
        }
    }
}
