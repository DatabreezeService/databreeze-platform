from __future__ import annotations

import pytest

from databreeze_engine.processors.dda_materialize_query import (
    DdaStarterMaterializationError,
    DdaStarterMaterializationInput,
    materialize_starter_dashboard,
)


def test_starter_materialization_is_deterministic_and_ai_free() -> None:
    payload = DdaStarterMaterializationInput.model_validate(
        {
            "templateId": "starter.sales.timeseries.v1",
            "datasetVersionId": "00000000-0000-4000-8000-000000000701",
            "policyVersionId": "00000000-0000-4000-8000-000000000702",
            "widgetTypes": ["KPI", "LINE", "TABLE"],
            "engineVersion": "engine-1.0.0",
        }
    )
    first = materialize_starter_dashboard(payload)
    second = materialize_starter_dashboard(payload)
    assert first.aiUsed is False
    assert first.complete is True
    assert first.resultManifestHash == second.resultManifestHash
    assert len(first.resultManifestHash) == 64


def test_starter_materialization_rejects_disallowed_widgets() -> None:
    with pytest.raises(DdaStarterMaterializationError) as exc:
        materialize_starter_dashboard(
            DdaStarterMaterializationInput.model_validate(
                {
                    "templateId": "starter.sales.timeseries.v1",
                    "datasetVersionId": "00000000-0000-4000-8000-000000000701",
                    "policyVersionId": "00000000-0000-4000-8000-000000000702",
                    "widgetTypes": ["KPI", "CUSTOM_JS"],
                    "engineVersion": "engine-1.0.0",
                }
            )
        )
    assert exc.value.code == "UNSUPPORTED_WIDGET"


def test_starter_materialization_keeps_last_good_on_partial_refresh() -> None:
    result = materialize_starter_dashboard(
        DdaStarterMaterializationInput.model_validate(
            {
                "templateId": "starter.generic.table.v1",
                "datasetVersionId": "00000000-0000-4000-8000-000000000701",
                "policyVersionId": "00000000-0000-4000-8000-000000000702",
                "widgetTypes": ["TABLE"],
                "engineVersion": "engine-1.0.0",
                "sourceAvailable": False,
                "priorResultManifestHash": "a" * 64,
            }
        )
    )
    assert result.complete is False
    assert result.freshnessState == "SOURCE_UNAVAILABLE"
    assert result.resultManifestHash == "a" * 64
