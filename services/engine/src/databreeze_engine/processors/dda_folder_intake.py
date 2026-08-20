"""Typed Desktop folder-intake helpers (DDA-014).

Known compatible CSV/XLSX fingerprints may be admitted against a manifest-pinned
schema. Unfamiliar schemas are quarantined. This module does not mutate sources.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

Disposition = Literal["ADMITTED", "QUARANTINE"]
Reason = Literal[
    "UNSUPPORTED_PROFILE",
    "SCHEMA_DRIFT",
    "MALFORMED_CONTENT",
    "PATH_ESCAPE",
]
Profile = Literal["CSV", "XLSX"]


class FolderIntakeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    relativePath: StrictStr = Field(min_length=1, max_length=512)
    profile: StrictStr
    schemaFingerprint: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    contentFingerprint: StrictStr = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    pinnedSchemaFingerprints: tuple[StrictStr, ...] = Field(min_length=1, max_length=32)
    supportedProfiles: tuple[StrictStr, ...] = Field(min_length=1, max_length=16)
    sizeBytes: StrictInt = Field(ge=0, le=64 * 1024 * 1024)


class FolderIntakeResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    disposition: Disposition
    reason: Reason | None = None
    profile: Profile | None = None
    contentFingerprint: StrictStr | None = None
    decisionHash: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")


def _decision_hash(payload: Mapping[str, object]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def admit_folder_file(request: FolderIntakeRequest) -> FolderIntakeResult:
    """Admit only manifest-pinned profiles/schemas; quarantine unfamiliar inputs."""
    relative = request.relativePath.replace("\\", "/")
    if relative.startswith("../") or "/../" in f"/{relative}/" or relative.startswith("/"):
        payload = {"disposition": "QUARANTINE", "reason": "PATH_ESCAPE"}
        return FolderIntakeResult(
            disposition="QUARANTINE",
            reason="PATH_ESCAPE",
            decisionHash=_decision_hash(payload),
        )

    if request.profile not in request.supportedProfiles or request.profile not in {"CSV", "XLSX"}:
        payload = {"disposition": "QUARANTINE", "reason": "UNSUPPORTED_PROFILE"}
        return FolderIntakeResult(
            disposition="QUARANTINE",
            reason="UNSUPPORTED_PROFILE",
            decisionHash=_decision_hash(payload),
        )

    if request.schemaFingerprint not in request.pinnedSchemaFingerprints:
        payload = {
            "disposition": "QUARANTINE",
            "reason": "SCHEMA_DRIFT",
            "schemaFingerprint": request.schemaFingerprint,
        }
        return FolderIntakeResult(
            disposition="QUARANTINE",
            reason="SCHEMA_DRIFT",
            decisionHash=_decision_hash(payload),
        )

    if request.sizeBytes == 0:
        payload = {"disposition": "QUARANTINE", "reason": "MALFORMED_CONTENT"}
        return FolderIntakeResult(
            disposition="QUARANTINE",
            reason="MALFORMED_CONTENT",
            decisionHash=_decision_hash(payload),
        )

    payload = {
        "disposition": "ADMITTED",
        "profile": request.profile,
        "contentFingerprint": request.contentFingerprint,
        "schemaFingerprint": request.schemaFingerprint,
    }
    return FolderIntakeResult(
        disposition="ADMITTED",
        profile=request.profile,  # type: ignore[arg-type]
        contentFingerprint=request.contentFingerprint,
        decisionHash=_decision_hash(payload),
    )
