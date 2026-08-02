"""Map the safe workbook audit into the value-free API manifest (SA-001..SA-006)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, Literal

from databreeze_contracts.v1 import Identifier, TenantScope, UtcTimestamp
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, StringConstraints

from .spreadsheet_auditor import SpreadsheetAuditResult

_ProcessorVersion = Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]
_Sha256 = Annotated[StrictStr, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


class SpreadsheetAuditManifestSheet(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    sheetId: Identifier
    name: Annotated[StrictStr, StringConstraints(min_length=1, max_length=128)]
    maxRow: StrictInt = Field(ge=0, le=1_000_000)
    maxColumn: StrictInt = Field(ge=0, le=16_384)
    formulaCount: StrictInt = Field(ge=0, le=1_000_000)


class SpreadsheetAuditManifestFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    findingId: Identifier
    sheetId: Identifier
    address: Annotated[StrictStr, StringConstraints(pattern=r"^[A-Z]{1,3}[1-9][0-9]*$")]
    kind: Literal["FORMULA_FAMILY_OUTLIER", "FORMULA_GAP"]
    severity: Literal["INFO", "WARNING", "ERROR"]
    formulaFingerprint: _Sha256


class SpreadsheetAuditManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    schemaVersion: Literal[1]
    auditId: Identifier
    artifactVersionId: Identifier
    tenantScope: TenantScope
    workbookSha256: _Sha256
    sheets: tuple[SpreadsheetAuditManifestSheet, ...]
    findings: tuple[SpreadsheetAuditManifestFinding, ...]
    blockedReasons: tuple[Literal["MACRO", "EXTERNAL_LINK", "UNSUPPORTED_XML"], ...]
    processorVersion: _ProcessorVersion
    createdAt: UtcTimestamp


def build_spreadsheet_audit_manifest(
    result: SpreadsheetAuditResult,
    *,
    audit_id: str,
    artifact_version_id: str,
    tenant_scope: TenantScope,
    processor_version: str,
    created_at: str,
    sheet_ids: Mapping[str, str],
    finding_ids: Mapping[tuple[str, str], str],
) -> SpreadsheetAuditManifest:
    """Attach server-issued identities without ever copying workbook values."""
    if set(sheet_ids) != {sheet.name for sheet in result.sheets}:
        raise ValueError("SHEET_ID_MAPPING_INCOMPLETE")
    if len(set(sheet_ids.values())) != len(sheet_ids):
        raise ValueError("SHEET_ID_MAPPING_DUPLICATE")
    sheets = tuple(
        SpreadsheetAuditManifestSheet(
            sheetId=sheet_ids[sheet.name],
            name=sheet.name,
            maxRow=sheet.maxRow,
            maxColumn=sheet.maxColumn,
            formulaCount=sheet.formulaCount,
        )
        for sheet in result.sheets
    )
    findings = tuple(
        SpreadsheetAuditManifestFinding(
            findingId=finding_ids[(finding.sheet, finding.address)],
            sheetId=sheet_ids[finding.sheet],
            address=finding.address.upper(),
            kind=finding.kind,
            severity="WARNING",
            formulaFingerprint=finding.formulaFingerprint,
        )
        for finding in result.findings
    )
    return SpreadsheetAuditManifest(
        schemaVersion=1,
        auditId=audit_id,
        artifactVersionId=artifact_version_id,
        tenantScope=tenant_scope,
        workbookSha256=result.workbookSha256,
        sheets=sheets,
        findings=findings,
        blockedReasons=result.blockedReasons,
        processorVersion=processor_version,
        createdAt=created_at,
    )
