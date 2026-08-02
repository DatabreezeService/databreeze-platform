from __future__ import annotations

from databreeze_engine.processors.dataset_profile import profile_records
from databreeze_engine.processors.dataset_quality import (
    evaluate_required_fields,
    profile_fingerprint,
)


def test_required_quality_is_deterministic_and_value_free() -> None:
    profile = profile_records(
        [{"amount": 0}, {"amount": None}, {"amount": 2}],
        ["amount"],
    )
    result = evaluate_required_fields(
        profile,
        [
            {
                "ruleId": "00000000-0000-4000-8000-000000000001",
                "field": "amount",
                "severity": "WARNING",
            }
        ],
    )
    assert result.qualityState == "PASS_WITH_WARNINGS"
    assert result.findings[0].occurrenceCount == 1
    assert "amount" not in result.findings[0].detailHash
    assert profile_fingerprint(profile) == result.profileFingerprint


def test_missing_profiled_field_is_disclosed_and_error_blocks() -> None:
    profile = profile_records([{"code": "A"}], ["code"])
    result = evaluate_required_fields(
        profile,
        [
            {
                "ruleId": "00000000-0000-4000-8000-000000000002",
                "field": "amount",
                "severity": "ERROR",
            }
        ],
    )
    assert result.qualityState == "BLOCKED"
    assert result.findings[0].messageCode == "FIELD_NOT_PROFILED"
    assert result.findings[0].occurrenceCount == 1


def test_invalid_rule_shape_fails_closed() -> None:
    profile = profile_records([{"code": "A"}], ["code"])
    try:
        evaluate_required_fields(profile, [{"field": "code"}])
    except ValueError as error:
        assert str(error) == "required rules need a ruleId and field"
    else:
        raise AssertionError("invalid rule should fail")
