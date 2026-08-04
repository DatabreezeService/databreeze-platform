"""Reviewed built-in processors composed into the closed registry."""

from .folder_autopilot import (
    FileObservation,
    build_file_observation,
    fingerprint_bytes,
)
from .spreadsheet_auditor import (
    SpreadsheetAuditError,
    SpreadsheetAuditResult,
    audit_workbook,
)
from .spreadsheet_auditor_action import (
    ACTION_TYPE as SPREADSHEET_AUDITOR_ACTION_TYPE,
)
from .spreadsheet_auditor_action import (
    ACTION_VERSION as SPREADSHEET_AUDITOR_ACTION_VERSION,
)
from .spreadsheet_auditor_action import (
    handle as handle_spreadsheet_auditor,
)
from .spreadsheet_auditor_manifest import (
    SpreadsheetAuditManifest,
    SpreadsheetAuditManifestFinding,
    SpreadsheetAuditManifestSheet,
    build_spreadsheet_audit_manifest,
)

__all__ = [
    "SPREADSHEET_AUDITOR_ACTION_TYPE",
    "SPREADSHEET_AUDITOR_ACTION_VERSION",
    "FileObservation",
    "SpreadsheetAuditError",
    "SpreadsheetAuditManifest",
    "SpreadsheetAuditManifestFinding",
    "SpreadsheetAuditManifestSheet",
    "SpreadsheetAuditResult",
    "audit_workbook",
    "build_file_observation",
    "build_spreadsheet_audit_manifest",
    "fingerprint_bytes",
    "handle_spreadsheet_auditor",
]
