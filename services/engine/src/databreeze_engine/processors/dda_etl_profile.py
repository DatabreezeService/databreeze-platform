"""DDA-009/010: separated quality dimensions for ETL profiling (no percentage-correct)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr

QualityDimension = Literal[
    "completeness",
    "validity",
    "uniqueness",
    "consistency",
    "freshness",
    "extraction_confidence",
]


class QualityDimensionReport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    dimension: QualityDimension
    denominator: StrictInt = Field(ge=0)
    coverage: StrictInt = Field(ge=0)
    rule: StrictStr
    expectation: StrictStr
    sampleState: Literal["FULL", "PARTIAL", "NONE"]
    limitations: tuple[StrictStr, ...]
    completeGateEligible: StrictBool


class OverallQualitySummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    formula: StrictStr
    weights: dict[StrictStr, StrictFloat]
    missingDimensionBehavior: StrictStr
    coverage: StrictFloat
    provesFactualCorrectness: Literal[False] = False


class EtlProfileResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    dimensions: tuple[QualityDimensionReport, ...]
    overall: OverallQualitySummary | None = None


def profile_quality(
    *,
    row_count: int,
    non_null_required: int,
    valid_count: int,
    unique_key_count: int,
    expected_unique: int,
    schema_compatible: bool,
    freshness_known: bool,
    extraction_bound: bool,
    rejected_count: int,
) -> EtlProfileResult:
    complete_ok = rejected_count == 0
    dimensions = (
        QualityDimensionReport(
            dimension="completeness",
            denominator=max(row_count, 0),
            coverage=max(non_null_required, 0),
            rule="required_fields_present",
            expectation="all required fields present",
            sampleState="FULL" if row_count > 0 else "NONE",
            limitations=("fixture-backed prototype",),
            completeGateEligible=complete_ok,
        ),
        QualityDimensionReport(
            dimension="validity",
            denominator=max(row_count, 0),
            coverage=max(valid_count, 0),
            rule="typed_parse",
            expectation="values parse under declared locale",
            sampleState="FULL" if row_count > 0 else "NONE",
            limitations=("not factual correctness",),
            completeGateEligible=complete_ok,
        ),
        QualityDimensionReport(
            dimension="uniqueness",
            denominator=max(expected_unique, 0),
            coverage=max(unique_key_count, 0),
            rule="declared_keys",
            expectation="unique keys",
            sampleState="FULL" if expected_unique > 0 else "NONE",
            limitations=(),
            completeGateEligible=complete_ok,
        ),
        QualityDimensionReport(
            dimension="consistency",
            denominator=1,
            coverage=1 if schema_compatible else 0,
            rule="schema_compatibility",
            expectation="compatible",
            sampleState="FULL",
            limitations=(),
            completeGateEligible=complete_ok and schema_compatible,
        ),
        QualityDimensionReport(
            dimension="freshness",
            denominator=1,
            coverage=1 if freshness_known else 0,
            rule="source_binding_known",
            expectation="bound",
            sampleState="FULL",
            limitations=("no wall-clock freshness claim",),
            completeGateEligible=complete_ok and freshness_known,
        ),
        QualityDimensionReport(
            dimension="extraction_confidence",
            denominator=1,
            coverage=1 if extraction_bound else 0,
            rule="deterministic_extraction",
            expectation="bound",
            sampleState="FULL",
            limitations=("AI suggestions are non-authoritative",),
            completeGateEligible=complete_ok and extraction_bound,
        ),
    )
    coverage_scores = [
        (item.coverage / item.denominator) if item.denominator else 0.0 for item in dimensions
    ]
    overall = OverallQualitySummary(
        formula="min(coverage/denominator across dimensions)",
        weights={item.dimension: 1.0 for item in dimensions},
        missingDimensionBehavior="block",
        coverage=min(coverage_scores) if coverage_scores else 0.0,
        provesFactualCorrectness=False,
    )
    return EtlProfileResult(dimensions=dimensions, overall=overall)
