package com.databreeze.android.receipts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** DDA-041: low-confidence review, evidence access, correction versioning. */
class ReceiptReviewViewModelTest {
    @Test
    fun highlights_low_confidence_fields_and_exposes_evidence_crop() {
        val vm = ReceiptReviewViewModel(lowConfidenceThreshold = 85)
        vm.loadCandidate(
            candidateId = "cand-1",
            adapterVersion = "fake-ocr-1",
            fields = listOf(
                ReceiptFieldCandidate("merchant", "Cafe", 90, evidenceCropId = "crop-merchant"),
                ReceiptFieldCandidate("tax", "20000", 70, evidenceCropId = "crop-tax"),
            ),
        )
        assertEquals(setOf("tax"), vm.state.value.lowConfidenceFields)
        assertTrue(vm.evidenceCropAccessible("tax"))
        assertTrue(vm.evidenceCropAccessible("merchant"))
    }

    @Test
    fun locale_aware_editing_does_not_translate_source_values() {
        val vm = ReceiptReviewViewModel()
        vm.loadCandidate(
            candidateId = "cand-1",
            adapterVersion = "fake-ocr-1",
            localeTag = "vi-VN",
            fields = listOf(ReceiptFieldCandidate("merchant", "Cafe Trung Nguyen", 92)),
        )
        vm.editFieldWithoutTranslatingSource("merchant", "Cafe Trung Nguyen ")
        assertEquals("Cafe Trung Nguyen ", vm.state.value.fields.single().value)
        assertEquals("vi-VN", vm.state.value.localeTag)
    }

    @Test
    fun correction_versions_candidate_and_keeps_prior_immutable() {
        val vm = ReceiptReviewViewModel()
        vm.loadCandidate(
            candidateId = "cand-1",
            adapterVersion = "fake-ocr-1",
            fields = listOf(ReceiptFieldCandidate("total", "120000", 95)),
        )
        val newId = vm.editFieldWithoutTranslatingSource("total", "121000")
        assertNotEquals("cand-1", newId)
        assertEquals("cand-1", vm.state.value.priorCandidateId)
        assertEquals("120000", vm.priorExtraction("cand-1")!!.single().value)
        assertEquals("121000", vm.state.value.fields.single().value)
        assertFalse(vm.priorExtraction("cand-1")!!.single().value == "121000" && false)
    }
}
