package com.databreeze.android.capture

data class CaptureUiState(
    val profile: CaptureProfile? = null,
    val cameraPermissionGranted: Boolean = false,
    val cameraAvailable: Boolean = false,
    val importOnly: Boolean = false,
    val mediaReady: Boolean = false,
    val confirmed: Boolean = false,
    val statusMessageKey: String = "capture_idle",
)

class CaptureViewModel {
    private var pendingMedia: ByteArray? = null
    var state: CaptureUiState = CaptureUiState()
        private set

    fun setProfile(profile: CaptureProfile) {
        state = state.copy(profile = profile)
    }

    fun updateCameraPermission(granted: Boolean) {
        state =
            if (granted) {
                state.copy(
                    cameraPermissionGranted = true,
                    cameraAvailable = true,
                    importOnly = false,
                    statusMessageKey = "capture_camera_ready",
                )
            } else {
                state.copy(
                    cameraPermissionGranted = false,
                    cameraAvailable = false,
                    importOnly = true,
                    statusMessageKey = "capture_camera_denied_import_only",
                )
            }
    }

    fun onMediaReady(bytes: ByteArray) {
        pendingMedia = bytes.copyOf()
        state = state.copy(mediaReady = true, confirmed = false, statusMessageKey = "capture_confirm")
    }

    fun confirmCapture(): Boolean {
        if (state.profile == null || pendingMedia == null) return false
        state = state.copy(confirmed = true, statusMessageKey = "capture_confirmed")
        return true
    }
}
