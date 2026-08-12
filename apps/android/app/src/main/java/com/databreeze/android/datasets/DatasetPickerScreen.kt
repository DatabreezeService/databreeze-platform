package com.databreeze.android.datasets

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun DatasetPickerScreen(
    localeTag: String = "vi-VN",
    viewModel: DatasetPickerViewModel,
    onSelected: (String) -> Unit = {},
) {
    var state by remember { mutableStateOf(viewModel.state) }
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(16.dp)
                .testTag("dataset-picker"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(if (localeTag.startsWith("vi")) "Chọn tập dữ liệu" else "Choose dataset")
        state.options.forEach { option ->
            Button(
                onClick = {
                    viewModel.select(option.datasetId)
                    state = viewModel.state
                    onSelected(option.datasetId)
                },
                modifier = Modifier.testTag("dataset-option-${option.datasetId}"),
            ) {
                Text("${option.displayName} (${option.health})")
            }
        }
    }
}
