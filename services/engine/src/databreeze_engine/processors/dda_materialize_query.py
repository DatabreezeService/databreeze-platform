"""Deterministic DDA materialization query processor (DDA-031).

Computes a content-free result-manifest identity from authorized input selector
hashes. Event payload values are never accepted as authority.
"""

from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StrictBool, StrictStr

RecomputeMode = Literal["INCREMENTAL", "FULL"]
StarterFreshnessState = Literal["FRESH", "STALE", "SOURCE_UNAVAILABLE", "BLOCKED"]
AllowedStarterWidget = Literal["KPI", "TABLE", "BAR", "LINE", "AREA", "DONUT", "TEXT_EVIDENCE"]
WidgetResultState = Literal["READY", "EMPTY", "SAMPLED", "TRUNCATED", "STALE"]

_STABLE_IDENTIFIER = r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"


class DdaMaterializeQueryInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    materializationDefinitionId: StrictStr = Field(min_length=1, max_length=128)
    cacheIdentityHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    inputSelectorHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    permissionProjectionVersionId: StrictStr = Field(min_length=1, max_length=128)
    engineVersion: StrictStr = Field(min_length=1, max_length=64)
    adapterVersion: StrictStr = Field(min_length=1, max_length=64)
    recomputeMode: RecomputeMode
    priorResultManifestHash: StrictStr | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    priorStateVerified: StrictBool = False


class DdaMaterializeQueryResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    resultManifestHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    recomputeMode: RecomputeMode
    reason: StrictStr
    complete: StrictBool


class DdaMaterializeQueryError(ValueError):
    def __init__(self, code: Literal["INCOMPLETE_CACHE_IDENTITY", "PRIOR_STATE_REQUIRED"]) -> None:
        super().__init__(code)
        self.code = code


class DdaWidgetMaterializationCellInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    resultCellId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    label: StrictStr = Field(min_length=1, max_length=512)
    numericValue: FiniteFloat
    evidenceRefs: list[StrictStr] = Field(max_length=32)


class DdaWidgetResultProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    resultCellId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    planVersionId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    metricVersionId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    datasetVersionId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    evidenceRefs: list[StrictStr] = Field(max_length=32)


class DdaWidgetMaterializationRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    label: StrictStr = Field(min_length=1, max_length=512)
    displayValue: StrictStr = Field(max_length=8192)
    numericValue: FiniteFloat
    unit: StrictStr = Field(min_length=1, max_length=128)
    provenance: DdaWidgetResultProvenance


class DdaWidgetMaterializationInput(BaseModel):
    """Typed input assembled only after an authorized deterministic calculation."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    widgetId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    planVersionId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    metricVersionId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    datasetVersionId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    unit: StrictStr = Field(min_length=1, max_length=128)
    resultState: WidgetResultState
    maximumRows: int = Field(strict=True, ge=1, le=1000)
    rows: list[DdaWidgetMaterializationCellInput] = Field(max_length=1000)


class DdaWidgetMaterializationResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    widgetId: StrictStr = Field(pattern=_STABLE_IDENTIFIER)
    resultState: WidgetResultState
    rows: list[DdaWidgetMaterializationRow] = Field(max_length=1000)


class DdaWidgetMaterializationError(ValueError):
    def __init__(
        self,
        code: Literal["WIDGET_RESULT_BOUNDS_EXCEEDED", "WIDGET_RESULT_STATE_INVALID"],
    ):
        super().__init__(code)
        self.code = code


def _display_number(value: float, unit: str) -> str:
    normalized = 0.0 if value == 0 else value
    return f"{format(normalized, '.15g')} {unit}"


def materialize_widget_result(
    parameters: DdaWidgetMaterializationInput,
) -> DdaWidgetMaterializationResult:
    """Package bounded deterministic cells; this function never computes or accepts AI values."""

    if len(parameters.rows) > parameters.maximumRows:
        raise DdaWidgetMaterializationError("WIDGET_RESULT_BOUNDS_EXCEEDED")
    if (parameters.resultState == "EMPTY") != (len(parameters.rows) == 0):
        raise DdaWidgetMaterializationError("WIDGET_RESULT_STATE_INVALID")
    rows = [
        DdaWidgetMaterializationRow(
            label=row.label,
            displayValue=_display_number(row.numericValue, parameters.unit),
            numericValue=row.numericValue,
            unit=parameters.unit,
            provenance=DdaWidgetResultProvenance(
                resultCellId=row.resultCellId,
                planVersionId=parameters.planVersionId,
                metricVersionId=parameters.metricVersionId,
                datasetVersionId=parameters.datasetVersionId,
                evidenceRefs=row.evidenceRefs,
            ),
        )
        for row in parameters.rows
    ]
    return DdaWidgetMaterializationResult(
        widgetId=parameters.widgetId,
        resultState=parameters.resultState,
        rows=rows,
    )


class DdaStarterMaterializationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    templateId: StrictStr = Field(min_length=1, max_length=64)
    datasetVersionId: StrictStr = Field(min_length=1, max_length=128)
    policyVersionId: StrictStr = Field(min_length=1, max_length=128)
    widgetTypes: list[StrictStr] = Field(min_length=1)
    engineVersion: StrictStr = Field(min_length=1, max_length=64)
    sourceAvailable: StrictBool = True
    priorResultManifestHash: StrictStr | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class DdaStarterMaterializationResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    resultManifestHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    complete: StrictBool
    aiUsed: StrictBool
    freshnessState: StarterFreshnessState


class DdaStarterMaterializationError(ValueError):
    def __init__(self, code: Literal["UNSUPPORTED_WIDGET", "NO_SAFE_TEMPLATE"]) -> None:
        super().__init__(code)
        self.code = code


def materialize_query(parameters: DdaMaterializeQueryInput) -> DdaMaterializeQueryResult:
    if parameters.recomputeMode == "INCREMENTAL":
        if not parameters.priorStateVerified or parameters.priorResultManifestHash is None:
            raise DdaMaterializeQueryError("PRIOR_STATE_REQUIRED")
        reason = "COMPATIBLE_CHANGE_WITH_PRIOR_STATE"
        seed = {
            "mode": "INCREMENTAL",
            "prior": parameters.priorResultManifestHash,
            "cacheIdentityHash": parameters.cacheIdentityHash,
            "inputSelectorHash": parameters.inputSelectorHash,
            "permissionProjectionVersionId": parameters.permissionProjectionVersionId,
        }
    else:
        reason = "BOUNDED_FULL_RECOMPUTATION"
        seed = {
            "mode": "FULL",
            "cacheIdentityHash": parameters.cacheIdentityHash,
            "inputSelectorHash": parameters.inputSelectorHash,
            "permissionProjectionVersionId": parameters.permissionProjectionVersionId,
            "materializationDefinitionId": parameters.materializationDefinitionId,
            "engineVersion": parameters.engineVersion,
            "adapterVersion": parameters.adapterVersion,
        }

    encoded = json.dumps(
        seed, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return DdaMaterializeQueryResult(
        resultManifestHash=hashlib.sha256(encoded).hexdigest(),
        recomputeMode=parameters.recomputeMode,
        reason=reason,
        complete=True,
    )


def materialize_starter_dashboard(
    parameters: DdaStarterMaterializationInput,
) -> DdaStarterMaterializationResult:
    allowed = {"KPI", "TABLE", "BAR", "LINE", "AREA", "DONUT", "TEXT_EVIDENCE"}
    for widget in parameters.widgetTypes:
        if widget not in allowed:
            raise DdaStarterMaterializationError("UNSUPPORTED_WIDGET")

    if not parameters.sourceAvailable:
        if parameters.priorResultManifestHash is None:
            raise DdaStarterMaterializationError("NO_SAFE_TEMPLATE")
        return DdaStarterMaterializationResult(
            resultManifestHash=parameters.priorResultManifestHash,
            complete=False,
            aiUsed=False,
            freshnessState="SOURCE_UNAVAILABLE",
        )

    seed = {
        "templateId": parameters.templateId,
        "datasetVersionId": parameters.datasetVersionId,
        "policyVersionId": parameters.policyVersionId,
        "widgetTypes": list(parameters.widgetTypes),
        "engineVersion": parameters.engineVersion,
        "aiUsed": False,
    }
    encoded = json.dumps(
        seed, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return DdaStarterMaterializationResult(
        resultManifestHash=hashlib.sha256(encoded).hexdigest(),
        complete=True,
        aiUsed=False,
        freshnessState="FRESH",
    )
