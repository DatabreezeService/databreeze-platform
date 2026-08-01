from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

import pytest
from databreeze_contracts.v1 import CorrelationMetadata
from pydantic import ValidationError

from databreeze_engine.models import EngineExecutionRequest


def test_execution_request_uses_generated_shared_contracts(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    request = EngineExecutionRequest.model_validate(execution_payload())
    assert isinstance(request.correlation, CorrelationMetadata)
    assert request.requestId == "00000000-0000-4000-8000-000000000001"
    assert request.deadline == "2099-01-01T00:00:00Z"


@pytest.mark.parametrize(
    ("override", "bad_value"),
    [
        ("requestId", 7),
        ("attemptId", "not-a-uuid"),
        ("deadline", "2099-01-01T00:00:00+00:00"),
        ("locale", None),
    ],
)
def test_execution_request_rejects_coercion_invalid_shared_values_and_nulls(
    execution_payload: Callable[..., dict[str, Any]], override: str, bad_value: Any
) -> None:
    with pytest.raises(ValidationError):
        EngineExecutionRequest.model_validate(execution_payload(**{override: bad_value}))


def test_execution_request_rejects_unknown_fields(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    with pytest.raises(ValidationError):
        EngineExecutionRequest.model_validate(execution_payload(command="ignored"))


@pytest.mark.parametrize(
    "parameters",
    [
        {"command": "powershell -Command anything"},
        {"path": r"C:\\private\\source.xlsx"},
        {"url": "https://example.test/private"},
        {"environment": {"TOKEN": "secret"}},
        {"items": [{"key": "x", "value": "\ud800"}]},
        {"items": [{"key": "x", "value": math.nan}]},
        {"items": [{"key": "x", "value": math.inf}]},
    ],
)
def test_parameters_reject_prohibited_or_non_json_shapes(
    execution_payload: Callable[..., dict[str, Any]], parameters: dict[str, Any]
) -> None:
    with pytest.raises(ValidationError):
        EngineExecutionRequest.model_validate(execution_payload(parameters=parameters))


def test_handle_byte_length_rejects_boolean_coercion(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    payload = execution_payload()
    payload["inputHandles"][0]["byteLength"] = True
    with pytest.raises(ValidationError):
        EngineExecutionRequest.model_validate(payload)


def test_execution_request_rejects_oversized_collections(
    execution_payload: Callable[..., dict[str, Any]],
) -> None:
    payload = execution_payload()
    payload["inputHandles"] = payload["inputHandles"] * 33
    with pytest.raises(ValidationError):
        EngineExecutionRequest.model_validate(payload)
