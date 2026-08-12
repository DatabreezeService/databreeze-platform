package com.databreeze.android.datasets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AND-010: logical dataset selection is required before extraction acceptance. */
class DatasetPickerViewModelTest {
    @Test
    fun lists_content_safe_datasets_and_selects_one() {
        val viewModel = DatasetPickerViewModel()
        viewModel.load(
            listOf(
                DatasetOption("01DATASET00000000000000001", "Chi phi Q1", "READY"),
                DatasetOption("01DATASET00000000000000002", "Doanh thu", "ATTENTION"),
            ),
        )
        assertEquals(2, viewModel.state.options.size)
        assertNull(viewModel.state.selectedId)
        assertTrue(viewModel.select("01DATASET00000000000000001"))
        assertEquals("01DATASET00000000000000001", viewModel.state.selectedId)
        assertTrue(viewModel.state.options.none { it.displayName.contains("\\") })
    }
}
