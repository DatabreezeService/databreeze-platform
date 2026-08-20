package com.databreeze.android.receipts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ReceiptFieldCandidate(
    val field: String,
    val value: String,
    val confidence: Int,
    val evidenceCropId: String? = null,
)

data class ReceiptReviewUiState(
    val candidateId: String? = null,
    val priorCandidateId: String? = null,
    val artifactVersionId: String? = null,
    val fields: List<ReceiptFieldCandidate> = emptyList(),
    val lowConfidenceFields: Set<String> = emptySet(),
    val localeTag: String = "vi-VN",
    val adapterVersion: String? = null,
    val extractionErrorCode: String? = null,
    val artifactContentHash: String? = null,
    val acceptanceStatus: String? = null,
    val correctionPending: Boolean = false,
)

/**
 * DDA-041 review surface. Confidence highlights uncertainty; corrections version candidates
 * without translating source values or mutating the prior extraction.
 */
class ReceiptReviewViewModel(
    private val extractionApiClient: ReceiptExtractionApiClient? = null,
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
        artifactVersionId: String? = null,
    ) {
        immutablePriors[candidateId] = fields.map { it.copy() }
        _state.value = ReceiptReviewUiState(
            candidateId = candidateId,
            priorCandidateId = priorCandidateId,
            artifactVersionId = artifactVersionId,
            fields = fields,
            lowConfidenceFields = fields.filter { it.confidence < lowConfidenceThreshold }
                .map { it.field }
                .toSet(),
            localeTag = localeTag,
            adapterVersion = adapterVersion,
            extractionErrorCode = null,
        )
    }

    /**
     * Polls/reads the exact candidate version from the authenticated API when configured.
     * Provider failure retains the original and the manual correction path.
     */
    fun loadCandidateFromServer(
        candidateId: String,
        idempotencyKey: String,
        revision: Long = 1,
        localeTag: String = Locale.getDefault().toLanguageTag(),
    ) {
        val client = extractionApiClient
        if (client == null) {
            showExtractionUnavailable()
            return
        }
        viewModelScope.launch {
            when (
                val result =
                    client.readCandidate(
                        candidateId = candidateId,
                        idempotencyKey = idempotencyKey,
                        revision = revision,
                    )
            ) {
                is ReceiptCandidateReadResult.Ready ->
                    loadCandidate(
                        candidateId = result.candidateId,
                        fields = result.fields,
                        adapterVersion = result.adapterVersion,
                        localeTag = localeTag,
                    )
                is ReceiptCandidateReadResult.Unavailable ->
                    _state.value = ReceiptReviewUiState(extractionErrorCode = result.code)
                is ReceiptCandidateReadResult.Rejected ->
                    _state.value = ReceiptReviewUiState(extractionErrorCode = result.code)
                ReceiptCandidateReadResult.Retryable ->
                    _state.value = ReceiptReviewUiState(extractionErrorCode = "receipt_candidate_retryable")
            }
        }
    }

    /** Completes the upload -> profile -> extraction -> candidate read loop after capture. */
    fun loadReceiptFromUpload(
        sessionId: String,
        references: ReceiptArtifactReferenceStore,
        localeTag: String = Locale.getDefault().toLanguageTag(),
    ) {
        val client = extractionApiClient
        if (client == null) {
            showExtractionUnavailable()
            return
        }
        viewModelScope.launch {
            var artifactVersionId: String? = null
            var attempts = 0
            while (artifactVersionId == null && attempts < 60) {
                artifactVersionId = references.find(sessionId)
                if (artifactVersionId == null) {
                    attempts += 1
                    kotlinx.coroutines.delay(500)
                }
            }
            val artifact = artifactVersionId
            val artifactHash = references.findDigest(sessionId)
            if (artifact == null) {
                _state.value = ReceiptReviewUiState(extractionErrorCode = "receipt_upload_pending")
                return@launch
            }
            val profile = when (val result = client.fetchProfile()) {
                is ReceiptProfileResult.Ready -> result.profile
                is ReceiptProfileResult.Rejected -> {
                    _state.value = ReceiptReviewUiState(extractionErrorCode = result.code)
                    return@launch
                }
                ReceiptProfileResult.Retryable -> {
                    _state.value = ReceiptReviewUiState(extractionErrorCode = "receipt_profile_retryable")
                    return@launch
                }
            }
            val correlationId = UUID.randomUUID().toString()
            when (
                val result = client.requestExtraction(
                    ReceiptExtractionRequest(
                        artifactVersionId = artifact,
                        profileVersionId = profile.profileVersionId,
                        correlationId = correlationId,
                        idempotencyKey = "receipt-extract-$sessionId",
                        revision = 1,
                    ),
                )
            ) {
                is ReceiptExtractionApiResult.Accepted -> when (
                    val candidate = client.readCandidate(
                        candidateId = result.candidateId,
                        idempotencyKey = "receipt-candidate-${result.candidateId}",
                        revision = 1,
                        artifactVersionId = artifact,
                    )
                ) {
                    is ReceiptCandidateReadResult.Ready -> {
                        loadCandidate(
                            candidateId = candidate.candidateId,
                            fields = candidate.fields,
                            adapterVersion = candidate.adapterVersion,
                            localeTag = localeTag,
                            artifactVersionId = artifact,
                        )
                        _state.value = _state.value.copy(
                            artifactContentHash = artifactHash,
                            artifactVersionId = artifact,
                        )
                    }
                    is ReceiptCandidateReadResult.Unavailable -> _state.value = ReceiptReviewUiState(extractionErrorCode = candidate.code)
                    is ReceiptCandidateReadResult.Rejected -> _state.value = ReceiptReviewUiState(extractionErrorCode = candidate.code)
                    ReceiptCandidateReadResult.Retryable -> _state.value = ReceiptReviewUiState(extractionErrorCode = "receipt_candidate_retryable")
                }
                is ReceiptExtractionApiResult.Unavailable -> _state.value = ReceiptReviewUiState(extractionErrorCode = result.code)
                is ReceiptExtractionApiResult.Rejected -> _state.value = ReceiptReviewUiState(extractionErrorCode = result.code)
                ReceiptExtractionApiResult.Retryable -> _state.value = ReceiptReviewUiState(extractionErrorCode = "receipt_extraction_retryable")
            }
        }
    }

    fun acceptCurrent() {
        val client = extractionApiClient
        val candidateId = _state.value.candidateId
        val hash = _state.value.artifactContentHash
        if (client == null || candidateId == null || hash == null) {
            _state.value = _state.value.copy(acceptanceStatus = "receipt_accept_context_missing")
            return
        }
        viewModelScope.launch {
            when (
                val result = client.acceptCandidate(
                    candidateId = candidateId,
                    artifactContentHash = hash,
                    expectedRevision = 1,
                    correlationId = UUID.randomUUID().toString(),
                    idempotencyKey = "receipt-accept-$candidateId",
                )
            ) {
                is ReceiptAcceptanceApiResult.Accepted -> _state.value = _state.value.copy(acceptanceStatus = result.datasetVersionId)
                is ReceiptAcceptanceApiResult.Rejected -> _state.value = _state.value.copy(acceptanceStatus = result.code)
                ReceiptAcceptanceApiResult.Retryable -> _state.value = _state.value.copy(acceptanceStatus = "receipt_accept_retryable")
            }
        }
    }

    /** The client never creates candidate values when the server OCR path is unavailable. */
    fun showExtractionUnavailable() {
        _state.value = ReceiptReviewUiState(extractionErrorCode = "server_ocr_unavailable")
    }

    fun evidenceCropAccessible(field: String): Boolean =
        _state.value.fields.any { it.field == field && !it.evidenceCropId.isNullOrBlank() }

    /**
     * Saves the complete edited field set as one server correction. The local screen is
     * optimistic, but the candidate identity only advances after the API returns the new
     * immutable version; a generated request handle is never used for acceptance.
     */
    fun saveCorrections(values: Map<String, String>) {
        val snapshot = _state.value
        val priorId = snapshot.candidateId ?: return
        val updated = snapshot.fields.map { field ->
            field.copy(
                value = values[field.field] ?: field.value,
                confidence = if (values[field.field] != null && values[field.field] != field.value) 100 else field.confidence,
            )
        }
        if (updated == snapshot.fields) return
        immutablePriors.getOrPut(priorId) { snapshot.fields.map { it.copy() } }
        _state.value = snapshot.copy(
            fields = updated,
            priorCandidateId = priorId,
            correctionPending = extractionApiClient != null,
            extractionErrorCode = null,
            acceptanceStatus = null,
            lowConfidenceFields = updated.filter { it.confidence < lowConfidenceThreshold }
                .map { it.field }
                .toSet(),
        )
        val client = extractionApiClient ?: return
        viewModelScope.launch {
            when (
                val corrected = client.correctCandidate(
                    ReceiptCandidateCorrection(
                        priorCandidateId = priorId,
                        fields = updated,
                        idempotencyKey = correctionIdempotencyKey(priorId, updated),
                        revision = 1,
                        artifactVersionId = snapshot.artifactVersionId,
                    ),
                )
            ) {
                is ReceiptExtractionApiResult.Accepted -> when (
                    val canonical = client.readCandidate(
                        candidateId = corrected.candidateId,
                        idempotencyKey = "receipt-candidate-${corrected.candidateId}",
                        revision = 1,
                        artifactVersionId = snapshot.artifactVersionId,
                    )
                ) {
                    is ReceiptCandidateReadResult.Ready -> {
                        loadCandidate(
                            candidateId = canonical.candidateId,
                            fields = canonical.fields,
                            adapterVersion = canonical.adapterVersion,
                            localeTag = snapshot.localeTag,
                            priorCandidateId = priorId,
                            artifactVersionId = snapshot.artifactVersionId,
                        )
                        _state.value = _state.value.copy(
                            artifactContentHash = snapshot.artifactContentHash,
                            correctionPending = false,
                        )
                    }
                    is ReceiptCandidateReadResult.Rejected -> _state.value = _state.value.copy(
                        correctionPending = false,
                        extractionErrorCode = canonical.code,
                    )
                    is ReceiptCandidateReadResult.Unavailable -> _state.value = _state.value.copy(
                        correctionPending = false,
                        extractionErrorCode = canonical.code,
                    )
                    ReceiptCandidateReadResult.Retryable -> _state.value = _state.value.copy(
                        correctionPending = false,
                        extractionErrorCode = "receipt_candidate_retryable",
                    )
                }
                is ReceiptExtractionApiResult.Rejected -> _state.value = _state.value.copy(
                    correctionPending = false,
                    extractionErrorCode = corrected.code,
                )
                is ReceiptExtractionApiResult.Unavailable -> _state.value = _state.value.copy(
                    correctionPending = false,
                    extractionErrorCode = corrected.code,
                )
                ReceiptExtractionApiResult.Retryable -> _state.value = _state.value.copy(
                    correctionPending = false,
                    extractionErrorCode = "receipt_correction_retryable",
                )
            }
        }
    }

    /** Compatibility helper for callers that edit one field at a time. */
    fun editFieldWithoutTranslatingSource(field: String, newValue: String): String {
        saveCorrections(_state.value.fields.associate { it.field to if (it.field == field) newValue else it.value })
        return UUID.randomUUID().toString()
    }

    fun priorExtraction(candidateId: String): List<ReceiptFieldCandidate>? =
        immutablePriors[candidateId]?.map { it.copy() }

    private fun correctionIdempotencyKey(
        priorCandidateId: String,
        fields: List<ReceiptFieldCandidate>,
    ): String {
        val stable = buildString {
            append(priorCandidateId)
            fields.sortedBy { it.field }.forEach {
                append('\u0000').append(it.field).append('=').append(it.value)
            }
        }
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(stable.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return "receipt-correct-$digest"
    }
}
