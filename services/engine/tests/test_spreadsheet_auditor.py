from __future__ import annotations

import io
import zipfile

import pytest

from databreeze_engine.processors.spreadsheet_auditor import SpreadsheetAuditError, audit_workbook


def _workbook(*, macro: bool = False, external_link: bool = False) -> bytes:
    workbook = b'''<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>'''
    relationships = b'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="worksheet"/></Relationships>'''
    sheet = b'''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>SUM(B1:C1)</f><v>3</v></c><c r="B1"><f>SUM(B1:C1)</f><v>3</v></c><c r="C1"><f>SUM(B1:D1)</f><v>4</v></c></row></sheetData></worksheet>'''
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", relationships)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
        if macro:
            archive.writestr("xl/vbaProject.bin", b"not executed")
        if external_link:
            archive.writestr("xl/externalLinks/externalLink1.xml", b"<link/>")
    return output.getvalue()


def test_audit_is_value_free_and_reports_formula_family_outlier() -> None:
    result = audit_workbook(_workbook())
    assert result.sheets[0].name == "Inventory"
    assert result.sheets[0].formulaCount == 3
    assert len(result.findings) == 1
    assert result.findings[0].address == "C1"
    assert "SUM(B1:D1)" not in result.model_dump_json()
    assert result.blockedReasons == ()


@pytest.mark.parametrize("flag", ["macro", "external_link"])
def test_audit_discloses_blocked_execution_features_without_running_them(flag: str) -> None:
    result = audit_workbook(_workbook(**{flag: True}))
    if flag == "macro":
        assert "MACRO" in result.blockedReasons
    else:
        assert "EXTERNAL_LINK" in result.blockedReasons


def test_audit_rejects_archive_traversal_and_cell_resource_exhaustion() -> None:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("../escape.xml", b"bad")
    with pytest.raises(SpreadsheetAuditError, match="INVALID_ARCHIVE"):
        audit_workbook(output.getvalue())
    with pytest.raises(SpreadsheetAuditError, match="RESOURCE_LIMIT"):
        audit_workbook(_workbook(), max_cells=1)
