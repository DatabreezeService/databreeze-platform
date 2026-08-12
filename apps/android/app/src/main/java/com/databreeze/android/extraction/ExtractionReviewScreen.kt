package com.databreeze.android.extraction

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
fun ExtractionReviewScreen(
    localeTag: String = "vi-VN",
    viewModel: ExtractionReviewViewModel,
    originalLabel: String,
) {
    var state by remember { mutableStateOf(viewModel.state) }
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(16.dp)
                .testTag("extraction-review"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(if (localeTag.startsWith("vi")) "Xem lại trích xuất" else "Extraction review")
        Text(originalLabel, modifier = Modifier.testTag("extraction-original"))
        state.fields.forEach { field ->
            val low = field.key in state.lowConfidenceFields
            Text(
                "${field.key}: ${field.value} (${field.confidence}%)" +
                    if (low) {
                        if (localeTag.startsWith("vi")) " — thấp" else " — low"
                    } else {
                        ""
                    },
                modifier = Modifier.testTag("extraction-field-${field.key}"),
            )
        }
        Button(
            onClick = {
                viewModel.accept()
                state = viewModel.state
            },
            enabled = state.datasetId != null,
            modifier = Modifier.testTag("extraction-accept"),
        ) {
            Text(if (localeTag.startsWith("vi")) "Chấp nhận" else "Accept")
        }
    }
}
