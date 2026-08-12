package com.databreeze.android.dashboard

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

class DashboardViewModel {
    private var lastGood: DashboardSnapshot? = null
    var state: DashboardUiState = DashboardUiState()
        private set

    fun load(snapshot: DashboardSnapshot) {
        lastGood = snapshot
        state =
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
        state =
            state.copy(
                title = snapshot.title,
                widgets = snapshot.widgets,
                evidenceImageIds = snapshot.evidenceImageIds,
                usingLastGood = true,
            )
    }

    fun drillDownEvidence(): List<String> = state.evidenceImageIds
}
