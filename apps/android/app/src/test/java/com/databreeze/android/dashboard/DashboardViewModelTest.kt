package com.databreeze.android.dashboard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** AND-014: dashboard is read/drill-down with last-good and evidence, not a free canvas. */
class DashboardViewModelTest {
    @Test
    fun renders_allowlisted_widgets_and_preserves_last_good_offline() {
        val viewModel = DashboardViewModel()
        viewModel.load(
            DashboardSnapshot(
                dashboardId = "01DASH00000000000000000001",
                title = "Chi phi",
                widgets =
                    listOf(
                        DashboardWidget("w1", "kpi", "Tong", "125000"),
                        DashboardWidget("w2", "table", "Dong", "3"),
                    ),
                evidenceImageIds = listOf("01ORIG0000000000000000001"),
            ),
        )
        assertEquals(2, viewModel.state.widgets.size)
        assertFalse(viewModel.state.allowsCanvasMutation)

        viewModel.markOffline()
        assertTrue(viewModel.state.usingLastGood)
        assertEquals("Chi phi", viewModel.state.title)
    }

    @Test
    fun drill_down_exposes_source_image_evidence_ids_only() {
        val viewModel = DashboardViewModel()
        viewModel.load(
            DashboardSnapshot(
                dashboardId = "01DASH00000000000000000002",
                title = "Receipts",
                widgets = listOf(DashboardWidget("w1", "kpi", "Count", "1")),
                evidenceImageIds = listOf("01ORIG0000000000000000002"),
            ),
        )
        assertEquals(listOf("01ORIG0000000000000000002"), viewModel.drillDownEvidence())
    }
}
