"""DDA-002: bounded CSV/XLSX intake inspection (no macros/external execution)."""

from __future__ import annotations

import hashlib
import zipfile
from io import BytesIO
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr


class DdaEtlIntakeError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class IntakeLimits(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    maxBytes: StrictInt = Field(ge=1)
    maxRows: StrictInt = Field(ge=1)
    maxColumns: StrictInt = Field(ge=1)
    maxSheets: StrictInt = Field(ge=1)
    maxFormulas: StrictInt = Field(ge=1)


class IntakeCsvProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    encodings: tuple[StrictStr, ...]
    dialects: tuple[StrictStr, ...]


class IntakeXlsxProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    macrosAllowed: StrictBool
    externalLinksAllowed: StrictBool


class IntakeProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    profileId: Literal["dda.web.tabular.v1"]
    csv: IntakeCsvProfile
    xlsx: IntakeXlsxProfile
    limits: IntakeLimits


class IntakeInspectionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    profileId: Literal["dda.web.tabular.v1"]
    kind: Literal["CSV", "XLSX"]
    contentHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    byteSize: StrictInt = Field(ge=0)


def published_intake_profile() -> IntakeProfile:
    return IntakeProfile(
        profileId="dda.web.tabular.v1",
        csv=IntakeCsvProfile(
            encodings=("utf-8", "utf-8-sig", "windows-1258"),
            dialects=("excel", "excel-tab", "unix"),
        ),
        xlsx=IntakeXlsxProfile(macrosAllowed=False, externalLinksAllowed=False),
        limits=IntakeLimits(
            maxBytes=100 * 1024 * 1024,
            maxRows=1_000_000,
            maxColumns=256,
            maxSheets=8,
            maxFormulas=500,
        ),
    )


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _inspect_csv(content: bytes, declared_encoding: str | None, profile: IntakeProfile) -> None:
    if len(content) >= 2 and content[0:2] == b"MZ":
        raise DdaEtlIntakeError("DDA_INTAKE_RENAMED_EXECUTABLE")
    if len(content) > profile.limits.maxBytes:
        raise DdaEtlIntakeError("DDA_INTAKE_LIMIT_SIZE")
    encoding = (declared_encoding or "utf-8").lower()
    if encoding not in profile.csv.encodings:
        raise DdaEtlIntakeError("DDA_INTAKE_UNSUPPORTED_PROFILE")
    if encoding in {"utf-8", "utf-8-sig"}:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as error:
            raise DdaEtlIntakeError("DDA_INTAKE_MALFORMED_ENCODING") from error
    else:
        if len(content) >= 2 and content[0:2] in {b"\xff\xfe", b"\xfe\xff"}:
            raise DdaEtlIntakeError("DDA_INTAKE_MALFORMED_ENCODING")
        text = content.decode("latin-1")
    lines = [
        line for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if line != ""
    ]
    if not lines:
        raise DdaEtlIntakeError("DDA_INTAKE_UNSUPPORTED_PROFILE")
    columns = len(lines[0].split(","))
    if columns > profile.limits.maxColumns:
        raise DdaEtlIntakeError("DDA_INTAKE_LIMIT_COLUMNS")
    if max(0, len(lines) - 1) > profile.limits.maxRows:
        raise DdaEtlIntakeError("DDA_INTAKE_LIMIT_ROWS")


def _inspect_xlsx(content: bytes, profile: IntakeProfile) -> None:
    if len(content) > profile.limits.maxBytes:
        raise DdaEtlIntakeError("DDA_INTAKE_LIMIT_SIZE")
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            infos = archive.infolist()
            total_uncompressed = sum(info.file_size for info in infos)
            if total_uncompressed > profile.limits.maxBytes * 8:
                raise DdaEtlIntakeError("DDA_INTAKE_ZIP_BOMB")
            for info in infos:
                if info.compress_size > 0 and info.file_size / info.compress_size > 40:
                    raise DdaEtlIntakeError("DDA_INTAKE_ZIP_BOMB")
                name = info.filename.lower()
                if "vbaproject.bin" in name:
                    raise DdaEtlIntakeError("DDA_INTAKE_MACRO_ENABLED")
                if "externallinks/" in name:
                    raise DdaEtlIntakeError("DDA_INTAKE_EXTERNAL_LINK")
            sheets = [info for info in infos if "/worksheets/sheet" in info.filename.lower()]
            if len(sheets) > profile.limits.maxSheets:
                raise DdaEtlIntakeError("DDA_INTAKE_LIMIT_SHEETS")
            formula_count = 0
            for sheet in sheets:
                xml = archive.read(sheet.filename).decode("utf-8", errors="replace")
                formula_count += xml.count("<f>") + xml.count("<f ")
            if formula_count > profile.limits.maxFormulas:
                raise DdaEtlIntakeError("DDA_INTAKE_FORMULA_LIMIT")
    except DdaEtlIntakeError:
        raise
    except zipfile.BadZipFile as error:
        raise DdaEtlIntakeError("DDA_INTAKE_UNSUPPORTED_PROFILE") from error


def inspect_tabular_bytes(
    *,
    file_name: str,
    claimed_media_type: str,
    expected_sha256: str,
    content: bytes,
    declared_encoding: str | None = None,
) -> IntakeInspectionResult:
    profile = published_intake_profile()
    digest = _sha256(content)
    if digest != expected_sha256.lower():
        raise DdaEtlIntakeError("DDA_INTAKE_CHECKSUM_MISMATCH")
    media = claimed_media_type.lower()
    lower_name = file_name.lower()
    if media == "text/csv" or lower_name.endswith(".csv"):
        _inspect_csv(content, declared_encoding, profile)
        kind: Literal["CSV", "XLSX"] = "CSV"
    elif (
        media == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        or lower_name.endswith(".xlsx")
    ):
        _inspect_xlsx(content, profile)
        kind = "XLSX"
    else:
        raise DdaEtlIntakeError("DDA_INTAKE_UNSUPPORTED_PROFILE")
    return IntakeInspectionResult(
        profileId="dda.web.tabular.v1",
        kind=kind,
        contentHash=digest,
        byteSize=len(content),
    )
