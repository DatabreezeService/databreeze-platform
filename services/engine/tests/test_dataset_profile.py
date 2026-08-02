from __future__ import annotations

import math

import pytest

from databreeze_engine.processors.dataset_profile import profile_records


def test_profile_distinguishes_missing_null_blank_zero_and_not_applicable() -> None:
    result = profile_records(
        [
            {"amount": 0, "status": "ok"},
            {"amount": None, "status": "N/A"},
            {"amount": "  ", "status": "[REDACTED]"},
            {"status": "ok"},
        ],
        ["amount", "status"],
    )
    amount = result.fields[0]
    status = result.fields[1]
    assert amount.stateCounts == {
        "MISSING": 1,
        "NULL": 1,
        "BLANK": 1,
        "INVALID": 0,
        "ZERO": 1,
        "NOT_APPLICABLE": 0,
        "REDACTED": 0,
        "VALUE": 0,
    }
    assert status.stateCounts["NOT_APPLICABLE"] == 1
    assert status.stateCounts["REDACTED"] == 1
    assert result.sampled is False
    assert "ok" not in status.valueFingerprint


def test_profile_is_deterministic_and_discloses_sampling() -> None:
    rows = [{"code": "B"}, {"code": "A"}, {"code": "B"}]
    first = profile_records(rows, ["code"], max_rows=2, sample_seed=7)
    second = profile_records(
        [{"code": "C"}, {"code": "A"}, {"code": "B"}],
        ["code"],
        max_rows=2,
        sample_seed=7,
    )
    assert first.rowCountScanned == 2
    assert first.sourceRowCount == 3
    assert first.sampled is True
    assert first.sampleSeed == 7
    assert first.fields[0].valueFingerprint != second.fields[0].valueFingerprint


def test_profile_rejects_unbounded_or_non_finite_values_without_leaking_them() -> None:
    result = profile_records([{"amount": math.nan}], ["amount"])
    assert result.fields[0].stateCounts["VALUE"] == 1
    with pytest.raises(ValueError):
        profile_records([], [])
