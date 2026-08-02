"""Reviewed built-in processors composed into the closed registry."""
from .spreadsheet_auditor import SpreadsheetAuditError, SpreadsheetAuditResult, audit_workbook

__all__ = ["SpreadsheetAuditError", "SpreadsheetAuditResult", "audit_workbook"]
