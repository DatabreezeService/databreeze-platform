"""Content-free deterministic primitives for the Folder Autopilot local executor."""

from __future__ import annotations

import hashlib
import json

from ..folder_autopilot_contracts import (
    MAX_AUTOPILOT_FILE_BYTES,
    ActionType,
    CollisionPolicy,
    FileObservation,
)


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
        raise ValueError("INVALID_OBSERVATION") from error


__all__ = [
    "MAX_AUTOPILOT_FILE_BYTES",
    "ActionType",
    "CollisionPolicy",
    "FileObservation",
    "build_file_observation",
    "fingerprint_bytes",
]
