"""Deterministic DDA materialization query processor (DDA-031).

Computes a content-free result-manifest identity from authorized input selector
hashes. Event payload values are never accepted as authority.
"""

from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr

RecomputeMode = Literal["INCREMENTAL", "FULL"]
StarterFreshnessState = Literal["FRESH", "STALE", "SOURCE_UNAVAILABLE", "BLOCKED"]
AllowedStarterWidget = Literal["KPI", "TABLE", "BAR", "LINE", "AREA", "DONUT", "TEXT_EVIDENCE"]


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
