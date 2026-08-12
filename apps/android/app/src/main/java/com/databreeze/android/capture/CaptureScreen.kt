package com.databreeze.android.capture

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
fun CaptureScreen(
    localeTag: String = "vi-VN",
    viewModel: CaptureViewModel = remember { CaptureViewModel() },
    onConfirmed: (CaptureProfile) -> Unit = {},
) {
    var state by remember { mutableStateOf(viewModel.state) }

    fun refresh() {
        state = viewModel.state
    }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(16.dp)
                .testTag("capture-screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(if (localeTag.startsWith("vi")) "Chọn hồ sơ capture" else "Choose capture profile")
        CaptureProfile.entries.forEach { profile ->
            Button(
                onClick = {
                    viewModel.setProfile(profile)
                    refresh()
                },
                modifier = Modifier.testTag("capture-profile-${profile.name}"),
            ) {
                Text(profile.label(localeTag))
            }
        }
        if (state.importOnly) {
            Text(
                if (localeTag.startsWith("vi")) {
                    "Máy ảnh bị từ chối — chỉ nhập tệp"
                } else {
                    "Camera denied — import only"
                },
            )
        }
        Button(
            onClick = {
                viewModel.onMediaReady(byteArrayOf(1, 2, 3))
                refresh()
            },
            modifier = Modifier.testTag("capture-media-ready"),
        ) {
            Text(if (localeTag.startsWith("vi")) "Sẵn sàng media" else "Media ready")
        }
        Button(
            enabled = state.profile != null && state.mediaReady,
            onClick = {
                if (viewModel.confirmCapture()) {
                    refresh()
                    onConfirmed(requireNotNull(viewModel.state.profile))
                }
            },
            modifier = Modifier.testTag("capture-confirm"),
        ) {
            Text(if (localeTag.startsWith("vi")) "Xác nhận" else "Confirm")
        }
    }
}
