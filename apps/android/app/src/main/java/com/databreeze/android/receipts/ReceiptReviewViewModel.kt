package com.databreeze.android.receipts

import androidx.lifecycle.ViewModel
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ReceiptFieldCandidate(
    val field: String,
    val value: String,
    val confidence: Int,
    val evidenceCropId: String? = null,
)

data class ReceiptReviewUiState(
    val candidateId: String? = null,
    val priorCandidateId: String? = null,
    val fields: List<ReceiptFieldCandidate> = emptyList(),
    val lowConfidenceFields: Set<String> = emptySet(),
    val localeTag: String = "vi-VN",
    val adapterVersion: String? = null,
    val extractionErrorCode: String? = null,
)

/**
 * DDA-041 review surface. Confidence highlights uncertainty; corrections version candidates
 * without translating source values or mutating the prior extraction.
 */
class ReceiptReviewViewModel(
    private val lowConfidenceThreshold: Int = 85,
) : ViewModel() {
    private val _state = MutableStateFlow(ReceiptReviewUiState())
    val state: StateFlow<ReceiptReviewUiState> = _state.asStateFlow()
    private val immutablePriors = mutableMapOf<String, List<ReceiptFieldCandidate>>()

    fun loadCandidate(
        candidateId: String,
        fields: List<ReceiptFieldCandidate>,
        adapterVersion: String,
        localeTag: String = Locale.getDefault().toLanguageTag(),
        priorCandidateId: String? = null,
    ) {
        immutablePriors[candidateId] = fields.map { it.copy() }
        _state.value = ReceiptReviewUiState(
            candidateId = candidateId,
            priorCandidateId = priorCandidateId,
            fields = fields,
            lowConfidenceFields = fields.filter { it.confidence < lowConfidenceThreshold }
                .map { it.field }
                .toSet(),
            localeTag = localeTag,
            adapterVersion = adapterVersion,
            extractionErrorCode = null,
        )
    }

    /** The client never creates candidate values when the server OCR path is unavailable. */
    fun showExtractionUnavailable() {
        _state.value = ReceiptReviewUiState(extractionErrorCode = "server_ocr_unavailable")
    }

    fun evidenceCropAccessible(field: String): Boolean =
        _state.value.fields.any { it.field == field && !it.evidenceCropId.isNullOrBlank() }

    fun editFieldWithoutTranslatingSource(field: String, newValue: String): String {
        // Locale affects formatting chrome only; OCR source tokens stay as user-entered data.
        val updated = _state.value.fields.map {
            if (it.field == field) it.copy(value = newValue, confidence = 100) else it
        }
        val priorId = _state.value.candidateId
        val newId = "corrected-${System.currentTimeMillis()}"
        if (priorId != null) {
            immutablePriors.getOrPut(priorId) { _state.value.fields.map { it.copy() } }
        }
        _state.value = _state.value.copy(
            candidateId = newId,
            priorCandidateId = priorId,
            fields = updated,
            lowConfidenceFields = updated.filter { it.confidence < lowConfidenceThreshold }
                .map { it.field }
                .toSet(),
        )
        return newId
    }

    fun priorExtraction(candidateId: String): List<ReceiptFieldCandidate>? =
        immutablePriors[candidateId]?.map { it.copy() }
}
