from __future__ import annotations

import io
import zipfile

import pytest

from databreeze_engine.processors import (
    SpreadsheetAuditError,
    audit_workbook,
    build_spreadsheet_audit_manifest,
    spreadsheet_auditor,
)


def _workbook(
    *,
    macro: bool = False,
    external_link: bool = False,
    formula_gap: bool = False,
    mixed_formula_gap: bool = False,
    absolute_reference: bool = False,
) -> bytes:
    workbook = (
        b'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        b'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        b'<sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    relationships = (
        b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        b'<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
    )
    if absolute_reference:
        sheet_rows = (
            b'<row r="1"><c r="A1"><f>SUM($B$1:C1)</f><v>3</v></c></row>'
            b'<row r="2"><c r="A2"><f>SUM(B2:C2)</f><v>3</v></c></row>'
            b'<row r="3"><c r="A3"><f>SUM(B3:C3)</f><v>3</v></c></row>'
        )
    elif mixed_formula_gap:
        sheet_rows = (
            b'<row r="1"><c r="A1"><f>SUM(B1:C1)</f><v>3</v></c></row>'
            b'<row r="2"><c r="A2"><f>B2*C2</f><v>9</v></c></row>'
            b'<row r="3"><c r="A3"><f>SUM(B3:C3)</f><v>3</v></c></row>'
        )
    elif formula_gap:
        sheet_rows = (
            b'<row r="1"><c r="A1"><f>SUM(B1:C1)</f><v>3</v></c></row>'
            b'<row r="2"><c r="A2"><v>9</v></c></row>'
            b'<row r="3"><c r="A3"><f>SUM(B3:C3)</f><v>3</v></c></row>'
        )
    else:
        sheet_rows = (
            b'<row r="1"><c r="A1"><f>SUM(B1:C1)</f><v>3</v></c>'
            b'<c r="B1"><f>SUM(B1:C1)</f><v>3</v></c>'
            b'<c r="C1"><f>SUM(B1:D1)</f><v>4</v></c></row>'
        )
    sheet = (
        b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        b"<sheetData>" + sheet_rows + b"</sheetData></worksheet>"
    )
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


def test_audit_reports_a_formula_gap_without_returning_the_intervening_value() -> None:
    result = audit_workbook(_workbook(formula_gap=True))
    assert [(finding.address, finding.kind) for finding in result.findings] == [
        ("A2", "FORMULA_GAP"),
    ]
    assert all("value" not in finding.model_dump() for finding in result.findings)


def test_audit_pairs_matching_formula_families_across_an_intervening_family() -> None:
    result = audit_workbook(_workbook(mixed_formula_gap=True))
    assert [
        (finding.address, finding.kind)
        for finding in result.findings
        if finding.kind == "FORMULA_GAP"
    ] == [("A2", "FORMULA_GAP")]


def test_formula_family_normalization_preserves_absolute_references() -> None:
    result = audit_workbook(_workbook(absolute_reference=True))
    assert [(finding.address, finding.kind) for finding in result.findings] == [
        ("A1", "FORMULA_FAMILY_OUTLIER"),
    ]


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


@pytest.mark.parametrize("sheet_count", [512, 513])
def test_audit_bounds_sheet_cardinality(
    monkeypatch: pytest.MonkeyPatch,
    sheet_count: int,
) -> None:
    monkeypatch.setattr(
        spreadsheet_auditor,
        "_sheet_targets",
        lambda _archive: [("Inventory", "xl/worksheets/sheet1.xml") for _ in range(sheet_count)],
    )

    if sheet_count == 513:
        with pytest.raises(SpreadsheetAuditError, match="RESOURCE_LIMIT"):
            audit_workbook(_workbook())
    else:
        assert len(audit_workbook(_workbook()).sheets) == sheet_count


@pytest.mark.parametrize("finding_count", [10_000, 10_001])
def test_audit_bounds_finding_cardinality(
    monkeypatch: pytest.MonkeyPatch,
    finding_count: int,
) -> None:
    def synthetic_cells(_root: object):
        return (
            (
                f"A{row}",
                f"={spreadsheet_auditor._column_name(row)}1",
            )
            for row in range(1, finding_count + 1)
        )

    monkeypatch.setattr(spreadsheet_auditor, "_iter_cells", synthetic_cells)

    if finding_count == 10_001:
        with pytest.raises(SpreadsheetAuditError, match="RESOURCE_LIMIT"):
            audit_workbook(_workbook())
    else:
        assert len(audit_workbook(_workbook()).findings) == finding_count


def test_audit_streams_xml_members_through_a_bounded_reader(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def reject_unbounded_read(*_args: object, **_kwargs: object) -> bytes:
        raise AssertionError("ZipFile.read must not decompress untrusted XML without a bound")

    monkeypatch.setattr(zipfile.ZipFile, "read", reject_unbounded_read)

    result = audit_workbook(_workbook())

    assert result.sheets[0].name == "Inventory"


def test_manifest_adds_opaque_identities_without_source_values() -> None:
    result = audit_workbook(_workbook())
    manifest = build_spreadsheet_audit_manifest(
        result,
        audit_id="55555555-5555-4555-8555-555555555555",
        artifact_version_id="66666666-6666-4666-8666-666666666666",
        tenant_scope={
            "scopeType": "workspace",
            "organizationId": "22222222-2222-4222-8222-222222222222",
            "workspaceId": "33333333-3333-4333-8333-333333333333",
        },
        processor_version="spreadsheet-auditor-0.1.0",
        created_at="2026-08-04T00:00:00.000Z",
        sheet_ids={"Inventory": "77777777-7777-4777-8777-777777777777"},
        finding_ids={("Inventory", "C1"): "88888888-8888-4888-8888-888888888888"},
    )
    encoded = manifest.model_dump_json()
    assert "SUM(B1:D1)" not in encoded
    assert "A1" not in encoded
    assert manifest.findings[0].sheetId == "77777777-7777-4777-8777-777777777777"


def test_manifest_requires_complete_server_identity_mappings() -> None:
    with pytest.raises(ValueError, match="SHEET_ID_MAPPING_INCOMPLETE"):
        build_spreadsheet_audit_manifest(
            audit_workbook(_workbook()),
            audit_id="55555555-5555-4555-8555-555555555555",
            artifact_version_id="66666666-6666-4666-8666-666666666666",
            tenant_scope={
                "scopeType": "workspace",
                "organizationId": "22222222-2222-4222-8222-222222222222",
                "workspaceId": "33333333-3333-4333-8333-333333333333",
            },
            processor_version="spreadsheet-auditor-0.1.0",
            created_at="2026-08-04T00:00:00.000Z",
            sheet_ids={},
            finding_ids={},
        )
