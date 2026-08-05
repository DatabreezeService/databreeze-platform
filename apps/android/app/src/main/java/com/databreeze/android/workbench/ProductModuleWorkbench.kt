package com.databreeze.android.workbench

import com.databreeze.android.R

enum class AndroidModuleLifecycle {
    PARTIAL,
    PLANNED,
}

enum class AndroidModuleSurface {
    ALERT_AND_REVIEW,
    FINDING_REVIEW,
    REVIEW_AND_APPROVAL,
    CAPTURE,
    REPORT_REVIEW,
    ANALYSIS_REVIEW,
    MIGRATION_REVIEW,
    INCIDENT_AND_APPROVAL,
    INTAKE_AND_APPROVAL,
}

data class AndroidProductModule(
    val id: String,
    val requirementPrefix: String,
    val lifecycle: AndroidModuleLifecycle,
    val mobileSurface: AndroidModuleSurface,
    val titleRes: Int,
    val summaryRes: Int,
    val roleRes: Int,
)

/**
 * Content-safe mobile workbench metadata. The client never treats this
 * presentation catalog as authorization or as a substitute for server tasks.
 */
object ProductModuleWorkbench {
    val modules: List<AndroidProductModule> = listOf(
        AndroidProductModule(
            id = "folder-autopilot",
            requirementPrefix = "FA",
            lifecycle = AndroidModuleLifecycle.PLANNED,
            mobileSurface = AndroidModuleSurface.ALERT_AND_REVIEW,
            titleRes = R.string.module_folder_autopilot_title,
            summaryRes = R.string.module_folder_autopilot_summary,
            roleRes = R.string.module_folder_autopilot_role,
        ),
        AndroidProductModule(
            id = "spreadsheet-auditor",
            requirementPrefix = "SA",
            lifecycle = AndroidModuleLifecycle.PARTIAL,
            mobileSurface = AndroidModuleSurface.FINDING_REVIEW,
            titleRes = R.string.module_spreadsheet_auditor_title,
            summaryRes = R.string.module_spreadsheet_auditor_summary,
            roleRes = R.string.module_spreadsheet_auditor_role,
        ),
        AndroidProductModule(
            id = "quote-intelligence",
            requirementPrefix = "QI",
            lifecycle = AndroidModuleLifecycle.PLANNED,
            mobileSurface = AndroidModuleSurface.REVIEW_AND_APPROVAL,
            titleRes = R.string.module_quote_intelligence_title,
            summaryRes = R.string.module_quote_intelligence_summary,
            roleRes = R.string.module_quote_intelligence_role,
        ),
        AndroidProductModule(
            id = "operations-capture",
            requirementPrefix = "OC",
            lifecycle = AndroidModuleLifecycle.PARTIAL,
            mobileSurface = AndroidModuleSurface.CAPTURE,
            titleRes = R.string.module_operations_capture_title,
            summaryRes = R.string.module_operations_capture_summary,
            roleRes = R.string.module_operations_capture_role,
        ),
        AndroidProductModule(
            id = "invoice-leak-detector",
            requirementPrefix = "ILD",
            lifecycle = AndroidModuleLifecycle.PLANNED,
            mobileSurface = AndroidModuleSurface.FINDING_REVIEW,
            titleRes = R.string.module_invoice_leak_detector_title,
            summaryRes = R.string.module_invoice_leak_detector_summary,
            roleRes = R.string.module_invoice_leak_detector_role,
        ),
        AndroidProductModule(
            id = "client-report-factory",
            requirementPrefix = "CRF",
            lifecycle = AndroidModuleLifecycle.PLANNED,
            mobileSurface = AndroidModuleSurface.REPORT_REVIEW,
            titleRes = R.string.module_client_report_factory_title,
            summaryRes = R.string.module_client_report_factory_summary,
            roleRes = R.string.module_client_report_factory_role,
        ),
        AndroidProductModule(
            id = "private-data-analyst",
            requirementPrefix = "PDA",
            lifecycle = AndroidModuleLifecycle.PLANNED,
            mobileSurface = AndroidModuleSurface.ANALYSIS_REVIEW,
            titleRes = R.string.module_private_data_analyst_title,
            summaryRes = R.string.module_private_data_analyst_summary,
            roleRes = R.string.module_private_data_analyst_role,
        ),
        AndroidProductModule(
            id = "migration-ready",
            requirementPrefix = "MR",
            lifecycle = AndroidModuleLifecycle.PLANNED,
            mobileSurface = AndroidModuleSurface.MIGRATION_REVIEW,
            titleRes = R.string.module_migration_ready_title,
            summaryRes = R.string.module_migration_ready_summary,
            roleRes = R.string.module_migration_ready_role,
        ),
        AndroidProductModule(
            id = "data-quality-guard",
            requirementPrefix = "DQG",
            lifecycle = AndroidModuleLifecycle.PLANNED,
            mobileSurface = AndroidModuleSurface.INCIDENT_AND_APPROVAL,
            titleRes = R.string.module_data_quality_guard_title,
            summaryRes = R.string.module_data_quality_guard_summary,
            roleRes = R.string.module_data_quality_guard_role,
        ),
        AndroidProductModule(
            id = "embedded-importer",
            requirementPrefix = "EI",
            lifecycle = AndroidModuleLifecycle.PLANNED,
            mobileSurface = AndroidModuleSurface.INTAKE_AND_APPROVAL,
            titleRes = R.string.module_embedded_importer_title,
            summaryRes = R.string.module_embedded_importer_summary,
            roleRes = R.string.module_embedded_importer_role,
        ),
    )

    fun find(id: String): AndroidProductModule? = modules.firstOrNull { it.id == id }
}
