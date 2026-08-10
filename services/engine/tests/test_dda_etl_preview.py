from __future__ import annotations

import json
from pathlib import Path

import pytest

from databreeze_engine.processors.dda_etl_preview import DdaEtlPreviewError, preview_etl

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "test"
    / "fixtures"
    / "dda"
    / "v1"
    / "invalid-arbitrary-code.json"
)


def test_preview_rejects_arbitrary_code_from_frozen_fixture() -> None:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    with pytest.raises(DdaEtlPreviewError) as error:
        preview_etl(
            rows=[{"name": "A"}],
            transformations=payload["transformations"],
            assumptions=[],
        )
    assert error.value.code == "DDA_ETL_ARBITRARY_CODE"


def test_preview_returns_schemas_counts_and_disclosed_sampling() -> None:
    result = preview_etl(
        rows=[{"name": " A ", "amount": "1"}, {"name": "B", "amount": "2"}],
        transformations=[
            {
                "kind": "TRIM_TEXT",
                "config": {"field": "name"},
            }
        ],
        assumptions=["trim name"],
        sampling_disclosed=True,
    )
    assert result.sourceSchema == ("name", "amount")
    assert result.orderedSteps == ("TRIM_TEXT",)
    assert result.counts.changed >= 1
    assert result.samplingDisclosed is True
    assert result.evidenceStatus == "AVAILABLE"


def test_undisclosed_sampling_fails() -> None:
    with pytest.raises(DdaEtlPreviewError) as error:
        preview_etl(
            rows=[{"name": "A"}],
            transformations=[{"kind": "TRIM_TEXT", "config": {"field": "name"}}],
            assumptions=[],
            sampling_disclosed=False,
        )
    assert error.value.code == "DDA_ETL_UNDISCLOSED_SAMPLING"
