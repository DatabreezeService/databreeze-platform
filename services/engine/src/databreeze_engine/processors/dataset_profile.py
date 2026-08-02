"""Deterministic, content-free dataset profiling primitives (DSM-011, DSM-015)."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

ValueState = Literal["MISSING", "NULL", "BLANK", "INVALID", "ZERO", "NOT_APPLICABLE", "REDACTED", "VALUE"]
StateCounts = dict[ValueState, StrictInt]


class ProfileFieldSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    field: StrictStr
    stateCounts: StateCounts
    distinctCount: StrictInt = Field(ge=0)
    valueFingerprint: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")


class DatasetProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    rowCountScanned: StrictInt = Field(ge=0)
    sourceRowCount: StrictInt = Field(ge=0)
    sampled: StrictBool
    sampleMethod: Literal["HEAD"]
    sampleSeed: StrictInt = Field(ge=0)
    fields: tuple[ProfileFieldSummary, ...]


def _empty_counts() -> StateCounts:
    return {
        "MISSING": 0,
        "NULL": 0,
        "BLANK": 0,
        "INVALID": 0,
        "ZERO": 0,
        "NOT_APPLICABLE": 0,
        "REDACTED": 0,
        "VALUE": 0,
    }


def _classify(value: object) -> ValueState:
    if value is None:
        return "NULL"
    if isinstance(value, str):
        normalized = value.strip()
        if normalized == "":
            return "BLANK"
        if normalized.upper() in {"N/A", "NA", "NOT APPLICABLE"}:
            return "NOT_APPLICABLE"
        if normalized.upper() in {"[REDACTED]", "REDACTED"}:
            return "REDACTED"
        return "VALUE"
    if isinstance(value, bool):
        return "VALUE"
    if isinstance(value, (int, float)):
        return "ZERO" if value == 0 else "VALUE"
    return "INVALID"


def _fingerprint(values: Sequence[object]) -> str:
    digests: list[str] = []
    for value in values:
        try:
            encoded = json.dumps(
                value,
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
        except (TypeError, ValueError):
            encoded = repr(type(value)).encode("ascii")
        digests.append(hashlib.sha256(encoded).hexdigest())
    canonical = "|".join(sorted(set(digests))).encode("ascii")
    return hashlib.sha256(canonical).hexdigest()


def profile_records(
    rows: Sequence[Mapping[str, object]],
    fields: Sequence[str],
    *,
    max_rows: int = 100_000,
    sample_seed: int = 0,
) -> DatasetProfile:
    """Profile bounded rows without returning source values or row samples."""
    if not fields or len(set(fields)) != len(fields):
        raise ValueError("fields must be unique and non-empty")
    if max_rows < 1 or sample_seed < 0:
        raise ValueError("profile bounds are invalid")
    if any(not field or len(field) > 128 for field in fields):
        raise ValueError("field names are invalid")
    selected = rows[:max_rows]
    summaries: list[ProfileFieldSummary] = []
    for field in fields:
        counts = _empty_counts()
        values: list[object] = []
        for row in selected:
            if field not in row:
                counts["MISSING"] += 1
                continue
            value = row[field]
            state = _classify(value)
            counts[state] += 1
            if state in {"VALUE", "ZERO"}:
                values.append(value)
        summaries.append(
            ProfileFieldSummary(
                field=field,
                stateCounts=counts,
                distinctCount=len({_fingerprint([value]) for value in values}),
                valueFingerprint=_fingerprint(values),
            )
        )
    return DatasetProfile(
        rowCountScanned=len(selected),
        sourceRowCount=len(rows),
        sampled=len(selected) < len(rows),
        sampleMethod="HEAD",
        sampleSeed=sample_seed,
        fields=tuple(summaries),
    )
