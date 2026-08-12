package com.databreeze.android.extraction

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** AND-008 / DDA-041: review highlights low confidence and versions corrections. */
class ExtractionReviewViewModelTest {
    @Test
    fun highlights_low_confidence_fields_without_mutating_prior() {
        val viewModel = ExtractionReviewViewModel(lowConfidenceThreshold = 80)
        viewModel.loadCandidate(
            candidateId = "cand-1",
            fields =
                listOf(
                    ExtractionField("total", "125000", 42),
                    ExtractionField("merchant", "Cafe", 95),
                ),
        )
        assertEquals(setOf("total"), viewModel.state.lowConfidenceFields)
        assertEquals("125000", viewModel.state.fields.first { it.key == "total" }.value)

        viewModel.correctField("total", "130000")
        assertEquals("cand-1-v2", viewModel.state.candidateId)
        assertEquals("cand-1", viewModel.state.priorCandidateId)
        assertEquals("130000", viewModel.state.fields.first { it.key == "total" }.value)
        assertEquals("125000", viewModel.priorFields("cand-1").first { it.key == "total" }.value)
    }

    @Test
    fun acceptance_requires_logical_dataset() {
        val viewModel = ExtractionReviewViewModel()
        viewModel.loadCandidate(
            candidateId = "cand-2",
            fields = listOf(ExtractionField("total", "1", 90)),
        )
        assertFalse(viewModel.accept())
        viewModel.selectDataset("01DATASET00000000000000001")
        assertTrue(viewModel.accept())
        assertTrue(viewModel.state.accepted)
        assertEquals("01DATASET00000000000000001", viewModel.state.datasetId)
    }
}
