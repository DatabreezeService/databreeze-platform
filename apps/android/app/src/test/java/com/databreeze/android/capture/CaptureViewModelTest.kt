package com.databreeze.android.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** AND-001 / DDA-040: capture is explicit and profile-bound. */
class CaptureProfileTest {
    @Test
    fun supports_only_receipt_invoice_and_table_profiles() {
        assertEquals(
            listOf(CaptureProfile.RECEIPT_V1, CaptureProfile.INVOICE_V1, CaptureProfile.TABLE_V1),
            CaptureProfile.entries.toList(),
        )
    }

    @Test
    fun vietnamese_and_english_labels_are_complete() {
        assertEquals("Hóa đơn bán lẻ", CaptureProfile.RECEIPT_V1.label("vi-VN"))
        assertEquals("Receipt", CaptureProfile.RECEIPT_V1.label("en"))
        assertEquals("Hóa đơn GTGT", CaptureProfile.INVOICE_V1.label("vi-VN"))
        assertEquals("Invoice", CaptureProfile.INVOICE_V1.label("en"))
        assertEquals("Bảng", CaptureProfile.TABLE_V1.label("vi-VN"))
        assertEquals("Table", CaptureProfile.TABLE_V1.label("en"))
    }
}

class CaptureViewModelTest {
    @Test
    fun denied_camera_falls_back_to_import_only() {
        val viewModel = CaptureViewModel()
        viewModel.setProfile(CaptureProfile.RECEIPT_V1)
        viewModel.updateCameraPermission(false)
        assertTrue(viewModel.state.importOnly)
        assertFalse(viewModel.state.cameraAvailable)
        assertEquals("capture_camera_denied_import_only", viewModel.state.statusMessageKey)
    }

    @Test
    fun requires_explicit_profile_before_confirm() {
        val viewModel = CaptureViewModel()
        viewModel.updateCameraPermission(true)
        viewModel.onMediaReady(byteArrayOf(1, 2, 3))
        assertFalse(viewModel.confirmCapture())
        viewModel.setProfile(CaptureProfile.TABLE_V1)
        assertTrue(viewModel.confirmCapture())
        assertEquals(CaptureProfile.TABLE_V1, viewModel.state.profile)
        assertTrue(viewModel.state.confirmed)
    }
}
