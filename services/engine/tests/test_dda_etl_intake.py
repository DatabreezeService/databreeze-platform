from __future__ import annotations

import hashlib
import io
import zipfile

import pytest

from databreeze_engine.processors.dda_etl_intake import (
    DdaEtlIntakeError,
    inspect_tabular_bytes,
    published_intake_profile,
)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _xlsx(*, macro: bool = False, formulas: int = 0, sheets: int = 1) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        sheet_refs = "".join(
            f'<sheet name="S{i}" sheetId="{i}" r:id="rId{i}"/>' for i in range(1, sheets + 1)
        )
        archive.writestr(
            "xl/workbook.xml",
            (
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                f"<sheets>{sheet_refs}</sheets></workbook>"
            ),
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            (
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + "".join(
                    f'<Relationship Id="rId{i}" Target="worksheets/sheet{i}.xml"/>'
                    for i in range(1, sheets + 1)
                )
                + "</Relationships>"
            ),
        )
        formula_cells = "".join(
            f'<c r="A{i}"><f>SUM(1)</f><v>1</v></c>' for i in range(1, formulas + 1)
        )
        for i in range(1, sheets + 1):
            archive.writestr(
                f"xl/worksheets/sheet{i}.xml",
                (
                    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                    f'<sheetData><row r="1">{formula_cells}<c r="B1"><v>1</v></c></row></sheetData>'
                    "</worksheet>"
                ),
            )
        if macro:
            archive.writestr("xl/vbaProject.bin", b"not executed")
    return output.getvalue()


def test_published_profile_exposes_explicit_v1_limits() -> None:
    profile = published_intake_profile()
    assert profile.profileId == "dda.web.tabular.v1"
    assert profile.limits.maxBytes == 100 * 1024 * 1024
    assert profile.limits.maxRows == 1_000_000
    assert profile.limits.maxColumns == 256
    assert profile.limits.maxSheets == 8
    assert profile.limits.maxFormulas == 500
    assert profile.xlsx.macrosAllowed is False


def test_published_csv_row_ceiling_is_exactly_one_million() -> None:
    maximum = published_intake_profile().limits.maxRows

    assert maximum >= 1_000_000
    assert maximum < 1_000_001


def test_enforces_the_100_mib_size_boundary() -> None:
    maximum = 100 * 1024 * 1024
    for size in (maximum - 1, maximum, maximum + 1):
        content = b"a" * size
        if size > maximum:
            with pytest.raises(DdaEtlIntakeError) as error:
                inspect_tabular_bytes(
                    file_name="large.csv",
                    claimed_media_type="text/csv",
                    expected_sha256=_sha(content),
                    content=content,
                )
            assert error.value.code == "DDA_INTAKE_LIMIT_SIZE"
        else:
            result = inspect_tabular_bytes(
                file_name="large.csv",
                claimed_media_type="text/csv",
                expected_sha256=_sha(content),
                content=content,
            )
            assert result.byteSize == size


def test_rejects_renamed_executable_and_malformed_encoding() -> None:
    with pytest.raises(DdaEtlIntakeError) as renamed:
        inspect_tabular_bytes(
            file_name="sales.csv",
            claimed_media_type="text/csv",
            expected_sha256=_sha(b"MZ\x90\x00payload"),
            content=b"MZ\x90\x00payload",
        )
    assert renamed.value.code == "DDA_INTAKE_RENAMED_EXECUTABLE"

    with pytest.raises(DdaEtlIntakeError) as encoding:
        inspect_tabular_bytes(
            file_name="sales.csv",
            claimed_media_type="text/csv",
            expected_sha256=_sha(b"\xff\xfe\x00A\x00"),
            content=b"\xff\xfe\x00A\x00",
            declared_encoding="utf-8",
        )
    assert encoding.value.code == "DDA_INTAKE_MALFORMED_ENCODING"


def test_rejects_zip_bomb_macro_limits_and_formula_overflow() -> None:
    bomb = io.BytesIO()
    with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/worksheets/sheet1.xml", "A" * 2_000_000)
    with pytest.raises(DdaEtlIntakeError) as zip_bomb:
        inspect_tabular_bytes(
            file_name="bomb.xlsx",
            claimed_media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            expected_sha256=_sha(bomb.getvalue()),
            content=bomb.getvalue(),
        )
    assert zip_bomb.value.code == "DDA_INTAKE_ZIP_BOMB"

    macro = _xlsx(macro=True)
    with pytest.raises(DdaEtlIntakeError) as macro_error:
        inspect_tabular_bytes(
            file_name="macro.xlsx",
            claimed_media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            expected_sha256=_sha(macro),
            content=macro,
        )
    assert macro_error.value.code == "DDA_INTAKE_MACRO_ENABLED"

    sheets = _xlsx(sheets=9)
    with pytest.raises(DdaEtlIntakeError) as sheet_error:
        inspect_tabular_bytes(
            file_name="sheets.xlsx",
            claimed_media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            expected_sha256=_sha(sheets),
            content=sheets,
        )
    assert sheet_error.value.code == "DDA_INTAKE_LIMIT_SHEETS"

    formulas = _xlsx(formulas=501)
    with pytest.raises(DdaEtlIntakeError) as formula_error:
        inspect_tabular_bytes(
            file_name="formulas.xlsx",
            claimed_media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            expected_sha256=_sha(formulas),
            content=formulas,
        )
    assert formula_error.value.code == "DDA_INTAKE_FORMULA_LIMIT"


def test_rejects_checksum_mismatch_and_accepts_valid_csv_xlsx() -> None:
    csv = b"name,amount\nA,1\n"
    with pytest.raises(DdaEtlIntakeError) as mismatch:
        inspect_tabular_bytes(
            file_name="sales.csv",
            claimed_media_type="text/csv",
            expected_sha256="b" * 64,
            content=csv,
        )
    assert mismatch.value.code == "DDA_INTAKE_CHECKSUM_MISMATCH"

    ok_csv = inspect_tabular_bytes(
        file_name="sales.csv",
        claimed_media_type="text/csv",
        expected_sha256=_sha(csv),
        content=csv,
    )
    assert ok_csv.profileId == "dda.web.tabular.v1"
    assert ok_csv.kind == "CSV"
    assert "A" not in ok_csv.model_dump_json()

    xlsx = _xlsx()
    ok_xlsx = inspect_tabular_bytes(
        file_name="sales.xlsx",
        claimed_media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        expected_sha256=_sha(xlsx),
        content=xlsx,
    )
    assert ok_xlsx.kind == "XLSX"
