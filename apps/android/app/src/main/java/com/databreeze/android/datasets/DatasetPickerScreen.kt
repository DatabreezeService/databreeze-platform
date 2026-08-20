package com.databreeze.android.datasets

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.databreeze.android.ui.AppActionRow
import com.databreeze.android.ui.AppSectionHeader

@Composable
fun DatasetPickerScreen(
    localeTag: String = "vi-VN",
    viewModel: DatasetPickerViewModel,
    onSelected: (String) -> Unit = {},
) {
    var state by remember { mutableStateOf(viewModel.state) }
    LazyColumn(
        modifier = Modifier.fillMaxSize().testTag("dataset-picker"),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSectionHeader(
                eyebrow = if (localeTag.startsWith("vi")) "Dữ liệu" else "Data",
                title = if (localeTag.startsWith("vi")) "Chọn tập dữ liệu" else "Choose dataset",
                description = if (localeTag.startsWith("vi")) "Mỗi lựa chọn được xác thực lại theo workspace hiện tại." else "Every selection is re-authorized for the current workspace.",
            )
        }
        items(state.options, key = { it.datasetId }) { option ->
            AppActionRow(
                glyph = "◫",
                title = option.displayName,
                description = option.health,
                onClick = {
                    viewModel.select(option.datasetId)
                    state = viewModel.state
                    onSelected(option.datasetId)
                },
                modifier = Modifier.testTag("dataset-option-${option.datasetId}"),
            )
        }
    }
}
