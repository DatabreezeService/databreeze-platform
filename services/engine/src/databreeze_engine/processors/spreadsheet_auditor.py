"""Safe deterministic workbook inventory and formula-family auditing (SA-001..SA-004)."""

from __future__ import annotations

import hashlib
import io
import posixpath
import re
import zipfile
from collections import Counter
from collections.abc import Iterator
from typing import Literal
from xml.etree import ElementTree as Xml

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

_SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
_DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_CELL_REFERENCE = re.compile(r"^(?P<column>[A-Z]{1,3})(?P<row>[1-9][0-9]*)$", re.IGNORECASE)
_FORMULA_REFERENCE = re.compile(r"\$?[A-Z]{1,3}\$?[1-9][0-9]*", re.IGNORECASE)
_FORMULA_SPACE = re.compile(r"\s+")
_MAX_MEMBERS = 2_048
_MAX_XML_BYTES = 64 * 1024 * 1024
_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024
_MAX_CELLS = 1_000_000


class SpreadsheetSheetSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    name: StrictStr = Field(min_length=1, max_length=128)
    maxRow: StrictInt = Field(ge=0)
    maxColumn: StrictInt = Field(ge=0)
    formulaCount: StrictInt = Field(ge=0)


class SpreadsheetFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    sheet: StrictStr = Field(min_length=1, max_length=128)
    address: StrictStr = Field(pattern=r"^[A-Z]{1,3}[1-9][0-9]*$")
    kind: Literal["FORMULA_FAMILY_OUTLIER", "FORMULA_GAP"]
    formulaFingerprint: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")


class SpreadsheetAuditResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    workbookSha256: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    sheets: tuple[SpreadsheetSheetSummary, ...]
    findings: tuple[SpreadsheetFinding, ...]
    blockedReasons: tuple[Literal["MACRO", "EXTERNAL_LINK", "UNSUPPORTED_XML"], ...]


class SpreadsheetAuditError(ValueError):
    """Stable parser failure without exposing workbook content."""

    def __init__(self, code: Literal["INVALID_ARCHIVE", "RESOURCE_LIMIT", "MALFORMED_XML"]) -> None:
        super().__init__(code)
        self.code = code


def _safe_member(name: str) -> bool:
    if not name or name.startswith("/") or "\\" in name:
        return False
    normalized = posixpath.normpath(name)
    return normalized == name and normalized != "." and not normalized.startswith("../")


def _xml(data: bytes) -> Xml.Element:
    if len(data) > _MAX_XML_BYTES:
        raise SpreadsheetAuditError("RESOURCE_LIMIT")
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise SpreadsheetAuditError("MALFORMED_XML")
    try:
        return Xml.fromstring(data)
    except (Xml.ParseError, ValueError):
        raise SpreadsheetAuditError("MALFORMED_XML") from None


def _column_number(column: str) -> int:
    value = 0
    for character in column.upper():
        value = value * 26 + ord(character) - 64
    return value


def _cell_address(reference: str) -> tuple[int, int] | None:
    match = _CELL_REFERENCE.fullmatch(reference)
    if match is None:
        return None
    return _column_number(match.group("column")), int(match.group("row"))


def _normalized_formula(value: str) -> str:
    normalized = _FORMULA_SPACE.sub(" ", value.strip().upper())
    return _FORMULA_REFERENCE.sub("#CELL", normalized)


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _relationships(root: Xml.Element) -> dict[str, str]:
    result: dict[str, str] = {}
    for relation in root.findall(f"{{{_REL_NS}}}Relationship"):
        relation_id = relation.attrib.get("Id")
        target = relation.attrib.get("Target")
        if relation_id is None or target is None:
            continue
        result[relation_id] = target
    return result


def _sheet_targets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = _xml(archive.read("xl/workbook.xml"))
    relationships = _relationships(_xml(archive.read("xl/_rels/workbook.xml.rels")))
    sheets: list[tuple[str, str]] = []
    for sheet in workbook.findall(f"{{{_SHEET_NS}}}sheets/{{{_SHEET_NS}}}sheet"):
        name = sheet.attrib.get("name")
        relation_id = sheet.attrib.get(f"{{{_DOC_REL_NS}}}id")
        if name is None or relation_id is None:
            raise SpreadsheetAuditError("MALFORMED_XML")
        target = relationships.get(relation_id)
        if target is None:
            raise SpreadsheetAuditError("MALFORMED_XML")
        target_path = posixpath.normpath(posixpath.join("xl", target))
        if not target_path.startswith("xl/") or not _safe_member(target_path):
            raise SpreadsheetAuditError("INVALID_ARCHIVE")
        sheets.append((name, target_path))
    return sheets


def _iter_cells(root: Xml.Element) -> Iterator[tuple[str, str | None]]:
    for cell in root.iter(f"{{{_SHEET_NS}}}c"):
        reference = cell.attrib.get("r")
        if reference is None:
            continue
        formula = cell.find(f"{{{_SHEET_NS}}}f")
        yield reference, None if formula is None else "".join(formula.itertext())


def audit_workbook(
    content: bytes,
    *,
    max_uncompressed_bytes: int = _MAX_UNCOMPRESSED_BYTES,
    max_cells: int = _MAX_CELLS,
) -> SpreadsheetAuditResult:
    """Inventory a workbook and report formula-family anomalies without returning values."""
    if not isinstance(content, bytes) or not content:
        raise SpreadsheetAuditError("INVALID_ARCHIVE")
    if max_uncompressed_bytes < 1 or max_cells < 1:
        raise SpreadsheetAuditError("RESOURCE_LIMIT")
    workbook_sha256 = hashlib.sha256(content).hexdigest()
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except (OSError, zipfile.BadZipFile):
        raise SpreadsheetAuditError("INVALID_ARCHIVE") from None
    with archive:
        infos = archive.infolist()
        if len(infos) > _MAX_MEMBERS:
            raise SpreadsheetAuditError("RESOURCE_LIMIT")
        total_size = 0
        names: set[str] = set()
        blocked: set[Literal["MACRO", "EXTERNAL_LINK", "UNSUPPORTED_XML"]] = set()
        for info in infos:
            if not _safe_member(info.filename) or info.filename in names:
                raise SpreadsheetAuditError("INVALID_ARCHIVE")
            names.add(info.filename)
            total_size += info.file_size
            if total_size > max_uncompressed_bytes:
                raise SpreadsheetAuditError("RESOURCE_LIMIT")
            if info.filename.lower().endswith("vbaproject.bin"):
                blocked.add("MACRO")
            if info.filename.lower().startswith("xl/externallinks/"):
                blocked.add("EXTERNAL_LINK")
        if "xl/workbook.xml" not in names or "xl/_rels/workbook.xml.rels" not in names:
            raise SpreadsheetAuditError("INVALID_ARCHIVE")
        try:
            targets = _sheet_targets(archive)
        except KeyError:
            raise SpreadsheetAuditError("MALFORMED_XML") from None
        summaries: list[SpreadsheetSheetSummary] = []
        findings: list[SpreadsheetFinding] = []
        total_cells = 0
        for sheet_name, target in targets:
            if target not in names:
                raise SpreadsheetAuditError("INVALID_ARCHIVE")
            root = _xml(archive.read(target))
            max_row = 0
            max_column = 0
            formulas: list[tuple[str, str]] = []
            for address, formula in _iter_cells(root):
                total_cells += 1
                if total_cells > max_cells:
                    raise SpreadsheetAuditError("RESOURCE_LIMIT")
                coordinates = _cell_address(address)
                if coordinates is None:
                    blocked.add("UNSUPPORTED_XML")
                    continue
                column, row = coordinates
                max_column = max(max_column, column)
                max_row = max(max_row, row)
                if formula is not None:
                    formulas.append((address.upper(), formula))
            families = Counter(_normalized_formula(formula) for _, formula in formulas)
            for address, formula in formulas:
                family = _normalized_formula(formula)
                if families[family] == 1 and len(formulas) >= 3:
                    findings.append(
                        SpreadsheetFinding(
                            sheet=sheet_name,
                            address=address,
                            kind="FORMULA_FAMILY_OUTLIER",
                            formulaFingerprint=_fingerprint(family),
                        )
                    )
            summaries.append(
                SpreadsheetSheetSummary(
                    name=sheet_name,
                    maxRow=max_row,
                    maxColumn=max_column,
                    formulaCount=len(formulas),
                )
            )
        return SpreadsheetAuditResult(
            workbookSha256=workbook_sha256,
            sheets=tuple(summaries),
            findings=tuple(findings),
            blockedReasons=tuple(sorted(blocked)),
        )
