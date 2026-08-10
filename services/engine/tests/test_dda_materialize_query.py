from __future__ import annotations

import pytest

from databreeze_engine.processors.dda_materialize_query import (
    DdaMaterializeQueryError,
    DdaMaterializeQueryInput,
    materialize_query,
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
    with pytest.raises(Exception):
        DdaMaterializeQueryInput.model_validate(
            {
                **_input().model_dump(),
                "payloadValues": {"amount": 12},
            }
        )
