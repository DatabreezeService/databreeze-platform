package com.databreeze.android.extraction

data class ExtractionField(
    val key: String,
    val value: String,
    val confidence: Int,
)

data class ExtractionReviewUiState(
    val candidateId: String? = null,
    val priorCandidateId: String? = null,
    val fields: List<ExtractionField> = emptyList(),
    val lowConfidenceFields: Set<String> = emptySet(),
    val datasetId: String? = null,
    val accepted: Boolean = false,
    val version: Int = 1,
)

class ExtractionReviewViewModel(
    private val lowConfidenceThreshold: Int = 85,
) {
    private val priors = mutableMapOf<String, List<ExtractionField>>()
    var state: ExtractionReviewUiState = ExtractionReviewUiState()
        private set

    fun loadCandidate(
        candidateId: String,
        fields: List<ExtractionField>,
    ) {
        priors[candidateId] = fields.map { it.copy() }
        state =
            ExtractionReviewUiState(
                candidateId = candidateId,
                fields = fields,
                lowConfidenceFields =
                    fields
                        .filter { it.confidence < lowConfidenceThreshold }
                        .map { it.key }
                        .toSet(),
                version = 1,
            )
    }

    fun priorFields(candidateId: String): List<ExtractionField> = priors[candidateId].orEmpty()

    fun correctField(
        key: String,
        value: String,
    ) {
        val currentId = state.candidateId ?: return
        val nextId = "$currentId-v${state.version + 1}"
        val nextFields =
            state.fields.map {
                if (it.key == key) it.copy(value = value) else it
            }
        priors[currentId] = priors[currentId] ?: state.fields
        state =
            state.copy(
                priorCandidateId = currentId,
                candidateId = nextId,
                fields = nextFields,
                version = state.version + 1,
                lowConfidenceFields =
                    nextFields
                        .filter { it.confidence < lowConfidenceThreshold }
                        .map { it.key }
                        .toSet(),
            )
    }

    fun selectDataset(datasetId: String) {
        state = state.copy(datasetId = datasetId)
    }

    fun accept(): Boolean {
        if (state.datasetId == null) return false
        state = state.copy(accepted = true)
        return true
    }
}
