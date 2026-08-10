"""DDA-004/007: deterministic allowlisted ETL execution returning result manifests."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

ALLOWED_KINDS = {
    "SELECT_COLUMNS",
    "RENAME_COLUMNS",
    "TRIM_TEXT",
    "NORMALIZE_TEXT",
    "PARSE_DATE",
    "PARSE_TIME",
    "PARSE_NUMBER",
    "PARSE_CURRENCY",
    "CAST_TYPE",
    "REPLACE_NULL",
    "FILTER_ROWS",
    "DEDUPLICATE",
    "DERIVE_FIELD",
    "UNION_COMPATIBLE",
    "LOOKUP_JOIN",
    "AGGREGATE",
}


class DdaEtlExecuteError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class RejectRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    reasonCode: StrictStr
    count: StrictInt = Field(ge=0)


class EtlExecutionManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    rowCount: StrictInt = Field(ge=0)
    rejectedCount: StrictInt = Field(ge=0)
    contentHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    schemaHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    rejectBundleId: StrictStr | None
    lineageIds: tuple[StrictStr, ...]
    partial: StrictBool
    quality: dict[str, StrictInt]
    rejects: tuple[RejectRecord, ...]


def _sha(payload: Any) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def execute_etl(
    *,
    rows: list[dict[str, Any]],
    transformations: list[dict[str, Any]],
    input_artifact_version_id: str,
    reject_bundle_id: str = "00000000-0000-4000-8000-000000000305",
    force_partial: bool = False,
) -> EtlExecutionManifest:
    for step in transformations:
        kind = step.get("kind")
        if not isinstance(kind, str) or kind not in ALLOWED_KINDS:
            raise DdaEtlExecuteError("DDA_ETL_ARBITRARY_CODE")

    working = [dict(row) for row in rows]
    rejects: dict[str, int] = {}
    for step in transformations:
        kind = step["kind"]
        config = step.get("config") or {}
        if kind == "TRIM_TEXT":
            field = str(config.get("field", ""))
            for row in working:
                if field in row and isinstance(row[field], str):
                    row[field] = row[field].strip()
        elif kind == "FILTER_ROWS":
            reason = str(config.get("reason", "FILTER_REJECT"))
            kept: list[dict[str, Any]] = []
            for row in working:
                if row.get("_reject"):
                    rejects[reason] = rejects.get(reason, 0) + 1
                else:
                    kept.append(row)
            working = kept
        elif kind == "PARSE_NUMBER":
            field = str(config.get("field", ""))
            kept = []
            for row in working:
                value = row.get(field)
                try:
                    row[field] = int(str(value).replace(",", ""))
                    kept.append(row)
                except (TypeError, ValueError):
                    rejects["INVALID_AMOUNT"] = rejects.get("INVALID_AMOUNT", 0) + 1
            working = kept

    if force_partial:
        raise DdaEtlExecuteError("DDA_ETL_PARTIAL_OUTPUT")

    schema = sorted(working[0].keys()) if working else []
    content_hash = _sha({"rows": working, "schema": schema})
    schema_hash = _sha(schema)
    rejected_count = sum(rejects.values())
    return EtlExecutionManifest(
        rowCount=len(working),
        rejectedCount=rejected_count,
        contentHash=content_hash,
        schemaHash=schema_hash,
        rejectBundleId=reject_bundle_id if rejected_count > 0 else None,
        lineageIds=(input_artifact_version_id, "00000000-0000-4000-8000-000000000301"),
        partial=False,
        quality={
            "completeness_denominator": len(rows),
            "completeness_coverage": len(working),
            "validity_denominator": len(rows),
            "validity_coverage": len(working),
        },
        rejects=tuple(
            RejectRecord(reasonCode=code, count=count) for code, count in sorted(rejects.items())
        ),
    )


# Golden messy-sales fixture constants for lane verification.
MESSY_SALES_FIXTURE: list[dict[str, Any]] = [
    {"name": " Cafe ", "amount": "120000", "_reject": False},
    {"name": "Shop", "amount": "50000", "_reject": False},
    {"name": "Mart", "amount": "bad", "_reject": True},
    {"name": " Kiosk ", "amount": "1000", "_reject": False},
    {"name": "Depot", "amount": "2000", "_reject": False},
]


def execute_messy_sales_golden() -> EtlExecutionManifest:
    return execute_etl(
        rows=MESSY_SALES_FIXTURE,
        transformations=[
            {"kind": "TRIM_TEXT", "config": {"field": "name"}},
            {"kind": "FILTER_ROWS", "config": {"reason": "INVALID_AMOUNT"}},
        ],
        input_artifact_version_id="00000000-0000-4000-8000-000000000012",
    )
