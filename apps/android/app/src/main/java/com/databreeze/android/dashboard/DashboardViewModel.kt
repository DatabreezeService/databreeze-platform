package com.databreeze.android.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.databreeze.android.network.AuthenticatedDashboardApiClient
import com.databreeze.android.network.DashboardApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardWidget(
    val id: String,
    val kind: String,
    val label: String,
    val value: String,
)

data class DashboardSnapshot(
    val dashboardId: String,
    val title: String,
    val widgets: List<DashboardWidget>,
    val evidenceImageIds: List<String>,
)

data class DashboardUiState(
    val dashboardId: String? = null,
    val title: String = "",
    val widgets: List<DashboardWidget> = emptyList(),
    val evidenceImageIds: List<String> = emptyList(),
    val usingLastGood: Boolean = false,
    val allowsCanvasMutation: Boolean = false,
)

class DashboardViewModel : ViewModel() {
    private var lastGood: DashboardSnapshot? = null
    private val _state = MutableStateFlow(DashboardUiState())
    val stateFlow: StateFlow<DashboardUiState> = _state.asStateFlow()
    val state: DashboardUiState get() = _state.value

    fun load(snapshot: DashboardSnapshot) {
        lastGood = snapshot
        _state.value =
            DashboardUiState(
                dashboardId = snapshot.dashboardId,
                title = snapshot.title,
                widgets = snapshot.widgets,
                evidenceImageIds = snapshot.evidenceImageIds,
                usingLastGood = false,
                allowsCanvasMutation = false,
            )
    }

    fun markOffline() {
        val snapshot = lastGood ?: return
        _state.value =
            state.copy(
                title = snapshot.title,
                widgets = snapshot.widgets,
                evidenceImageIds = snapshot.evidenceImageIds,
                usingLastGood = true,
            )
    }

    fun drillDownEvidence(): List<String> = state.evidenceImageIds

    fun loadFromServer(client: AuthenticatedDashboardApiClient, snapshotId: String) {
        viewModelScope.launch {
            when (val result = client.view(snapshotId)) {
                is DashboardApiResult.Ready -> load(result.snapshot)
                is DashboardApiResult.Rejected -> _state.value = _state.value.copy(title = result.code, usingLastGood = true)
                DashboardApiResult.Retryable -> markOffline()
            }
        }
    }
}
