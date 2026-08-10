from __future__ import annotations

from databreeze_engine.processors.dda_etl_profile import profile_quality


def test_quality_dimensions_are_separate_and_never_percentage_correct() -> None:
    result = profile_quality(
        row_count=3,
        non_null_required=3,
        valid_count=3,
        unique_key_count=3,
        expected_unique=3,
        schema_compatible=True,
        freshness_known=True,
        extraction_bound=True,
        rejected_count=0,
    )
    names = sorted(item.dimension for item in result.dimensions)
    assert names == [
        "completeness",
        "consistency",
        "extraction_confidence",
        "freshness",
        "uniqueness",
        "validity",
    ]
    assert result.overall is not None
    assert result.overall.provesFactualCorrectness is False
    payload = result.model_dump_json()
    assert "percentage correct" not in payload.lower()
    assert "% correct" not in payload.lower()
    for item in result.dimensions:
        assert item.denominator >= 0
        assert item.coverage >= 0
        assert item.rule
        assert item.expectation
        assert item.sampleState in {"FULL", "PARTIAL", "NONE"}
        assert isinstance(item.limitations, tuple)


def test_rejected_rows_block_complete_gate_eligibility() -> None:
    result = profile_quality(
        row_count=3,
        non_null_required=2,
        valid_count=2,
        unique_key_count=2,
        expected_unique=3,
        schema_compatible=True,
        freshness_known=True,
        extraction_bound=True,
        rejected_count=1,
    )
    assert all(item.completeGateEligible is False for item in result.dimensions)
