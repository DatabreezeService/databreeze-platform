from __future__ import annotations

import hashlib

import pytest

from databreeze_engine.processors.folder_autopilot import (
    FileObservation,
    build_file_observation,
    fingerprint_bytes,
)


def test_fingerprint_and_observation_are_deterministic_and_content_free() -> None:
    content = b"invoice content"
    fingerprint = fingerprint_bytes(content)
    first = build_file_observation(
        observation_id="obs-001",
        display_name="Hóa đơn 01.xlsx",
        size_bytes=len(content),
        modified_at_ns="123",
        content_sha256=fingerprint,
    )
    second = build_file_observation(
        observation_id="obs-001",
        display_name="Hóa đơn 01.xlsx",
        size_bytes=len(content),
        modified_at_ns="123",
        content_sha256=hashlib.sha256(content).hexdigest(),
    )

    assert first == second
    assert first.stableExecutionKey == second.stableExecutionKey
    assert first.contentSha256 == fingerprint
    assert "path" not in first.model_dump()
    assert "content" not in first.model_dump()


def test_observation_key_changes_when_fingerprint_or_timestamp_changes() -> None:
    base = build_file_observation(
        observation_id="obs-001",
        display_name="report.csv",
        size_bytes=4,
        modified_at_ns="10",
        content_sha256="a" * 64,
    )
    changed_content = build_file_observation(
        observation_id="obs-001",
        display_name="report.csv",
        size_bytes=4,
        modified_at_ns="10",
        content_sha256="b" * 64,
    )
    changed_time = build_file_observation(
        observation_id="obs-001",
        display_name="report.csv",
        size_bytes=4,
        modified_at_ns="11",
        content_sha256="a" * 64,
    )

    assert base.stableExecutionKey != changed_content.stableExecutionKey
    assert base.stableExecutionKey != changed_time.stableExecutionKey


@pytest.mark.parametrize(
    "name", ["..", ".", "nested\\file.csv", "nested/file.csv", "line\nfeed.csv"]
)
def test_observation_rejects_path_like_or_control_names(name: str) -> None:
    with pytest.raises(ValueError, match="INVALID_OBSERVATION"):
        build_file_observation(
            observation_id="obs-001",
            display_name=name,
            size_bytes=1,
            modified_at_ns="1",
            content_sha256="a" * 64,
        )


def test_observation_rejects_invalid_fingerprint_and_bounds() -> None:
    with pytest.raises(ValueError):
        build_file_observation(
            observation_id="obs-001",
            display_name="report.csv",
            size_bytes=512 * 1024 * 1024 + 1,
            modified_at_ns="1",
            content_sha256="not-a-digest",
        )

    with pytest.raises(ValueError):
        FileObservation.model_validate(
            {
                "observationId": "obs-001",
                "displayName": "report.csv",
                "sizeBytes": 1,
                "modifiedAtNs": "1",
                "contentSha256": "a" * 64,
                "stableExecutionKey": "b" * 64,
                "path": "C:\\secret",
            }
        )


def test_observation_normalizes_invalid_timestamp_key_failures() -> None:
    with pytest.raises(ValueError, match="INVALID_OBSERVATION"):
        build_file_observation(
            observation_id="obs-001",
            display_name="report.csv",
            size_bytes=1,
            modified_at_ns="not-a-number",
            content_sha256="a" * 64,
        )
