package com.databreeze.android.datasets

data class DatasetOption(
    val datasetId: String,
    val displayName: String,
    val health: String,
)

data class DatasetPickerUiState(
    val options: List<DatasetOption> = emptyList(),
    val selectedId: String? = null,
)

class DatasetPickerViewModel {
    var state: DatasetPickerUiState = DatasetPickerUiState()
        private set

    fun load(options: List<DatasetOption>) {
        state = DatasetPickerUiState(options = options)
    }

    fun select(datasetId: String): Boolean {
        if (state.options.none { it.datasetId == datasetId }) return false
        state = state.copy(selectedId = datasetId)
        return true
    }
}
