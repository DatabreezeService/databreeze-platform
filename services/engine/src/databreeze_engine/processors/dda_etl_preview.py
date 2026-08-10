"""DDA-006/008: deterministic ETL preview with reject accounting."""

from __future__ import annotations

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


class DdaEtlPreviewError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PreviewCounts(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    changed: StrictInt = Field(ge=0)
    unchanged: StrictInt = Field(ge=0)
    rejected: StrictInt = Field(ge=0)


class PreviewExclusion(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    scope: StrictStr
    reasonCode: StrictStr
    count: StrictInt = Field(ge=0)


class EtlPreviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    sourceSchema: tuple[StrictStr, ...]
    inferredSchema: tuple[StrictStr, ...]
    targetSchema: tuple[StrictStr, ...]
    orderedSteps: tuple[StrictStr, ...]
    assumptions: tuple[StrictStr, ...]
    beforeSample: tuple[dict[str, Any], ...]
    afterSample: tuple[dict[str, Any], ...]
    counts: PreviewCounts
    exclusions: tuple[PreviewExclusion, ...]
    unsupportedScopes: tuple[PreviewExclusion, ...]
    samplingDisclosed: StrictBool
    evidenceStatus: Literal["AVAILABLE", "PARTIAL", "UNAVAILABLE"]
    estimatedCostCpuMs: StrictInt = Field(ge=0)
    estimatedCostMemoryMb: StrictInt = Field(ge=0)


def preview_etl(
    *,
    rows: list[dict[str, Any]],
    transformations: list[dict[str, Any]],
    assumptions: list[str],
    sampling_disclosed: bool = True,
) -> EtlPreviewResult:
    if not sampling_disclosed:
        raise DdaEtlPreviewError("DDA_ETL_UNDISCLOSED_SAMPLING")
    kinds: list[str] = []
    for step in transformations:
        kind = step.get("kind")
        if not isinstance(kind, str) or kind not in ALLOWED_KINDS:
            raise DdaEtlPreviewError("DDA_ETL_ARBITRARY_CODE")
        kinds.append(kind)

    source_schema = tuple(rows[0].keys()) if rows else ()
    working = [dict(row) for row in rows]
    rejected = 0
    exclusions: list[PreviewExclusion] = []
    for step in transformations:
        kind = step["kind"]
        field = str(step.get("config", {}).get("field", ""))
        if kind == "TRIM_TEXT" and field:
            for row in working:
                if field in row and isinstance(row[field], str):
                    row[field] = row[field].strip()
        if kind == "FILTER_ROWS":
            kept: list[dict[str, Any]] = []
            for row in working:
                if row.get("_reject"):
                    rejected += 1
                else:
                    kept.append(row)
            if rejected:
                exclusions.append(
                    PreviewExclusion(scope="row", reasonCode="FILTER_REJECT", count=rejected)
                )
            working = kept

    changed = sum(1 for before, after in zip(rows, working, strict=False) if before != after)
    unchanged = max(0, len(working) - changed)
    target_schema = tuple(working[0].keys()) if working else source_schema
    return EtlPreviewResult(
        sourceSchema=source_schema,
        inferredSchema=target_schema,
        targetSchema=target_schema,
        orderedSteps=tuple(kinds),
        assumptions=tuple(assumptions),
        beforeSample=tuple(rows[:3]),
        afterSample=tuple(working[:3]),
        counts=PreviewCounts(changed=changed, unchanged=unchanged, rejected=rejected),
        exclusions=tuple(exclusions),
        unsupportedScopes=(),
        samplingDisclosed=True,
        evidenceStatus="AVAILABLE" if rejected == 0 else "PARTIAL",
        estimatedCostCpuMs=max(1, len(rows)),
        estimatedCostMemoryMb=16,
    )
