"""Content-free deterministic primitives for the Folder Autopilot local executor."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator

MAX_AUTOPILOT_FILE_BYTES = 10 * 1024 * 1024 * 1024
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")


def _invalid() -> ValueError:
    return ValueError("INVALID_OBSERVATION")


class FileObservation(BaseModel):
    """A bounded, value-free identity for one locally observed file."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    observationId: StrictStr
    displayName: StrictStr = Field(min_length=1, max_length=255)
    sizeBytes: StrictInt = Field(ge=0, le=MAX_AUTOPILOT_FILE_BYTES)
    modifiedAtNs: StrictInt = Field(ge=0)
    contentSha256: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")
    stableExecutionKey: StrictStr = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("observationId")
    @classmethod
    def validate_observation_id(cls, value: str) -> str:
        if _SAFE_ID.fullmatch(value) is None:
            raise _invalid()
        return value

    @field_validator("displayName")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        if (
            value in {".", ".."}
            or "/" in value
            or "\\" in value
            or any(ord(character) < 32 or ord(character) == 127 for character in value)
        ):
            raise _invalid()
        return value

    @field_validator("contentSha256", "stableExecutionKey")
    @classmethod
    def validate_digest(cls, value: str) -> str:
        if _DIGEST.fullmatch(value) is None:
            raise _invalid()
        return value


def fingerprint_bytes(content: bytes) -> str:
    """Return a lowercase SHA-256 fingerprint without retaining the bytes."""
    if not isinstance(content, bytes):
        raise ValueError("INVALID_OBSERVATION")
    return hashlib.sha256(content).hexdigest()


def _stable_execution_key(
    *,
    observation_id: str,
    display_name: str,
    size_bytes: int,
    modified_at_ns: int,
    content_sha256: str,
) -> str:
    canonical = json.dumps(
        {
            "contentSha256": content_sha256,
            "displayName": display_name,
            "modifiedAtNs": modified_at_ns,
            "observationId": observation_id,
            "sizeBytes": size_bytes,
        },
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def build_file_observation(
    *,
    observation_id: str,
    display_name: str,
    size_bytes: int,
    modified_at_ns: int,
    content_sha256: str,
) -> FileObservation:
    """Build an immutable observation and derive its idempotency key."""
    stable_key = _stable_execution_key(
        observation_id=observation_id,
        display_name=display_name,
        size_bytes=size_bytes,
        modified_at_ns=modified_at_ns,
        content_sha256=content_sha256,
    )
    try:
        return FileObservation(
            observationId=observation_id,
            displayName=display_name,
            sizeBytes=size_bytes,
            modifiedAtNs=modified_at_ns,
            contentSha256=content_sha256,
            stableExecutionKey=stable_key,
        )
    except Exception as error:
        raise _invalid() from error


ActionType = Literal["INSPECT", "VALIDATE", "RENAME", "COPY", "MOVE"]
CollisionPolicy = Literal["REVIEW", "SKIP", "UNIQUE_NAME"]
