"""Typed engine action for the bounded, value-free Spreadsheet Auditor."""

from __future__ import annotations

from databreeze_engine.handler import ActionExecutionError, HandlerContext
from databreeze_engine.models import (
    EngineProgress,
    SpreadsheetAuditFindingSummary,
    SpreadsheetAuditParameters,
    SpreadsheetAuditProcessorResult,
    SpreadsheetAuditSheetSummary,
)

from .spreadsheet_auditor import SpreadsheetAuditError, audit_workbook

ACTION_TYPE = "spreadsheet-auditor.audit"
ACTION_VERSION = "1.0.0"
INPUT_SCHEMA_ID = "spreadsheet-auditor.workbook.v1"
OUTPUT_SCHEMA_ID = "spreadsheet-auditor.result.v1"
PROCESSOR_VERSION = "spreadsheet-auditor@1.0.0"


def handle(
    context: HandlerContext, parameters: SpreadsheetAuditParameters
) -> SpreadsheetAuditProcessorResult:
    """Audit exactly one hash-bound workbook handle without executing workbook content."""
    if len(context.input_handles) != 1:
        raise ActionExecutionError("VALIDATION_FAILED")
    input_handle = context.input_handles[0]
    if input_handle.schemaId != INPUT_SCHEMA_ID:
        raise ActionExecutionError("VALIDATION_FAILED")
    try:
        content = context.read_input(input_handle)
        result = audit_workbook(content)
    except SpreadsheetAuditError as error:
        code = "RESOURCE_LIMIT_EXCEEDED" if error.code == "RESOURCE_LIMIT" else "VALIDATION_FAILED"
        raise ActionExecutionError(code) from None

    context.progress.emit(
        EngineProgress(
            attemptId=context.attempt_id,
            sequence=1,
            phaseKey="spreadsheet-auditor.completed",
            completedUnits=1,
            totalUnits=1,
        )
    )
    return SpreadsheetAuditProcessorResult(
        schemaVersion=1,
        artifactVersionId=parameters.artifactVersionId,
        jobId=parameters.jobId,
        resultManifestId=parameters.resultManifestId,
        workbookSha256=result.workbookSha256,
        sheets=tuple(
            SpreadsheetAuditSheetSummary(
                name=sheet.name,
                maxRow=sheet.maxRow,
                maxColumn=sheet.maxColumn,
                formulaCount=sheet.formulaCount,
            )
            for sheet in result.sheets
        ),
        findings=tuple(
            SpreadsheetAuditFindingSummary(
                sheet=finding.sheet,
                address=finding.address.upper(),
                kind=finding.kind,
                severity="WARNING",
                formulaFingerprint=finding.formulaFingerprint,
            )
            for finding in result.findings
        ),
        blockedReasons=result.blockedReasons,
        processorVersion=PROCESSOR_VERSION,
    )
