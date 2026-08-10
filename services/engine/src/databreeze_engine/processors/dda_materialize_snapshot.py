"""Deterministic DDA snapshot assembly processor (DDA-032).

Assembles a content-free snapshot identity only when every materialization
manifest is verified against one compatible input/definition/permission set.
"""

from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr


class MaterializationManifestRef(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    materializationId: StrictStr = Field(min_length=1, max_length=128)
    resultManifestHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    cacheIdentityHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    datasetVersionId: StrictStr = Field(min_length=1, max_length=128)
    permissionProjectionVersionId: StrictStr = Field(min_length=1, max_length=128)
    verified: StrictBool


class DdaMaterializeSnapshotInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    dashboardVersionId: StrictStr = Field(min_length=1, max_length=128)
    inputSelectorHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    materializations: tuple[MaterializationManifestRef, ...] = Field(min_length=1, max_length=256)


class DdaMaterializeSnapshotResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    snapshotIdentityHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    complete: StrictBool
    reason: StrictStr


class DdaMaterializeSnapshotError(ValueError):
    def __init__(
        self,
        code: Literal[
            "INCOMPLETE_MATERIALIZATION_SET",
            "MIXED_INPUT_SET",
            "MIXED_PERMISSION_PROJECTION",
        ],
    ) -> None:
        super().__init__(code)
        self.code = code


def materialize_snapshot(parameters: DdaMaterializeSnapshotInput) -> DdaMaterializeSnapshotResult:
    if any(not item.verified for item in parameters.materializations):
        raise DdaMaterializeSnapshotError("INCOMPLETE_MATERIALIZATION_SET")

    dataset_versions = {item.datasetVersionId for item in parameters.materializations}
    if len(dataset_versions) > 1:
        raise DdaMaterializeSnapshotError("MIXED_INPUT_SET")

    permissions = {item.permissionProjectionVersionId for item in parameters.materializations}
    if len(permissions) > 1:
        raise DdaMaterializeSnapshotError("MIXED_PERMISSION_PROJECTION")

    seed = {
        "dashboardVersionId": parameters.dashboardVersionId,
        "inputSelectorHash": parameters.inputSelectorHash,
        "materializations": sorted(
            (
                {
                    "materializationId": item.materializationId,
                    "resultManifestHash": item.resultManifestHash,
                    "cacheIdentityHash": item.cacheIdentityHash,
                    "datasetVersionId": item.datasetVersionId,
                    "permissionProjectionVersionId": item.permissionProjectionVersionId,
                }
                for item in parameters.materializations
            ),
            key=lambda item: item["materializationId"],
        ),
    }
    encoded = json.dumps(
        seed, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return DdaMaterializeSnapshotResult(
        snapshotIdentityHash=hashlib.sha256(encoded).hexdigest(),
        complete=True,
        reason="ATOMIC_COMPLETE_SET",
    )
