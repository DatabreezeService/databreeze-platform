"""Reviewed built-in processors composed into the closed registry."""

from .spreadsheet_auditor import (
    SpreadsheetAuditError,
    SpreadsheetAuditResult,
    audit_workbook,
)
from .spreadsheet_auditor_manifest import (
    SpreadsheetAuditManifest,
    SpreadsheetAuditManifestFinding,
    SpreadsheetAuditManifestSheet,
    build_spreadsheet_audit_manifest,
)

__all__ = [
    "SpreadsheetAuditError",
    "SpreadsheetAuditManifest",
    "SpreadsheetAuditManifestFinding",
    "SpreadsheetAuditManifestSheet",
    "SpreadsheetAuditResult",
    "audit_workbook",
    "build_spreadsheet_audit_manifest",
]
