"""DDA-052: bounded deterministic original preview without macro or formula execution."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr


class DdaOriginalPreviewError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PreviewCell(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    sheet: StrictStr | None = None
    row: StrictInt = Field(ge=0)
    column: StrictInt = Field(ge=0)
    displayValue: StrictStr | None = None
    formulaText: StrictStr | None = None
    rawText: StrictStr | None = None
    executed: Literal[False] = False


class EvidenceOverlay(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    page: StrictInt = Field(ge=1)
    x: StrictInt = Field(ge=0)
    y: StrictInt = Field(ge=0)
    width: StrictInt = Field(ge=0)
    height: StrictInt = Field(ge=0)


class OriginalPreviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    kind: StrictStr
    encoding: StrictStr | None = None
    delimiter: StrictStr | None = None
    worksheets: tuple[StrictStr, ...] | None = None
    cells: tuple[PreviewCell, ...] = ()
    executedMacros: StrictBool | None = None
    followedExternalLinks: StrictBool | None = None
    mergedCells: tuple[dict[str, StrictStr], ...] | None = None
    evidenceOverlay: dict[str, StrictInt] | None = None
    rowCount: StrictInt | None = None


def _window(payload: dict[str, Any], key: str, default_limit: int) -> tuple[int, int]:
    raw = payload.get(key, {})
    if not isinstance(raw, dict):
        return 0, default_limit
    start = raw.get("start", 0)
    limit = raw.get("limit", default_limit)
    if not isinstance(start, int) or not isinstance(limit, int) or start < 0 or limit < 1:
        raise DdaOriginalPreviewError("DDA_ORIGINAL_INVALID_WINDOW")
    return start, min(limit, default_limit)


def _clip_evidence(
    overlay: dict[str, Any],
    *,
    page_count: int,
    page_width: int,
    page_height: int,
) -> dict[str, int]:
    page = int(overlay.get("page", 1))
    if page < 1 or page > page_count:
        raise DdaOriginalPreviewError("DDA_ORIGINAL_EVIDENCE_OUT_OF_BOUNDS")
    x = max(0, int(overlay.get("x", 0)))
    y = max(0, int(overlay.get("y", 0)))
    width = max(0, int(overlay.get("width", 0)))
    height = max(0, int(overlay.get("height", 0)))
    if x > page_width:
        x = page_width
    if y > page_height:
        y = page_height
    width = min(width, page_width - x)
    height = min(height, page_height - y)
    return {"page": page, "x": x, "y": y, "width": width, "height": height}


def preview_original(*, source_type: str, payload: dict[str, Any]) -> OriginalPreviewResult:
    if payload.get("passwordProtected") is True:
        raise DdaOriginalPreviewError("DDA_ORIGINAL_PASSWORD_PROTECTED")

    if source_type == "CSV":
        rows = payload.get("rows")
        if not isinstance(rows, list):
            raise DdaOriginalPreviewError("DDA_ORIGINAL_UNSUPPORTED")
        row_start, row_limit = _window(payload, "rowWindow", 100)
        col_start, col_limit = _window(payload, "columnWindow", 50)
        window_rows = rows[row_start : row_start + row_limit]
        cells: list[PreviewCell] = []
        for row_index, row in enumerate(window_rows):
            if not isinstance(row, list):
                continue
            for column_index, value in enumerate(row[col_start : col_start + col_limit]):
                cells.append(
                    PreviewCell(
                        row=row_start + row_index,
                        column=col_start + column_index,
                        rawText=str(value),
                        executed=False,
                    )
                )
        return OriginalPreviewResult(
            kind="CSV_SAFE_GRID",
            encoding=str(payload.get("encoding", "utf-8")),
            delimiter=str(payload.get("delimiter", ",")),
            cells=tuple(cells),
            rowCount=len(window_rows),
        )

    if source_type == "XLSX":
        worksheets = payload.get("worksheets")
        if not isinstance(worksheets, list) or not all(isinstance(item, str) for item in worksheets):
            raise DdaOriginalPreviewError("DDA_ORIGINAL_UNSUPPORTED")
        raw_cells = payload.get("cells", [])
        if not isinstance(raw_cells, list):
            raise DdaOriginalPreviewError("DDA_ORIGINAL_UNSUPPORTED")
        cells = []
        for item in raw_cells:
            if not isinstance(item, dict):
                continue
            cells.append(
                PreviewCell(
                    sheet=str(item.get("sheet", "Sheet1")),
                    row=int(item.get("row", 0)),
                    column=int(item.get("column", 0)),
                    displayValue=None if item.get("displayValue") is None else str(item["displayValue"]),
                    formulaText=None if item.get("formulaText") is None else str(item["formulaText"]),
                    executed=False,
                )
            )
        merged = payload.get("mergedCells", [])
        merged_cells = tuple(
            {"sheet": str(item["sheet"]), "range": str(item["range"])}
            for item in merged
            if isinstance(item, dict) and "sheet" in item and "range" in item
        )
        return OriginalPreviewResult(
            kind="XLSX_SAFE_GRID",
            worksheets=tuple(worksheets),
            cells=tuple(cells),
            executedMacros=False,
            followedExternalLinks=False,
            mergedCells=merged_cells,
        )

    if source_type in {"IMAGE", "PDF"}:
        page_count = int(payload.get("pageCount", 1))
        page_width = int(payload.get("pageWidth", 100))
        page_height = int(payload.get("pageHeight", 100))
        overlay = payload.get("evidenceOverlay")
        clipped = (
            _clip_evidence(
                overlay,
                page_count=page_count,
                page_width=page_width,
                page_height=page_height,
            )
            if isinstance(overlay, dict)
            else None
        )
        return OriginalPreviewResult(kind=source_type, evidenceOverlay=clipped)

    raise DdaOriginalPreviewError("DDA_ORIGINAL_UNSUPPORTED")
