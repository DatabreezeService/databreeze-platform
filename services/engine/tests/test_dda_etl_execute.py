from __future__ import annotations

import json
from pathlib import Path

import pytest

from databreeze_engine.processors.dda_etl_execute import (
    DdaEtlExecuteError,
    execute_etl,
    execute_messy_sales_golden,
)

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


def test_execute_rejects_arbitrary_code() -> None:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    with pytest.raises(DdaEtlExecuteError) as error:
        execute_etl(
            rows=[{"name": "A"}],
            transformations=payload["transformations"],
            input_artifact_version_id="00000000-0000-4000-8000-000000000012",
        )
    assert error.value.code == "DDA_ETL_ARBITRARY_CODE"


def test_messy_sales_golden_has_fixed_counts_hashes_and_lineage() -> None:
    first = execute_messy_sales_golden()
    second = execute_messy_sales_golden()
    assert first.rowCount == 4
    assert first.rejectedCount == 1
    assert first.rejectBundleId is not None
    assert first.partial is False
    assert first.lineageIds[0] == "00000000-0000-4000-8000-000000000012"
    assert first.contentHash == second.contentHash
    assert first.schemaHash == second.schemaHash
    assert first.quality["completeness_denominator"] == 5
    assert "percentage correct" not in first.model_dump_json().lower()


def test_partial_output_fails_closed() -> None:
    with pytest.raises(DdaEtlExecuteError) as error:
        execute_etl(
            rows=[{"name": "A", "_reject": False}],
            transformations=[{"kind": "TRIM_TEXT", "config": {"field": "name"}}],
            input_artifact_version_id="00000000-0000-4000-8000-000000000012",
            force_partial=True,
        )
    assert error.value.code == "DDA_ETL_PARTIAL_OUTPUT"
