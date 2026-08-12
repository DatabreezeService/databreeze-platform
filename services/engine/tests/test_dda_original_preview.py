from __future__ import annotations

import pytest

from databreeze_engine.processors.dda_original_preview import (
    DdaOriginalPreviewError,
    preview_original,
)


def test_csv_preview_preserves_formula_text_and_bounds() -> None:
    result = preview_original(
        source_type="CSV",
        payload={
            "encoding": "utf-8",
            "delimiter": ",",
            "rows": [
                ["name", "amount"],
                ["=CMD|calc", "10"],
                ["ok", "11"],
            ],
            "rowWindow": {"start": 0, "limit": 2},
            "columnWindow": {"start": 0, "limit": 2},
        },
    )
    assert result.kind == "CSV_SAFE_GRID"
    assert result.encoding == "utf-8"
    assert result.delimiter == ","
    assert any(cell.rawText == "=CMD|calc" for cell in result.cells)
    assert all(cell.executed is False for cell in result.cells)
    assert result.rowCount == 2


def test_xlsx_preview_never_executes_macros_or_external_links() -> None:
    result = preview_original(
        source_type="XLSX",
        payload={
            "worksheets": ["Sheet1"],
            "cells": [
                {
                    "sheet": "Sheet1",
                    "row": 1,
                    "column": 1,
                    "displayValue": "2",
                    "formulaText": "=A1+1",
                }
            ],
            "hasMacros": True,
            "hasExternalLinks": True,
            "mergedCells": [{"sheet": "Sheet1", "range": "A1:B1"}],
            "rowWindow": {"start": 0, "limit": 50},
            "columnWindow": {"start": 0, "limit": 20},
        },
    )
    assert result.kind == "XLSX_SAFE_GRID"
    assert result.executedMacros is False
    assert result.followedExternalLinks is False
    assert result.cells[0].formulaText == "=A1+1"
    assert result.cells[0].displayValue == "2"


def test_password_protected_and_active_content_are_rejected() -> None:
    with pytest.raises(DdaOriginalPreviewError) as error:
        preview_original(
            source_type="XLSX",
            payload={"passwordProtected": True, "worksheets": ["Sheet1"], "cells": []},
        )
    assert error.value.code == "DDA_ORIGINAL_PASSWORD_PROTECTED"


def test_evidence_coordinates_are_clipped_to_page_bounds() -> None:
    result = preview_original(
        source_type="IMAGE",
        payload={
            "pageCount": 1,
            "pageWidth": 100,
            "pageHeight": 100,
            "evidenceOverlay": {"page": 1, "x": -5, "y": 90, "width": 50, "height": 50},
        },
    )
    assert result.kind == "IMAGE"
    assert result.evidenceOverlay == {
        "page": 1,
        "x": 0,
        "y": 90,
        "width": 50,
        "height": 10,
    }
