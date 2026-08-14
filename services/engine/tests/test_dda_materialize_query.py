from __future__ import annotations

import pytest
from pydantic import ValidationError

from databreeze_engine.processors.dda_materialize_query import (
    DdaMaterializeQueryError,
    DdaMaterializeQueryInput,
    DdaWidgetMaterializationInput,
    materialize_query,
    materialize_widget_result,
)


def _input(**overrides: object) -> DdaMaterializeQueryInput:
    payload = {
        "materializationDefinitionId": "00000000-0000-4000-8000-000000000001",
        "cacheIdentityHash": "a" * 64,
        "inputSelectorHash": "b" * 64,
        "permissionProjectionVersionId": "00000000-0000-4000-8000-000000000002",
        "engineVersion": "engine-1.0.0",
        "adapterVersion": "adapter-1.0.0",
        "recomputeMode": "FULL",
        "priorStateVerified": False,
    }
    payload.update(overrides)
    return DdaMaterializeQueryInput.model_validate(payload)


def test_full_recompute_is_deterministic_and_complete() -> None:
    first = materialize_query(_input())
    second = materialize_query(_input())
    assert first.complete is True
    assert first.recomputeMode == "FULL"
    assert first.reason == "BOUNDED_FULL_RECOMPUTATION"
    assert first.resultManifestHash == second.resultManifestHash
    assert len(first.resultManifestHash) == 64


def test_incremental_requires_verified_prior_state() -> None:
    with pytest.raises(DdaMaterializeQueryError) as exc:
        materialize_query(
            _input(
                recomputeMode="INCREMENTAL",
                priorStateVerified=False,
                priorResultManifestHash="c" * 64,
            )
        )
    assert exc.value.code == "PRIOR_STATE_REQUIRED"

    result = materialize_query(
        _input(
            recomputeMode="INCREMENTAL",
            priorStateVerified=True,
            priorResultManifestHash="c" * 64,
        )
    )
    assert result.recomputeMode == "INCREMENTAL"
    assert result.reason == "COMPATIBLE_CHANGE_WITH_PRIOR_STATE"


def test_rejects_unknown_payload_authority_fields() -> None:
    with pytest.raises(ValidationError):
        DdaMaterializeQueryInput.model_validate(
            {
                **_input().model_dump(),
                "payloadValues": {"amount": 12},
            }
        )


def test_materializes_bounded_widget_rows_with_exact_deterministic_provenance() -> None:
    parameters = DdaWidgetMaterializationInput.model_validate(
        {
            "widgetId": "00000000-0000-4000-8000-000000000101",
            "planVersionId": "00000000-0000-4000-8000-000000000102",
            "metricVersionId": "00000000-0000-4000-8000-000000000103",
            "datasetVersionId": "00000000-0000-4000-8000-000000000104",
            "unit": "VND",
            "resultState": "READY",
            "maximumRows": 2,
            "rows": [
                {
                    "resultCellId": "00000000-0000-4000-8000-000000000105",
                    "label": "Miền Bắc",
                    "numericValue": 1250000,
                    "evidenceRefs": ["00000000-0000-4000-8000-000000000106"],
                },
                {
                    "resultCellId": "00000000-0000-4000-8000-000000000107",
                    "label": "Miền Nam",
                    "numericValue": 920000.5,
                    "evidenceRefs": [],
                },
            ],
        }
    )

    first = materialize_widget_result(parameters)
    second = materialize_widget_result(parameters)

    assert first == second
    assert first.model_dump(mode="json") == {
        "widgetId": "00000000-0000-4000-8000-000000000101",
        "resultState": "READY",
        "rows": [
            {
                "label": "Miền Bắc",
                "displayValue": "1250000 VND",
                "numericValue": 1250000.0,
                "unit": "VND",
                "provenance": {
                    "resultCellId": "00000000-0000-4000-8000-000000000105",
                    "planVersionId": "00000000-0000-4000-8000-000000000102",
                    "metricVersionId": "00000000-0000-4000-8000-000000000103",
                    "datasetVersionId": "00000000-0000-4000-8000-000000000104",
                    "evidenceRefs": ["00000000-0000-4000-8000-000000000106"],
                },
            },
            {
                "label": "Miền Nam",
                "displayValue": "920000.5 VND",
                "numericValue": 920000.5,
                "unit": "VND",
                "provenance": {
                    "resultCellId": "00000000-0000-4000-8000-000000000107",
                    "planVersionId": "00000000-0000-4000-8000-000000000102",
                    "metricVersionId": "00000000-0000-4000-8000-000000000103",
                    "datasetVersionId": "00000000-0000-4000-8000-000000000104",
                    "evidenceRefs": [],
                },
            },
        ],
    }


def test_widget_materialization_rejects_unbounded_rows_and_client_authority() -> None:
    base = {
        "widgetId": "00000000-0000-4000-8000-000000000101",
        "planVersionId": "00000000-0000-4000-8000-000000000102",
        "metricVersionId": "00000000-0000-4000-8000-000000000103",
        "datasetVersionId": "00000000-0000-4000-8000-000000000104",
        "unit": "VND",
        "resultState": "READY",
        "maximumRows": 1,
        "rows": [
            {
                "resultCellId": "00000000-0000-4000-8000-000000000105",
                "label": "North",
                "numericValue": 1,
                "evidenceRefs": [],
            },
            {
                "resultCellId": "00000000-0000-4000-8000-000000000106",
                "label": "South",
                "numericValue": 2,
                "evidenceRefs": [],
            },
        ],
    }
    with pytest.raises(ValueError, match="WIDGET_RESULT_BOUNDS_EXCEEDED"):
        materialize_widget_result(DdaWidgetMaterializationInput.model_validate(base))

    with pytest.raises(ValidationError):
        DdaWidgetMaterializationInput.model_validate(
            {**base, "rows": [], "tenantScope": {"workspaceId": "hostile"}}
        )
