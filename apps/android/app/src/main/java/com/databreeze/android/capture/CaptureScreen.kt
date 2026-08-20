package com.databreeze.android.capture

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
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

/** Selects a governed capture profile; it never fabricates media bytes. */
@Composable
fun CaptureScreen(
    localeTag: String = "vi-VN",
    viewModel: CaptureViewModel = remember { CaptureViewModel() },
    onConfirmed: (CaptureProfile) -> Unit = {},
) {
    var selected by remember { mutableStateOf(viewModel.state.profile) }
    val vietnamese = localeTag.startsWith("vi")
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp).testTag("capture-screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppSectionHeader(
            eyebrow = if (vietnamese) "Thu thập" else "Capture",
            title = if (vietnamese) "Chọn hồ sơ capture" else "Choose capture profile",
            description = if (vietnamese) "Chọn loại đầu vào trước khi lưu bản gốc bất biến." else "Choose an input type before preserving the immutable original.",
        )
        CaptureProfile.entries.forEach { profile ->
            AppActionRow(
                glyph = "+",
                title = profile.label(localeTag),
                description = if (vietnamese) "Mở luồng thu thập tương ứng." else "Open the corresponding capture flow.",
                onClick = {
                    viewModel.setProfile(profile)
                    selected = profile
                    onConfirmed(profile)
                },
                modifier = Modifier.testTag("capture-profile-${profile.name}"),
            )
        }
        selected?.let { profile ->
            Text(
                if (vietnamese) "Đã chọn: ${profile.label(localeTag)}" else "Selected: ${profile.label(localeTag)}",
                modifier = Modifier.testTag("capture-profile-selected"),
            )
        }
    }
}
